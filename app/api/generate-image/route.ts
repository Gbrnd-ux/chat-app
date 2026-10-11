import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { rewriteImagePrompt } from "@/lib/prompts";
import { runEnvCheckOnce } from "@/lib/env-check";
export const maxDuration = 60;
runEnvCheckOnce();

const MAX_PROMPT_CHARS = 1500;

export const ASPECTS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "3:2": { w: 1216, h: 832 },
};

type GenerateResult = {
  dataUrl: string;
  model: string;
  provider: string;
  seed: number;
};

type NvidiaConfig = {
  model: string;
  body: Record<string, unknown>;
};

function buildNvidiaConfigs(prompt: string, seed: number): NvidiaConfig[] {
  return [
    {
      model: "black-forest-labs/flux.1-dev",
      body: {
        prompt,
        mode: "base",
        cfg_scale: 5,
        width: 1024,
        height: 1024,
        samples: 1,
        seed,
        steps: 50,
      },
    },
    {
      model: "black-forest-labs/flux.1-schnell",
      body: {
        prompt,
        mode: "base",
        cfg_scale: 0,
        width: 1024,
        height: 1024,
        samples: 1,
        seed,
        steps: 4,
        image: null,
      },
    },
    {
      model: "black-forest-labs/flux.2-klein-4b",
      body: {
        prompt,
        mode: "Image Generation",
        cfg_scale: 0,
        width: 1024,
        height: 1024,
        samples: 1,
        seed,
        steps: 4,
        image: null,
      },
    },
  ];
}

async function tryNvidia(prompt: string, seed: number): Promise<GenerateResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY kosong");

  let lastErr = "";

  for (const { model, body } of buildNvidiaConfigs(prompt, seed)) {
    const url = `https://ai.api.nvidia.com/v1/genai/${model}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const raw = await res.text();

    if (!res.ok) {
      lastErr = `[${res.status}] ${raw.slice(0, 200)}`;
      console.warn(`[image] nvidia "${model}" gagal: ${res.status}`);
      console.warn(`[image] detail: ${raw.slice(0, 300)}`);
      continue;
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      lastErr = `[${model}] respons bukan JSON`;
      continue;
    }

    const artifact = data?.artifacts?.[0];
    const b64 = artifact?.base64;
    if (b64) {
      return {
        dataUrl: `data:image/png;base64,${b64}`,
        model,
        provider: "nvidia",
        seed: typeof artifact.seed === "number" ? artifact.seed : seed,
      };
    }

    lastErr = `[${model}] tidak ada artifacts[0].base64`;
    console.warn(`[image] ${lastErr}`);
  }

  throw new Error(lastErr || "NVIDIA NIM gagal");
}

async function tryPollinations(
  prompt: string,
  seed: number,
  aspect: { w: number; h: number }
): Promise<GenerateResult> {
  const params = new URLSearchParams({
    width: String(aspect.w),
    height: String(aspect.h),
    nologo: "true",
    seed: String(seed),
    model: "flux",
  });
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt
  )}?${params}`;
  return { dataUrl: url, model: "flux", provider: "pollinations", seed };
}

const GEMINI_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
];

async function tryGemini(prompt: string, seed: number): Promise<GenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY kosong");

  let lastErr = "";
  for (const model of GEMINI_IMAGE_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      lastErr = `[${res.status}] ${raw.slice(0, 200)}`;
      continue;
    }
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      lastErr = `[${model}] respons bukan JSON`;
      continue;
    }
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p: any) => p?.inlineData?.data);
    if (imgPart) {
      const mime = imgPart.inlineData.mimeType ?? "image/png";
      return {
        dataUrl: `data:${mime};base64,${imgPart.inlineData.data}`,
        model,
        provider: "gemini",
        seed,
      };
    }
    lastErr = `[${model}] tidak ada gambar`;
  }
  throw new Error(lastErr || "Gemini gagal");
}

const OPENROUTER_IMAGE_MODELS = ["google/gemini-2.5-flash-image-preview"];

