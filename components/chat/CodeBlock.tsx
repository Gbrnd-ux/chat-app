"use client";
import { useState } from "react";

export function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace("language-", "") ?? "text";

  const copy = async () => {
    try {
      const text = extractText(children);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-neutral-400 bg-neutral-900">
        <span className="font-mono">{lang}</span>
        <button
          onClick={copy}
          className="rounded px-2 py-0.5 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Salin kode"
        >
          {copied ? "Tersalin ✓" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in (node as any)) {
    return extractText((node as any).props.children);
  }
  return "";
}