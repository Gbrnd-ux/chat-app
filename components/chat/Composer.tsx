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

const MAX_FILE_MB = 5; 
// Mendukung Gambar, PDF, dan Word
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
    const [isUploading, setIsUploading] = useState(false);

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
        // Deteksi PDF dan Word
        const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
        const isWord = 
          file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
          file.type === "application/msword" || 
          file.name.endsWith(".docx") || 
          file.name.endsWith(".doc");

        if (isPdf || isWord) {
          if (file.size > MAX_FILE_MB * 1024 * 1024) {
            setError(`Maksimal ${MAX_FILE_MB} MB untuk dokumen.`);
            continue;
          }

          try {
            setIsUploading(true);
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/upload", {
              method: "POST",
              body: formData,
            });
            const data = await res.json();

            if (data.success) {
              next.push({
                id: newId(),
                type: "document", 
                mimeType: file.type,
                dataUrl: "", 
                name: file.name,
                size: file.size,
              });
            } else {
              setError(`Gagal upload dokumen: ${data.error}`);
            }
          } catch (err) {
            setError("Terjadi kesalahan saat upload dokumen.");
          } finally {
            setIsUploading(false);
          }
          continue; 
        }

        // Validasi untuk Gambar
        if (!file.type.startsWith("image/")) {
          setError("Hanya file gambar, PDF, dan Word yang didukung.");
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

    const canSend = value.trim().length > 0 || attachments.length > 0;

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
          </div>

          {/* Preview lampiran */}
          {mode === "chat" && attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-1">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="relative group rounded-lg overflow-hidden border border-neutral-700 bg-neutral-800 p-2 flex items-center gap-2"
                >
                  {/* Preview untuk dokumen */}
                  {a.type === "document" ? (
                    <div className="flex items-center gap-2 text-sm text-neutral-300">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      <span className="truncate max-w-[150px]">{a.name}</span>
                    </div>
                  ) : (
                    /* Preview untuk Gambar */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={a.dataUrl}
                      alt={a.name ?? "lampiran"}
                      className="h-10 w-10 object-cover rounded"
                    />
                  )}
                  <button
                    onClick={() => removeAttachment(a.id)}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-600 text-white text-xs grid place-items-center opacity-0 group-hover:opacity-100 transition shadow-lg"
                    aria-label="Hapus lampiran"
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
                  disabled={streaming || isUploading}
                  className="rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 p-2 disabled:opacity-40"
                  aria-label="Lampirkan file"
                  title="Lampirkan Gambar, PDF, atau Word"
                >
                  {isUploading ? (
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  )}
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
                isUploading ? "Sedang memproses dokumen..." :
                mode === "image"
                  ? "Deskripsikan gambar..."
                  : mode === "video"
                  ? "Deskripsikan video..."
                  : mode === "document"
                  ? "AI akan generate dokumen..."
                  : "Tulis pesan atau lampirkan dokumen..."
              }
              className="flex-1 resize-none bg-transparent outline-none text-[15px] leading-6 py-1.5 max-h-[200px]"
            />

            {streaming ? (
              <button onClick={onStop} className="rounded-xl bg-red-600 hover:bg-red-500 px-3 py-2 text-sm font-medium">
                Stop
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!canSend || isUploading}
                className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-3 py-2 text-sm font-medium whitespace-nowrap"
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