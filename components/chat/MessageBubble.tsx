"use client";
import { memo, useState } from "react";
import { Markdown } from "./Markdown";
import type { ChatMessage } from "@/lib/storage";
import { showToast } from "@/lib/toast";
import { openLightbox } from "@/lib/lightbox";

type Props = {
  message: ChatMessage;
  streaming?: boolean;
  onRegenerate?: () => void;
  onRegenerateImage?: (messageId: string) => void;
  onEdit?: (newContent: string) => void;
  isLast?: boolean;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rasio aspect → padding-top untuk skeleton */
const ASPECT_PADDING: Record<string, string> = {
  "1:1": "100%",
  "16:9": "56.25%",
  "9:16": "177.78%",
  "3:2": "66.67%",
};

/** Gambar dengan skeleton loading + error state */
function ImageWithLoader({
  src,
  alt,
  aspect,
  onClick,
  maxHeight = 480,
}: {
  src: string;
  alt: string;
  aspect?: string;
  onClick?: () => void;
  maxHeight?: number;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [retryKey, setRetryKey] = useState(0);

  const padding = ASPECT_PADDING[aspect ?? "1:1"] ?? "100%";

  if (status === "error") {
    return (
      <div
        className="relative w-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden"
        style={{ paddingTop: padding }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
          <span className="text-2xl">🖼️</span>
          <p className="text-xs text-neutral-400">Gambar gagal dimuat</p>
          <p className="text-[10px] text-neutral-600 max-w-[200px] truncate">
            {src.slice(0, 60)}…
          </p>
          <button
            onClick={() => {
              setStatus("loading");
              setRetryKey((k) => k + 1);
            }}
            className="mt-1 text-[11px] px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white"
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {status === "loading" && (
        <div
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden"
          style={{ paddingTop: padding }}
        >
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] text-neutral-500">
                Memuat gambar…
              </span>
            </div>
          </div>
        </div>
      )}

      <img
        key={retryKey}
        src={src}
        alt={alt}
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        onClick={onClick}
        className={[
          "w-auto max-w-full object-contain mx-auto rounded-lg",
          status === "loaded" ? "block cursor-zoom-in hover:opacity-95" : "hidden",
        ].join(" ")}
        style={{ maxHeight: `${maxHeight}px` }}
      />
    </div>
  );
}

/** Video dengan skeleton loading + error state */
function VideoWithLoader({ src }: { src: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  return (
    <div className="relative w-full bg-black rounded-lg overflow-hidden aspect-video">
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] text-neutral-500">
              Memuat video… (30–60 detik)
            </span>
          </div>
        </div>
      )}
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        onLoadedData={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={`w-full h-full ${status === "loaded" ? "block" : "hidden"}`}
      />
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center text-xs text-neutral-400 px-4 text-center">
          Gagal memuat video.{" "}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 underline ml-1"
          >
            Buka di tab baru
          </a>
        </div>
      )}
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
  onRegenerate,
  onRegenerateImage,
  onEdit,
  isLast,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === "user";

  const hasImages = (message.generatedImages?.length ?? 0) > 0;
  const hasVideos = (message.generatedVideos?.length ?? 0) > 0;
  const hasDocs = (message.generatedDocuments?.length ?? 0) > 0;

  const copy = async () => {
    const text = hasImages
      ? message.generatedImages![0].prompt
      : hasVideos
      ? message.generatedVideos![0].prompt
      : hasDocs
      ? message.generatedDocuments![0].prompt
      : message.content;
    try {
      await navigator.clipboard.writeText(text);
      showToast(
        hasImages || hasVideos || hasDocs ? "Prompt tersalin" : "Tersalin",
        "success"
      );
    } catch {
      showToast("Gagal menyalin", "error");
    }
  };

  const downloadImage = async (dataUrl: string, prompt: string) => {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gambar-${prompt.slice(0, 30).replace(/\s+/g, "-")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Gambar diunduh", "success");
    } catch {
      showToast("Gagal mengunduh gambar", "error");
    }
  };

  const downloadDocument = (base64: string, fileName: string, mimeType: string) => {
    try {
      const byteChars = atob(base64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Dokumen diunduh", "success");
    } catch {
      showToast("Gagal mengunduh dokumen", "error");
    }
  };

  return (
    <div className={`group flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-sky-600 text-xs grid place-items-center">
          AI
        </div>
      )}

      <div className="flex flex-col gap-1 max-w-[75ch] w-full">
        <div
          className={[
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-sky-600/90 text-white"
              : "bg-neutral-900 text-neutral-100 border border-neutral-800",
          ].join(" ")}
        >
          {/* Lampiran user */}
          {isUser && message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.attachments.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openLightbox(a.dataUrl, a.name)}
                  className="block rounded-lg overflow-hidden border border-white/20 hover:opacity-90"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.dataUrl}
                    alt={a.name ?? "gambar"}
                    className="max-h-48 max-w-[240px] object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Gambar hasil generate */}
          {hasImages && (
            <div className="flex flex-col gap-2 mb-2 w-full">
              {message.generatedImages!.map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl overflow-hidden border border-neutral-700 bg-neutral-950 w-full"
                >
                  <div className="w-full">
                    <ImageWithLoader
                      src={g.dataUrl}
                      alt={g.prompt}
                      aspect={g.aspect}
                      onClick={() => openLightbox(g.dataUrl, g.prompt)}
                    />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-800 bg-neutral-900/60 gap-2">
                    <span className="text-[11px] text-neutral-500 font-mono truncate">
                      {g.provider} · {g.model}
                      {typeof g.seed === "number" && ` · seed ${g.seed}`}
                      {g.aspect && ` · ${g.aspect}`}
                    </span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => downloadImage(g.dataUrl, g.prompt)}
                        className="text-[11px] px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300"
                      >
                        Download
                      </button>
                      {onRegenerateImage && (
                        <button
                          onClick={() => onRegenerateImage(message.id)}
                          className="text-[11px] px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300"
                        >
                          Regenerate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Video hasil generate */}
          {hasVideos && (
            <div className="flex flex-col gap-2 mb-2 w-full">
              {message.generatedVideos!.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl overflow-hidden border border-neutral-700 bg-neutral-950 w-full"
                >
                  <VideoWithLoader src={v.videoUrl} />
                  <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-800 bg-neutral-900/60 gap-2">
                    <span className="text-[11px] text-neutral-500 font-mono truncate">
                      {v.provider} · {v.model}
                    </span>
                    <a
                      href={v.videoUrl}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300 shrink-0"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Dokumen hasil generate */}
          {hasDocs && (
            <div className="flex flex-col gap-2 mb-2 w-full">
              {message.generatedDocuments!.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl overflow-hidden border border-neutral-700 bg-neutral-950 p-3 flex items-center gap-3"
                >
                  <div
                    className={[
                      "h-10 w-10 rounded-lg grid place-items-center text-lg shrink-0",
                      d.docType === "word"
                        ? "bg-blue-600/20 text-blue-400"
                        : "bg-emerald-600/20 text-emerald-400",
                    ].join(" ")}
                  >
                    {d.docType === "word" ? "📄" : "📊"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-100 truncate font-medium">
                      {d.fileName}
                    </p>
                    <p className="text-[11px] text-neutral-500 font-mono">
                      {(d.size / 1024).toFixed(1)} KB · {d.docType.toUpperCase()}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadDocument(d.base64, d.fileName, d.mimeType)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white shrink-0"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}

          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                className="w-full rounded bg-neutral-800 p-2 text-sm"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(message.content);
                  }}
                  className="px-2 py-1 rounded hover:bg-neutral-700"
                >
                  Batal
                </button>
                <button
                  onClick={() => {
                    onEdit?.(draft);
                    setEditing(false);
                  }}
                  className="px-2 py-1 rounded bg-sky-500 text-white"
                >
                  Kirim ulang
                </button>
              </div>
            </div>
          ) : isUser ? (
            message.content ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : null
          ) : message.content ? (
            <>
              <Markdown content={message.content} />
              {streaming && (
                <span className="inline-block w-2 h-4 align-middle bg-sky-400 animate-pulse ml-0.5" />
              )}
            </>
          ) : streaming ? (
            <span className="inline-block w-2 h-4 align-middle bg-sky-400 animate-pulse ml-0.5" />
          ) : null}

          {/* Badge model teks */}
          {!streaming &&
            !hasImages &&
            !hasVideos &&
            !hasDocs &&
            message.model &&
            message.model !== "…" && (
              <div className="mt-2 text-[10px] uppercase tracking-wider text-neutral-500 font-mono">
                {message.provider} · {message.model}
              </div>
            )}

          {/* Action row */}
          {!streaming &&
            !editing &&
            (message.content || hasImages || hasVideos || hasDocs) && (
              <div className="mt-2 flex gap-3 text-xs text-neutral-400 opacity-0 group-hover:opacity-100 transition">
                <button onClick={copy} className="hover:text-neutral-200">
                  {hasImages || hasVideos || hasDocs ? "Copy prompt" : "Copy"}
                </button>
                {isUser && (
                  <button
                    onClick={() => setEditing(true)}
                    className="hover:text-neutral-200"
                  >
                    Edit
                  </button>
                )}
                {!isUser &&
                  isLast &&
                  onRegenerate &&
                  !hasImages &&
                  !hasVideos &&
                  !hasDocs && (
                    <button
                      onClick={onRegenerate}
                      className="hover:text-neutral-200"
                    >
                      Regenerate
                    </button>
                  )}
              </div>
            )}
        </div>

        <span
          className={`text-[10px] text-neutral-600 opacity-0 group-hover:opacity-100 transition ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
});