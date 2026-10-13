"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { buildPreviewDocument, PREVIEW_SANDBOX } from "@/lib/ui-output";
import { showToast } from "@/lib/toast";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Props = {
  code: string;
  prompt?: string;
  onClose: () => void;
};

export function ArtifactPanel({ code: initialCode, prompt, onClose }: Props) {
  const [code, setCode] = useState(initialCode);
  const [showEditor, setShowEditor] = useState(false);

  // Sync kalau artifact berubah (user buka artifact lain)
  useEffect(() => {
    setCode(initialCode);
    setShowEditor(false);
  }, [initialCode]);

  const srcDoc = buildPreviewDocument(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast("Kode tersalin", "success");
    } catch {
      showToast("Gagal menyalin", "error");
    }
  };

  const openInNewTab = () => {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <aside className="flex flex-col h-full w-full bg-neutral-950 border-l border-neutral-800">
      {/* Header */}
      <header className="h-12 border-b border-neutral-800 flex items-center px-3 gap-2 shrink-0">
        <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-xs font-mono text-neutral-400 truncate flex-1">
          {prompt ? prompt : "UI Preview"}
        </span>

        <button
          onClick={() => setShowEditor(!showEditor)}
          className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition shrink-0"
        >
          {showEditor ? "Preview" : "Kode"}
        </button>
        <button
          onClick={copy}
          className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition shrink-0"
          title="Copy kode"
        >
          Copy
        </button>
        <button
          onClick={openInNewTab}
          className="text-[11px] px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition shrink-0"
          title="Buka di tab baru"
        >
          ↗
        </button>
        <button
          onClick={onClose}
          className="text-[13px] px-2 py-1 rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition shrink-0"
          aria-label="Tutup panel"
        >
          ✕
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {showEditor ? (
          <Editor
            height="100%"
            defaultLanguage="html"
            value={code}
            onChange={(val) => setCode(val || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              padding: { top: 12 },
            }}
          />
        ) : (
          <iframe
            srcDoc={srcDoc}
            sandbox={PREVIEW_SANDBOX}
            className="w-full h-full border-0 bg-white"
            title="UI Preview"
          />
        )}
      </div>
    </aside>
  );
}