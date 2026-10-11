// app/api/video-proxy/route.ts
import { NextRequest } from "next/server";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return new Response("Missing url parameter", { status: 400 });
  }

  // Whitelist: hanya URL dari Hugging Face Spaces
  if (!url.startsWith("https://") || !url.includes(".hf.space/")) {
    console.warn(`[video-proxy] URL ditolak: ${url.slice(0, 100)}`);
    return new Response("URL not allowed", { status: 403 });
  }

  try {
    console.log(`[video-proxy] fetching: ${url.slice(0, 100)}...`);
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`[video-proxy] upstream ${res.status}`);
      return new Response(`Upstream error ${res.status}`, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "video/mp4";
    const contentLength = res.headers.get("content-length");

    return new Response(res.body, {
      headers: {
        "Content-Type": contentType,
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Cache-Control": "public, max-age=600",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err: any) {
    console.error("[video-proxy] error:", err.message);
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}