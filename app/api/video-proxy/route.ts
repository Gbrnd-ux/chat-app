import { NextRequest } from "next/server";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing url parameter", { status: 400 });

  // Whitelist: HANYA izinkan URL dari Agnes AI / CDN mereka
  const allowedDomains = ["agnes-ai.com", "amazonaws.com", "cloudfront.net", "aliyuncs.com"];
  const isAllowed = allowedDomains.some(domain => url.includes(domain));

  if (!url.startsWith("https://") || !isAllowed) {
    console.warn(`[video-proxy] URL ditolak: ${url.slice(0, 100)}`);
    return new Response("URL not allowed", { status: 403 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return new Response(`Upstream error ${res.status}`, { status: 502 });

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
    return new Response(`Proxy error: ${err.message}`, { status: 502 });
  }
}