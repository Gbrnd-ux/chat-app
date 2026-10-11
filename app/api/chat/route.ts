import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { chatSystemPrompt, visionSystemPrompt } from "@/lib/prompts";
import { runEnvCheckOnce } from "@/lib/env-check";
export const maxDuration = 60;
runEnvCheckOnce();

const MAX_INPUT_CHARS = 8000;
const MAX_MESSAGES = 40;

type MsgContent =
  | string
  | Array<{ type: string; text?: string; image_url?: { url: string } }>;
type Msg = { role: "user" | "assistant" | "system"; content: MsgContent };

function textLength(content: MsgContent): number {
  if (typeof content === "string") return content.length;
  return content.reduce((sum, part) => sum + (part.text?.length ?? 0), 0);
}

function hasImage(content: MsgContent): boolean {
  if (typeof content === "string") return false;
  return content.some((part) => part.type === "image_url" && part.image_url?.url);
}

type ProviderConfig = {
  url: string;
  apiKey: string | undefined;
  modelsText: string[];
  modelsVision: string[];
  extraHeaders?: Record<string, string>;
};

function getProviderConfig(): ProviderConfig | null {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase();
  const override = process.env.AI_MODEL?.trim();

  const withOverride = (defaults: string[]) =>
    override ? [override, ...defaults.filter((m) => m !== override)] : defaults;

  switch (provider) {
    case "grok":
      return {
        url: "https://api.x.ai/v1/chat/completions",
        apiKey: process.env.GROK_API_KEY,
        modelsText: withOverride(["grok-3-mini", "grok-3", "grok-2-1212"]),
        modelsVision: withOverride(["grok-3-mini", "grok-3"]),
      };

    case "gemini":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        apiKey: process.env.GEMINI_API_KEY,
        modelsText: withOverride([
          "gemini-3.1-flash-lite",
          "gemini-3.5-flash-lite",
          "gemini-2.5-flash-lite",
          "gemini-flash-lite-latest",
        ]),
        modelsVision: withOverride([
          "gemini-3.1-flash-lite",
          "gemini-3.5-flash-lite",
          "gemini-2.5-flash-lite",
          "gemini-flash-lite-latest",
        ]),
      };

    case "openrouter":
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: process.env.OPENROUTER_API_KEY,
        modelsText: withOverride([
          "google/gemini-2.5-flash",
          "google/gemini-2.0-flash-001",
        ]),
        modelsVision: withOverride([
          "google/gemini-2.5-flash",
          "google/gemini-2.0-flash-001",
        ]),
        extraHeaders: {
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Chat Streaming App",
        },
      };

    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limit" }), {
      status: 429,
      headers: { "Retry-After": "20" },
    });
  }

  const cfg = getProviderConfig();
  if (!cfg) {
    return new Response(
      JSON.stringify({ error: "AI_PROVIDER tidak dikenal" }),
      { status: 500 }
    );
  }
  if (!cfg.apiKey) {
    return new Response(
      JSON.stringify({
        error: `API key untuk provider "${process.env.AI_PROVIDER}" belum diisi di .env.local`,
      }),
      { status: 500 }
    );
  }

  let body: { messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = body.messages ?? [];
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES
  ) {
    return new Response("Bad messages", { status: 400 });
  }

  const last = messages[messages.length - 1];
  if (textLength(last.content) > MAX_INPUT_CHARS) {
    return new Response("Input too long", { status: 413 });
  }

  const isVision = hasImage(last.content);
  const modelList = isVision ? cfg.modelsVision : cfg.modelsText;

  console.log(
    `[chat] mode: ${isVision ? "vision (ada gambar)" : "teks"} · kandidat: ${modelList.join(", ")}`
  );

  const systemPrompt = isVision ? visionSystemPrompt() : chatSystemPrompt();

  const payloadBase = {
    stream: true,
    temperature: isVision ? 0.2 : 0.7,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  };

  let upstream: Response | null = null;
  let usedModel = "";
  let lastError = "";
  let lastStatus = 0;

  for (const model of modelList) {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
        ...(cfg.extraHeaders ?? {}),
      },
      body: JSON.stringify({ ...payloadBase, model }),
      signal: req.signal,
    });

    if (res.ok && res.body) {
      upstream = res;
      usedModel = model;
      break;
    }

    const detail = await res.text().catch(() => "");
    lastError = `[${res.status}] ${detail}`;
    lastStatus = res.status;

    console.warn(
      `[chat] model "${model}" gagal: ${res.status}. Coba berikutnya…`
    );

    if (res.status === 401 || res.status === 403) break;
  }

  if (!upstream || !upstream.body) {
    let userMessage = "Semua model gagal. Coba lagi nanti.";
    if (lastStatus === 429) {
      userMessage =
        "Kuota gratis sedang penuh (rate limit). Tunggu sebentar lalu coba lagi.";
    }

    console.error("[chat] semua model gagal:", lastError);
    return new Response(
      JSON.stringify({
        error: "upstream",
        status: lastStatus,
        detail: lastError || userMessage,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  console.log(`[chat] memakai model: ${usedModel}`);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream!.body!.getReader();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data);
              const token = json.choices?.[0]?.delta?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch {
              // skip malformed chunk
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Model-Used": usedModel,
      "X-Provider-Used": process.env.AI_PROVIDER ?? "gemini",
      "X-Mode": isVision ? "vision" : "text",
    },
  });
}