// components/ui/Toast.tsx
"use client";
import { useEffect, useState } from "react";
import { subscribeToast, ToastVariant } from "@/lib/toast";

type Item = { id: number; msg: string; variant: ToastVariant };

const COLORS: Record<ToastVariant, string> = {
  success: "bg-emerald-600/90 border-emerald-500",
  error: "bg-red-600/90 border-red-500",
  info: "bg-sky-600/90 border-sky-500",
};

export function ToastContainer() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const unsub = subscribeToast((msg, variant) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev, { id, msg, variant }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, 2500);
    });
    return unsub;
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto rounded-xl border px-4 py-2 text-sm text-white shadow-lg backdrop-blur animate-[fadeIn_0.15s_ease-out] ${COLORS[t.variant]}`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}