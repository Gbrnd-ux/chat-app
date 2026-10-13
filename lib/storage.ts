export type Attachment = {
  id: string;
  type: "image";
  mimeType: string;
  dataUrl: string;
  name?: string;
  size?: number;
};

export type GeneratedImage = {
  id: string;
  dataUrl: string;
  prompt: string;
  model: string;
  provider: string;
  createdAt: number;
  seed?: number;
  aspect?: string;
};

export type GeneratedVideo = {
  id: string;
  videoUrl: string;
  prompt: string;
  model: string;
  provider: string;
  createdAt: number;
};

export type GeneratedDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  base64: string;
  size: number;
  docType: "word" | "excel";
  prompt: string;
  createdAt: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  model?: string;
  provider?: string;
  attachments?: Attachment[];
  generatedImages?: GeneratedImage[];
  generatedVideos?: GeneratedVideo[];
  generatedDocuments?: GeneratedDocument[];
  generatedUI?: {
    code: string;
    prompt: string;
  };
};

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const KEY = "chat:conversations";

export function loadAll(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveAll(list: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    console.warn("[storage] kuota habis, membuang lampiran & media lama…");
    const stripped = list.map((c) => ({
      ...c,
      messages: c.messages.map(
        ({
          attachments,
          generatedImages,
          generatedVideos,
          generatedDocuments,
          generatedUI,
          ...m
        }) => m
      ),
    }));
    try {
      localStorage.setItem(KEY, JSON.stringify(stripped));
    } catch {
      console.error("[storage] gagal total, riwayat tidak disimpan");
    }
  }
}

export function upsert(conv: Conversation) {
  const list = loadAll();
  const idx = list.findIndex((c) => c.id === conv.id);
  if (idx >= 0) list[idx] = conv;
  else list.unshift(conv);
  saveAll(list);
}

export function remove(id: string) {
  saveAll(loadAll().filter((c) => c.id !== id));
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}