import { NextRequest } from "next/server";

const API_KEYS = (process.env.AGNES_API_KEYS || "").split(",").map(k => k.trim()).filter(k => k !== "");
const AGNES_QUERY_URL = "https://apihub.agnes-ai.com/agnesapi";

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");
  if (!videoId) return new Response(JSON.stringify({ error: "No videoId" }), { status: 400 });

  // Coba cek status menggunakan key acak (tidak memotong kredit)
  const shuffledKeys = [...API_KEYS].sort(() => Math.random() - 0.5);
  
  for (const apiKey of shuffledKeys) {
    try {
      const response = await fetch(
        `${AGNES_QUERY_URL}?video_id=${videoId}&model_name=agnes-video-2.5-flash`,
        { headers: { "Authorization": `Bearer ${apiKey}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === "completed") {
          // Bungkus URL dengan proxy kita
          const proxiedUrl = `/api/video-proxy?url=${encodeURIComponent(data.url)}`;
          return new Response(JSON.stringify({ status: "completed", videoUrl: proxiedUrl }), { headers: { "Content-Type": "application/json" } });
        }
        
        // Status masih queued / in_progress
        return new Response(JSON.stringify({ status: data.status }), { headers: { "Content-Type": "application/json" } });
      }
    } catch (err) {
      continue; // Jika satu key gagal cek, coba key lain
    }
  }

  return new Response(JSON.stringify({ error: "Gagal mengecek status ke Agnes" }), { status: 502 });
}