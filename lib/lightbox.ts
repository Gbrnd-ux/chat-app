// lib/lightbox.ts
"use client";

type LightboxPayload = {
  src: string;
  alt?: string;
};

type Listener = (payload: LightboxPayload | null) => void;

let listeners: Listener[] = [];

export function openLightbox(src: string, alt?: string) {
  listeners.forEach((l) => l({ src, alt }));
}

export function closeLightbox() {
  listeners.forEach((l) => l(null));
}

export function subscribeLightbox(l: Listener): () => void {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}