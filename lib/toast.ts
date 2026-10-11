// lib/toast.ts
"use client";

export type ToastVariant = "success" | "error" | "info";

type Listener = (msg: string, variant: ToastVariant) => void;

let listeners: Listener[] = [];

export function showToast(msg: string, variant: ToastVariant = "info") {
  listeners.forEach((l) => l(msg, variant));
}

export function subscribeToast(l: Listener): () => void {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}