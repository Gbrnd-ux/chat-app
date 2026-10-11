// components/ui/Lightbox.tsx
"use client";
import { useEffect, useState } from "react";
import { subscribeLightbox } from "@/lib/lightbox";

export function Lightbox() {
  const [item, setItem] = useState<{ src: string; alt?: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeLightbox((payload) => setItem(payload));
    return unsub;
  }, []);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setItem(null);
    };
    window.addEventListener("keydown", onKey);
    // Cegah body scroll saat lightbox terbuka
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [item]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]"
      onClick={() => setItem(null)}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={() => setItem(null)}
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-neutral-800/80 hover:bg-neutral-700 text-white text-xl grid place-items-center"
        aria-label="Tutup"
      >
        ×
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.src}
        alt={item.alt ?? ""}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />

      {item.alt && (
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[80vw] text-center text-xs text-neutral-300 bg-black/60 rounded-full px-4 py-2 truncate">
          {item.alt}
        </p>
      )}
    </div>
  );
}