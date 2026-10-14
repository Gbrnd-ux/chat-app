import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chatSystemPrompt,
  visionSystemPrompt,
  uiGeneratorSystemPrompt,
} from "@/lib/prompts";
import { runEnvCheckOnce } from "@/lib/env-check";
import { getProviderConfig, type ProviderName } from "@/lib/providers";

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
    "resume", "cv", "profile", "profil", "fotografer", "photographer",
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

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limit" }), {
      status: 429,
      headers: { "Retry-After": "20" },
    });
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

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[chat] isUIRequest("${lastContentText.slice(0, 60)}...") = ${isUI}`
    );
    console.log(`[chat] lastContentText.length = ${lastContentText.length}`);
    console.log(
      `[chat] mode: ${isVision ? "vision" : isUI ? "ui-generator" : "teks"}`
    );
  }

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
    // 🔥 max_tokens: Gemini 2.5 Flash-Lite support hingga 8192 output,
    // tapi kalau kita kirim 16000, provider akan auto-cap ke max mereka.
    // Nilai tinggi aman karena provider yang batasi.
    max_tokens: isUI ? 16000 : 4096,
    messages: [
      { role: "system", content: systemPrompt },
      ...messagesToSend,
    ],
  };

  // ── RANTAI FALLBACK LINTAS-PENYEDIA + ROTASI API KEY ──
  const providerChain: ProviderName[] = ["gemini", "openrouter"];

  let upstream: Response | null = null;
  let usedModel = "";
  let usedProvider = "";
  let lastError = "";
  let lastStatus = 0;

  outerLoop: for (const providerName of providerChain) {
    const cfg = getProviderConfig(providerName);
    if (!cfg || cfg.apiKeys.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[chat] provider "${providerName}" dilewati: API key tidak ada`);
      }
      continue;
    }

    const modelList = isVision ? cfg.modelsVision : cfg.modelsText;
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[chat] provider: ${providerName} · ${cfg.apiKeys.length} key · kandidat: ${modelList.join(", ")}`
      );
    }

    for (const model of modelList) {
      for (let i = 0; i < cfg.apiKeys.length; i++) {
        const apiKey = cfg.apiKeys[i];
        const keyLabel = `${providerName}[key-${i + 1}/${cfg.apiKeys.length}]`;

        try {
          const res = await fetch(cfg.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              ...(cfg.extraHeaders ?? {}),
            },
            body: JSON.stringify({ ...payloadBase, model }),
            signal: req.signal,
          });

          if (res.ok && res.body) {
            upstream = res;
            usedModel = model;
            usedProvider = `${providerName}#${i + 1}`;
            if (process.env.NODE_ENV !== "production") {
              console.log(`[chat] ✅ sukses dengan ${keyLabel} · ${model}`);
            }
            break outerLoop;
          }

          const detail = await res.text().catch(() => "");
          lastError = `[${keyLabel}/${model}] ${res.status} ${detail.slice(0, 150)}`;
          lastStatus = res.status;
          if (process.env.NODE_ENV !== "production") {
            console.warn(
              `[chat] ❌ ${keyLabel}/${model} gagal: ${res.status} — ${detail.slice(0, 300)}`
            );
          }
          continue;
        } catch (err: any) {
          if (err?.name === "AbortError") throw err;
          lastError = `[${keyLabel}/${model}] network: ${err?.message ?? "unknown"}`;
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[chat] ⚠️ ${keyLabel}/${model} error: ${err?.message}`);
          }
        }
      }
    }
  }

  if (!upstream || !upstream.body) {
    console.error("[chat] semua model gagal:", lastError);

    let userMessage = "Maaf, layanan sedang sibuk. Coba lagi sebentar lagi.";
    if (lastStatus === 429)
      userMessage = "Terlalu banyak permintaan. Tunggu sebentar ya.";
    if (lastStatus === 0)
      userMessage = "Koneksi bermasalah. Cek internetmu dan coba lagi.";

    return new Response(JSON.stringify({ error: userMessage }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
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
              const delta = json.choices?.[0]?.delta?.content;
              const finishReason = json.choices?.[0]?.finish_reason;

              if (delta) controller.enqueue(encoder.encode(delta));

              // 🔥 Kalau finish_reason = "length" → kirim marker khusus
              // Frontend akan tahu bahwa output terpotong
              if (finishReason === "length") {
                if (process.env.NODE_ENV !== "production") {
                  console.warn(`[chat] ⚠️ output terpotong (finish_reason: length)`);
                }
                // Kirim marker tersembunyi (tidak akan muncul di UI)
                controller.enqueue(
                  encoder.encode("\n<!--__TRUNCATED__-->\n")
                );
              }
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
    },
  });
}