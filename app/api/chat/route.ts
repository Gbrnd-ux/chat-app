// app/api/chat/route.ts
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chatSystemPrompt,
  visionSystemPrompt,
  uiGeneratorSystemPrompt,
} from "@/lib/prompts";
import { runEnvCheckOnce } from "@/lib/env-check";
import { getProviderConfig, type ProviderName } from "@/lib/providers";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;
runEnvCheckOnce();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_INPUT_CHARS = 8000;
const MAX_MESSAGES = 40;

type MsgContent =
  | string
  | Array<{ type: string; text?: string; image_url?: { url: string } }>;
type Msg = { role: "user" | "assistant" | "system"; content: MsgContent };

/* ========================================================================== */
/* Helpers                                                                     */
/* ========================================================================== */

function textLength(content: MsgContent): number {
  if (typeof content === "string") return content.length;
  return content.reduce((sum, part) => sum + (part.text?.length ?? 0), 0);
}

function hasImage(content: MsgContent): boolean {
  if (typeof content === "string") return false;
  return content.some((part) => part.type === "image_url" && part.image_url?.url);
}

// 🔥 Fungsi RAG dengan Sistem Fallback Ganda
async function getRagContext(query: string) {
  try {
    const keysString = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
    const apiKeys = keysString.split(",").map((k) => k.trim()).filter(Boolean);
    if (apiKeys.length === 0) return "";

    let embedData = null;
    let success = false;

    // 1. Coba gunakan Embedding API
    for (const key of apiKeys) {
      const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: query }] },
            outputDimensionality: 768
          }),
        }
      );

      embedData = await embedRes.json();
      if (embedData && embedData.embedding && embedData.embedding.values) {
        success = true;
        break;
      }
    }

    // 🔥 FALLBACK 1: Jika semua API Key limit, ambil 5 dokumen langsung tanpa Embedding
    if (!success || !embedData.embedding) {
      console.warn("⚠️ [RAG] Embedding API gagal/limit. Fallback ke ambil dokumen langsung...");
      const { data: docs } = await supabase.from('documents').select('content').limit(5);
      return docs && docs.length > 0 ? docs.map((d: any) => d.content).join("\n\n---\n\n") : "";
    }

    // 2. Cari kemiripan di Supabase
    const { data: documents, error } = await supabase.rpc("match_documents", {
      query_embedding: embedData.embedding.values,
      match_threshold: 0.0, 
      match_count: 5,
    });

    // 🔥 FALLBACK 2: Jika pencarian vektor kosong, ambil dokumen langsung
    if (error || !documents || documents.length === 0) {
      console.warn("⚠️ [RAG] Tidak ada dokumen cocok. Fallback ke ambil dokumen langsung...");
      const { data: docs } = await supabase.from('documents').select('content').limit(5);
      return docs && docs.length > 0 ? docs.map((d: any) => d.content).join("\n\n---\n\n") : "";
    }

    console.log(`✅ [RAG] Ditemukan ${documents.length} potongan dokumen via Vektor!`);
    return documents.map((doc: any) => doc.content).join("\n\n---\n\n");
  } catch (error) {
    console.error("❌ [RAG] Catch Error:", error);
    const { data: docs } = await supabase.from('documents').select('content').limit(5);
    return docs && docs.length > 0 ? docs.map((d: any) => d.content).join("\n\n---\n\n") : "";
  }
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
    "pomodoro", "tictactoe", "game", "quiz",
    "portofolio", "portfolio", "resume", "cv", "profile", "profil",
    "fotografer", "photographer", "desainer", "designer",
    "toko online", "shop", "ecommerce", "e-commerce", "menu",
    "restoran", "kafe", "cafe", "coffee",
    "invoice", "struk", "receipt", "formulir", "login", "register",
    "signup", "sign up",
  ];
  const actionKeywords = ["buatkan", "buat", "create", "generate", "design", "rancang", "bikin"];
  const hasUIKeyword = uiKeywords.some((kw) => t.includes(kw));
  const hasActionKeyword = actionKeywords.some((kw) => t.includes(kw));
  if (hasUIKeyword && hasActionKeyword) return true;
  const uiKeywordCount = uiKeywords.filter((kw) => t.includes(kw)).length;
  if (uiKeywordCount >= 3) return true;
  if (t.includes("fitur:") && (t.includes("-") || t.includes("•"))) return hasUIKeyword;
  if (t.length < 40 && (t.includes("ui") || t.includes("generate") || t.includes("lanjut"))) return hasActionKeyword;
  return false;
}

