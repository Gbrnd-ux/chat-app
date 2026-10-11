// app/api/generate-video/agnes/route.ts
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { Client } from "@gradio/client";
export const maxDuration = 60;
const MAX_PROMPT_CHARS = 1500;
const HF_SPACE = "Upsampler/wan-2-2-14b-text-to-video";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limit" }), {
      status: 429,
      headers: { "Retry-After": "20", "Content-Type": "application/json" },
    });
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt kosong" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return new Response(JSON.stringify({ error: "Prompt terlalu panjang" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[video] prompt: "${prompt.slice(0, 60)}"`);

  try {
    const client = await Client.connect(HF_SPACE, {
      token: process.env.HF_TOKEN
        ? (process.env.HF_TOKEN as `hf_${string}`)
        : undefined,
    });

    console.log(`[video] connected`);

    let paramNames: string[] = [];
    try {
      const apiInfo: any = await client.view_api();
      const endpoint = apiInfo?.named_endpoints?.["/generate_video"];
      if (endpoint?.parameters) {
        paramNames = endpoint.parameters
          .map((p: any) => p.parameter_name)
          .filter((n: any) => typeof n === "string");
        console.log(`[video] parameter names: [${paramNames.join(", ")}]`);
      }
    } catch (err: any) {
      console.warn(`[video] view_api gagal: ${err.message}`);
    }

    const seed = Math.floor(Math.random() * 1_000_000);

    const paramValues: Record<string, any> = {
      prompt: prompt,
      negative_prompt: "",
      aspect_ratio: "16:9 (832x480)",
      duration_seconds: 3.5,
      steps: 4,
      guidance_scale: 5,
      guidance_scale_2: 5,
      seed: seed,
      randomize_seed: true,
    };

    let payload: any;
    if (paramNames.length > 0) {
      payload = {};
      for (const name of paramNames) {
        if (name in paramValues) {
          payload[name] = paramValues[name];
        } else {
          const lower = name.toLowerCase();
          if (lower.includes("seed") && lower.includes("random")) {
            payload[name] = true;
          } else if (lower.includes("seed")) {
            payload[name] = seed;
          } else if (lower.includes("prompt") && lower.includes("neg")) {
            payload[name] = "";
          } else {
            payload[name] = null;
          }
        }
      }
      console.log(`[video] payload:`, JSON.stringify(payload));
    } else {
      payload = [prompt, "16:9 (832x480)", 4, "", 3.5, 5, 5, seed, true];
      console.log(`[video] payload (positional):`, JSON.stringify(payload));
    }

    console.log(`[video] memanggil /generate_video...`);
    const result: any = await client.predict("/generate_video", payload);

    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) {
      throw new Error(`Response tidak berisi video`);
    }

    console.log(`[video] raw URL: ${videoUrl.slice(0, 100)}`);

    // ✅ Bungkus URL HF dengan proxy kita
    const proxiedUrl = `/api/video-proxy?url=${encodeURIComponent(videoUrl)}`;
    console.log(`[video] proxied URL: ${proxiedUrl.slice(0, 120)}`);

    return new Response(
      JSON.stringify({
        status: "completed",
        videoUrl: proxiedUrl,
        model: "wan-2.2-14b",
        provider: "huggingface",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[video] error:", err.message);

    let userMessage = err.message;
    if (err.message.includes("quota") || err.message.includes("ZeroGPU")) {
      userMessage = "Kuota GPU gratis Hugging Face habis. Coba lagi nanti.";
    } else if (err.message.includes("sleep") || err.message.includes("building")) {
      userMessage = "Space HF sedang tidur/bangun. Coba lagi 30 detik.";
    } else if (err.message.includes("401") || err.message.includes("Unauthorized")) {
      userMessage = "HF_TOKEN tidak valid. Cek .env.local.";
    } else if (err.message.includes("429")) {
      userMessage = "Rate limit HF. Tunggu sebentar.";
    }

    return new Response(
      JSON.stringify({ error: "submit_failed", detail: userMessage, raw: err.message }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

function extractVideoUrl(result: any): string | null {
  if (!result) return null;
  if (typeof result === "string" && result.startsWith("http")) return result;

  const data = result?.data ?? result;

  if (Array.isArray(data)) {
    for (const item of data) {
      const url = extractVideoUrl(item);
      if (url) return url;
    }
    return null;
  }

  if (data?.video?.url) return data.video.url;
  if (typeof data?.url === "string" && data.url.startsWith("http")) return data.url;
  if (typeof data?.path === "string" && data.path.startsWith("http")) return data.path;
  if (typeof data?.value === "string" && data.value.startsWith("http")) return data.value;

  return null;
}