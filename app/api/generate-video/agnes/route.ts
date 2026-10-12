import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;
const MAX_PROMPT_CHARS = 1500;
const MAX_KEYS_TO_TRY = 5; // Batas maksimal 5 akun untuk mencegah blokir IP
const MAX_503_RETRIES = 2; // Maksimal 2 kali coba ulang jika server penuh

const API_KEYS = (process.env.AGNES_API_KEYS || "").split(",").map(k => k.trim()).filter(k => k !== "");
const AGNES_BASE_URL = "https://apihub.agnes-ai.com/v1";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limit" }), { status: 429 });
  }

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return new Response(JSON.stringify({ error: "Prompt kosong" }), { status: 400 });
  if (prompt.length > MAX_PROMPT_CHARS) return new Response(JSON.stringify({ error: "Prompt terlalu panjang" }), { status: 413 });

  // Acak urutan API Key dan ambil maksimal 5
  const shuffledKeys = [...API_KEYS].sort(() => Math.random() - 0.5).slice(0, MAX_KEYS_TO_TRY);
  let lastError = "";

  for (const apiKey of shuffledKeys) {
    let retries = 0;
    let success = false;

    while (retries <= MAX_503_RETRIES && !success) {
      try {
        console.log(`[video] Mencoba key ${apiKey.slice(0, 8)}... (Percobaan ke-${retries + 1})`);
        
        const createResponse = await fetch(`${AGNES_BASE_URL}/videos`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "agnes-video-2.5-flash",
            prompt: prompt,
            seconds: "5",
            mode: "text",
            size: "720P",
            aspect_ratio: "16:9",
          }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}));
          const errorMsg = JSON.stringify(errorData);
          
          // Jika server penuh (503), tunggu 5 detik dan coba lagi dengan key yang sama
          if (createResponse.status === 503) {
            console.warn(`[video] Server Agnes penuh. Menunggu 5 detik...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            retries++;
            lastError = `Agnes API Error (503): ${errorMsg}`;
            continue; // Lanjut ke iterasi while berikutnya (retry)
          }

          // Jika limit/unauthorized (401/429), langsung pindah ke akun berikutnya
          if (createResponse.status === 429 || createResponse.status === 401) {
            console.warn(`[video] Key ${apiKey.slice(0, 8)} limit/unauthorized. Pindah akun...`);
            lastError = `Agnes API Error (${createResponse.status}): ${errorMsg}`;
            break; // Keluar dari while, lanjut ke for (akun berikutnya)
          }

          // Error lainnya (400, 500, dll)
          throw new Error(`Agnes API Error (${createResponse.status}): ${errorMsg}`);
        }

        // Jika berhasil
        const createData = await createResponse.json();
        success = true;
        
        return new Response(JSON.stringify({ 
          status: "processing", 
          videoId: createData.video_id 
        }), { headers: { "Content-Type": "application/json" } });

      } catch (err: any) {
        lastError = err.message;
        // Jika error bukan karena limit/unauthorized, kita bisa langsung berhenti mencoba akun lain
        if (!err.message.includes("429") && !err.message.includes("401")) {
          return new Response(JSON.stringify({ error: "submit_failed", detail: err.message }), { status: 502 });
        }
      }
    }
  }

  // Jika semua 5 akun sudah dicoba dan gagal
  let userMessage = "Terjadi kesalahan saat menghubungi Agnes AI.";
  if (lastError.includes("503")) {
    userMessage = "Server Agnes sedang penuh (antrean video penuh). Silakan coba lagi beberapa menit lagi.";
  } else if (lastError.includes("429") || lastError.includes("401")) {
    userMessage = "Server sedang limit. Silakan coba lagi nanti.";
  }

  return new Response(
    JSON.stringify({ error: "submit_failed", detail: userMessage, raw: lastError }),
    { status: 502, headers: { "Content-Type": "application/json" } }
  );
}