/* ========================================================================== */
/* POST Handler                                                                */
/* ========================================================================== */

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "anon").split(",")[0].trim();

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
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return new Response("Bad messages", { status: 400 });
  }

  const last = messages[messages.length - 1];
  if (textLength(last.content) > MAX_INPUT_CHARS) {
    return new Response("Input too long", { status: 413 });
  }

  const isVision = hasImage(last.content);

  // 🔥 PERBAIKAN UTAMA: Ambil teks meskipun formatnya Array (karena ada lampiran)
  let lastContentText = "";
  if (typeof last.content === "string") {
    lastContentText = last.content;
  } else if (Array.isArray(last.content)) {
    lastContentText = last.content
      .filter((part: any) => part.type === "text" && part.text)
      .map((part: any) => part.text)
      .join(" ");
  }

  const isUI = !isVision && isUIRequest(lastContentText);

  if (process.env.NODE_ENV !== "production") {
    console.log(`[chat] mode: ${isVision ? "vision" : isUI ? "ui-generator" : "teks"}`);
    console.log(`[chat] Teks yang akan dicari ke DB: "${lastContentText}"`);
  }

  let systemPrompt = isVision
    ? visionSystemPrompt()
    : isUI
      ? uiGeneratorSystemPrompt()
      : chatSystemPrompt({
          now: new Date(),
          timeZone: "Asia/Jakarta",
        });

  // 🔥 PANGGIL RAG
  if (!isVision && !isUI && lastContentText.length > 0) {
    const ragContext = await getRagContext(lastContentText);
    
    if (ragContext) {
      systemPrompt += `\n\n=== INFORMASI DARI DOKUMEN USER ===\n${ragContext}\n===================================\n\nINSTRUKSI PENTING: Jawablah pertanyaan user HANYA berdasarkan "INFORMASI DARI DOKUMEN USER" di atas. Abaikan instruksi lain yang bertentangan. Jika informasi benar-benar tidak ada di dokumen, barulah katakan bahwa informasi tersebut tidak ditemukan.`;
      
      if (process.env.NODE_ENV !== "production") {
        console.log("[chat] ✅ RAG Context disisipkan ke System Prompt!");
      }
    } else {
      if (process.env.NODE_ENV !== "production") {
        console.log("[chat] ⚠️ RAG Context kosong.");
      }
    }
  }

  const sanitizeMessages = (msgs: Msg[]) => {
    return msgs.map((msg) => {
      if (typeof msg.content === "string") return msg;
      const validContent = msg.content.filter(
        (part) => !(part.type === "image_url" && (!part.image_url?.url || part.image_url.url === ""))
      );
      if (validContent.length === 0) return { ...msg, content: "[Mengirim dokumen]" };
      return { ...msg, content: validContent };
    });
  };

  const sanitizedMessages = sanitizeMessages(messages);
  const messagesToSend = isUI ? [{ role: last.role, content: last.content }] : sanitizedMessages;

  const payloadBase = {
    stream: true,
    temperature: isVision ? 0.2 : isUI ? 0.1 : 0.7,
    max_tokens: isUI ? 16000 : 4096,
    messages: [{ role: "system", content: systemPrompt }, ...messagesToSend],
  };

  const providerChain: ProviderName[] = ["gemini", "openrouter"];
  let upstream: Response | null = null;
  let lastError = "";
  let lastStatus = 0;

  outerLoop: for (const providerName of providerChain) {
    const cfg = getProviderConfig(providerName);
    if (!cfg || cfg.apiKeys.length === 0) continue;

    const modelList = isVision ? cfg.modelsVision : cfg.modelsText;

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
            if (process.env.NODE_ENV !== "production") {
              console.log(`[chat] ✅ sukses dengan ${keyLabel} · ${model}`);
            }
            break outerLoop;
          }

          const detail = await res.text().catch(() => "");
          lastError = `[${keyLabel}/${model}] ${res.status} ${detail.slice(0, 150)}`;
          lastStatus = res.status;
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[chat] ❌ ${keyLabel}/${model} gagal: ${res.status}`);
          }
          continue;
        } catch (err: any) {
          if (err?.name === "AbortError") throw err;
          lastError = `[${keyLabel}/${model}] network: ${err?.message ?? "unknown"}`;
        }
      }
    }
  }

  if (!upstream || !upstream.body) {
    console.error("[chat] semua model gagal:", lastError);
    let userMessage = "Maaf, layanan sedang sibuk. Coba lagi sebentar lagi.";
    if (lastStatus === 429) userMessage = "Terlalu banyak permintaan. Tunggu sebentar ya.";
    if (lastStatus === 0) userMessage = "Koneksi bermasalah. Cek internetmu dan coba lagi.";

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

              if (delta) {
                controller.enqueue(encoder.encode(delta));
              }

              if (finishReason === "length") {
                controller.enqueue(encoder.encode("\n<!--__TRUNCATED__-->\n"));
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