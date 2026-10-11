"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Attachment } from "@/lib/storage";
import { newId } from "@/lib/storage";

const MAX_FILE_MB = 3;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export type ComposerMode = "chat" | "image" | "video" | "document";
export type AspectRatio = "1:1" | "16:9" | "9:16" | "3:2";
export type DocType = "word" | "excel";

const ASPECT_OPTIONS: { value: AspectRatio; label: string; hint: string }[] = [
  { value: "1:1", label: "1:1", hint: "Kotak" },
  { value: "16:9", label: "16:9", hint: "Landscape" },
  { value: "9:16", label: "9:16", hint: "Portrait" },
  { value: "3:2", label: "3:2", hint: "Foto" },
];

const DOC_OPTIONS: { value: DocType; label: string }[] = [
  { value: "word", label: "Word (.docx)" },
  { value: "excel", label: "Excel (.xlsx)" },
];

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  attachments: Attachment[];
  onAttachmentsChange: (a: Attachment[]) => void;
  mode: ComposerMode;
  onModeChange: (m: ComposerMode) => void;
  aspect: AspectRatio;
  onAspectChange: (a: AspectRatio) => void;
  docType: DocType;
  onDocTypeChange: (d: DocType) => void;
};

export const Composer = forwardRef<HTMLTextAreaElement, Props>(
  function Composer(
    {
      value,
      onChange,
      onSend,
      onStop,
      streaming,
      attachments,
      onAttachmentsChange,
      mode,
      onModeChange,
      aspect,
      onAspectChange,
      docType,
      onDocTypeChange,
    },
    fwd
  ) {
    const inner = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(fwd, () => inner.current!, []);

    useEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }, [value]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        onSend();
      }
    };

    const handleFiles = async (files: FileList | null) => {
      setError(null);
      if (!files || files.length === 0) return;
      const next: Attachment[] = [...attachments];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          setError("Hanya file gambar yang didukung.");
          continue;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          setError(`Maksimal ${MAX_FILE_MB} MB per gambar.`);
          continue;
        }
        const dataUrl = await fileToDataUrl(file);
        next.push({
          id: newId(),
          type: "image",
          mimeType: file.type,
          dataUrl,
          name: file.name,
          size: file.size,
        });
      }
      onAttachmentsChange(next);
      if (fileRef.current) fileRef.current.value = "";
    };

    const removeAttachment = (id: string) => {
      onAttachmentsChange(attachments.filter((a) => a.id !== id));
    };

    const canSend = value.trim().length > 0;

    return (
      <div className="border-t border-neutral-800 bg-neutral-950/80 backdrop-blur p-3 md:p-4">
        <div className="mx-auto max-w-3xl flex flex-col gap-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-2 px-1 flex-wrap">
            <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
              <button
                onClick={() => onModeChange("chat")}
                className={`px-3 py-1 rounded-md transition ${
                  mode === "chat"
                    ? "bg-sky-600 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => onModeChange("image")}
                className={`px-3 py-1 rounded-md transition ${
                  mode === "image"
                    ? "bg-sky-600 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Gambar
              </button>
              <button
                onClick={() => onModeChange("video")}
                className={`px-3 py-1 rounded-md transition ${
                  mode === "video"
                    ? "bg-sky-600 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Video
              </button>
              <button
                onClick={() => onModeChange("document")}
                className={`px-3 py-1 rounded-md transition ${
                  mode === "document"
                    ? "bg-sky-600 text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Dokumen
              </button>
            </div>

            {mode === "image" && (
              <>
                <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
                  {ASPECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onAspectChange(opt.value)}
                      title={opt.hint}
                      className={`px-2.5 py-1 rounded-md transition ${
                        aspect === opt.value
                          ? "bg-neutral-700 text-white"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-neutral-500">
                  Deskripsikan gambar.
                </span>
              </>
            )}

            {mode === "video" && (
              <span className="text-[11px] text-neutral-500">
                Deskripsikan video (~30–120 detik).
              </span>
            )}

            {mode === "document" && (
              <>
                <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
                  {DOC_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onDocTypeChange(opt.value)}
                      className={`px-2.5 py-1 rounded-md transition ${
                        docType === opt.value
                          ? "bg-neutral-700 text-white"
                          : "text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-neutral-500">
                  AI akan generate dokumen.
                </span>
              </>
            )}
          </div>

          {/* Preview lampiran (chat) */}
          {mode === "chat" && attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="relative group rounded-lg overflow-hidden border border-neutral-700"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.dataUrl}
                    alt={a.name ?? "lampiran"}
                    className="h-20 w-20 object-cover"
                  />
                  <button
                    onClick={() => removeAttachment(a.id)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white text-xs grid place-items-center opacity-0 group-hover:opacity-100 transition"
                    aria-label="Hapus gambar"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="text-xs text-red-400 px-1">{error}</div>}

          <div className="flex items-end gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 focus-within:border-sky-600">
            {mode === "chat" && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={streaming}
                  className="rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 p-2 disabled:opacity-40"
                  aria-label="Lampirkan gambar"
                  title="Lampirkan gambar"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </>
            )}

            <textarea
              ref={inner}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                mode === "image"
                  ? "Deskripsikan gambar, mis. kucing astronot di bulan..."
                  : mode === "video"
                  ? "Deskripsikan video, mis. drone melintasi hutan saat matahari terbenam..."
                  : mode === "document"
                  ? docType === "word"
                    ? "Mis. buatkan laporan penjualan Q1 2026 untuk manajemen..."
                    : "Mis. buatkan tabel data siswa kelas 10 dengan kolom nama, nilai matematika, bahasa..."
                  : "Tulis pesan..."
              }
              className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-6 py-1.5 max-h-[200px]"
            />

            {streaming ? (
              <button
                onClick={onStop}
                className="rounded-xl bg-red-600 hover:bg-red-500 px-3 py-2 text-sm font-medium"
                aria-label="Stop"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!canSend}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-3 py-2 text-sm font-medium whitespace-nowrap"
                aria-label="Kirim"
              >
                {mode === "chat" ? "Kirim" : "Buat"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}