async function tryOpenRouter(
  prompt: string,
  seed: number
): Promise<GenerateResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY kosong");

  let lastErr = "";
  for (const model of OPENROUTER_IMAGE_MODELS) {
    const res = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Chat Streaming App",
      },
      body: JSON.stringify({ model, prompt }),
    });
    const raw = await res.text();
    if (!res.ok) {
      lastErr = `[${res.status}] ${raw.slice(0, 200)}`;
      continue;
    }
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      lastErr = `[${model}] respons bukan JSON`;
      continue;
    }
    const item = data?.data?.[0];
    const url = item?.url
      ? item.url
      : item?.b64_json
      ? `data:image/png;base64,${item.b64_json}`
      : null;
    if (url) return { dataUrl: url, model, provider: "openrouter", seed };
    lastErr = `[${model}] tidak ada URL gambar`;
  }
  throw new Error(lastErr || "OpenRouter gagal");
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: "rate_limit", message: "Terlalu banyak permintaan." }),
      { status: 429, headers: { "Retry-After": "20", "Content-Type": "application/json" } }
    );
  }

  let body: { prompt?: string; seed?: number; aspect?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const rawPrompt = (body.prompt ?? "").trim();
  const aspectKey = body.aspect && ASPECTS[body.aspect] ? body.aspect : "1:1";
  const aspect = ASPECTS[aspectKey];
  const isSquare = aspectKey === "1:1";

  console.log(`[image] prompt asli: "${rawPrompt.slice(0, 60)}"`);
  console.log(`[image] aspect: ${aspectKey} (${aspect.w}×${aspect.h})`);

  if (!rawPrompt) {
    return new Response(
      JSON.stringify({ error: "Prompt kosong" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  if (rawPrompt.length > MAX_PROMPT_CHARS) {
    return new Response(
      JSON.stringify({ error: `Prompt terlalu panjang (maks ${MAX_PROMPT_CHARS})` }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  const seed =
    typeof body.seed === "number" && Number.isFinite(body.seed)
      ? Math.floor(body.seed)
      : Math.floor(Math.random() * 1_000_000);

  let prompt: string;
  if (typeof body.seed === "number" && Number.isFinite(body.seed)) {
    prompt = rawPrompt;
    console.log(`[image] regenerate → skip rewrite`);
  } else {
    prompt = await rewriteImagePrompt(rawPrompt);
    console.log(`[image] prompt rewrited: "${prompt.slice(0, 120)}"`);
  }

  console.log(`[image] seed: ${seed}`);
  console.log("[image] providers tersedia:", {
    nvidia: !!process.env.NVIDIA_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
  });

  const attempts: Array<{ name: string; fn: () => Promise<GenerateResult> }> = [];

  // NVIDIA FLUX hanya bisa 1024×1024 → skip kalau aspect bukan 1:1
  if (process.env.NVIDIA_API_KEY && isSquare) {
    attempts.push({ name: "nvidia", fn: () => tryNvidia(prompt, seed) });
  } else if (process.env.NVIDIA_API_KEY && !isSquare) {
    console.log(`[image] skip nvidia (aspect ${aspectKey} tidak didukung, hanya 1:1)`);
  }

  attempts.push({
    name: "pollinations",
    fn: () => tryPollinations(prompt, seed, aspect),
  });
  if (process.env.GEMINI_API_KEY) {
    attempts.push({ name: "gemini", fn: () => tryGemini(prompt, seed) });
  }
  if (process.env.OPENROUTER_API_KEY) {
    attempts.push({ name: "openrouter", fn: () => tryOpenRouter(prompt, seed) });
  }

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const result = await attempt.fn();
      console.log(`[image] sukses via ${attempt.name}: ${result.model}`);
      return new Response(JSON.stringify({ ...result, aspect: aspectKey }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      console.warn(`[image] ${attempt.name} gagal: ${err.message}`);
      errors.push(`${attempt.name}: ${err.message}`);
    }
  }

  console.error("[image] semua provider gagal");
  return new Response(
    JSON.stringify({
      error: "generate_failed",
      detail: errors.join(" | "),
    }),
    { status: 502, headers: { "Content-Type": "application/json" } }
  );
}