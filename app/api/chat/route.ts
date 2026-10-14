import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chatSystemPrompt,
  visionSystemPrompt,
  uiGeneratorSystemPrompt,
} from "@/lib/prompts";
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

function isUIRequest(text: string): boolean {
  const t = text.toLowerCase();

  const uiKeywords = [
    "landing page", "ui", "ux", "html", "css", "tailwind",
    "komponen", "component", "halaman", "page", "website",
    "form", "dashboard", "kanban", "board", "chat ui",
    "navbar", "hero", "footer", "modal", "card", "layout",
    "responsive", "wireframe", "mockup", "prototype",
    "multi-step", "multistep", "carousel", "slider",
    "kalkulator", "calculator", "todo", "notes", "timer",
    "pomodoro", "tictactoe", "game", "portofolio", "portfolio",
    "resume", "cv", "profile", "profil",
  ];

  const actionKeywords = [
    "buatkan", "buat", "create", "generate", "design", "rancang", "bikin",
  ];

  const hasUIKeyword = uiKeywords.some((kw) => t.includes(kw));
  const hasActionKeyword = actionKeywords.some((kw) => t.includes(kw));

  if (hasUIKeyword && hasActionKeyword) return true;

  const uiKeywordCount = uiKeywords.filter((kw) => t.includes(kw)).length;
  if (uiKeywordCount >= 3) return true;

  if (t.includes("fitur:") && (t.includes("-") || t.includes("•"))) {
    return hasUIKeyword;
  }

  if (
    t.length < 40 &&
    (t.includes("ui") || t.includes("generate") || t.includes("lanjut"))
  ) {
    return hasActionKeyword;
  }

  return false;
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
  if (!cfg || !cfg.apiKey) {
    return new Response(
      JSON.stringify({ error: "Provider/API key belum diisi" }),
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
  const lastContentText = typeof last.content === "string" ? last.content : "";
  const isUI = !isVision && isUIRequest(lastContentText);
  const modelList = isVision ? cfg.modelsVision : cfg.modelsText;

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[chat] isUIRequest("${lastContentText.slice(0, 60)}...") = ${isUI}`
    );
    console.log(`[chat] lastContentText.length = ${lastContentText.length}`);
  }

  console.log(
    `[chat] mode: ${isVision ? "vision" : isUI ? "ui-generator" : "teks"} · kandidat: ${modelList.join(", ")}`
  );

  const systemPrompt = isVision
    ? visionSystemPrompt()
    : isUI
      ? uiGeneratorSystemPrompt()
      : chatSystemPrompt();

  // Saat mode UI, kirim HANYA user message terakhir
  const messagesToSend = isUI
    ? [{ role: last.role, content: last.content }]
    : messages;

  const payloadBase = {
    stream: true,
    temperature: isVision ? 0.2 : isUI ? 0.1 : 0.7,
    // 🔥 max_tokens lebih besar untuk UI (HTML panjang)
    max_tokens: isUI ? 8192 : 4096,
    messages: [
      { role: "system", content: systemPrompt },
      ...messagesToSend,
    ],
  };

  let upstream: Response | null = null;
  let usedModel = "";
  let lastError = "";
  let lastStatus = 0;

  for (const model of modelList) {
    try {
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
      lastError = `[${res.status}] ${detail.slice(0, 200)}`;
      lastStatus = res.status;
      console.warn(
        `[chat] model "${model}" gagal: ${res.status}. Coba berikutnya…`
      );
      if (res.status === 401 || res.status === 403) break;
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      lastError = `[network] ${err?.message ?? "unknown"}`;
      console.warn(`[chat] model "${model}" error jaringan: ${err?.message}`);
    }
  }

  if (!upstream || !upstream.body) {
    let userMessage = "Semua model gagal. Coba lagi nanti.";
    if (lastStatus === 429)
      userMessage = "Kuota gratis sedang penuh. Tunggu sebentar.";
    if (lastStatus === 0)
      userMessage = "Koneksi ke provider AI gagal. Coba lagi.";
    return new Response(
      JSON.stringify({
        error: "upstream",
        status: lastStatus,
        detail: lastError || userMessage,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

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
            } catch {}
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
      "X-Mode": isVision ? "vision" : isUI ? "ui" : "text",
    },
  });
}