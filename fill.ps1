# fill.ps1 - Isi otomatis semua file proyek chat-app
$root = "D:\gibrand.my.id\chat-app"

function Write-Utf8($path, $content) {
    $full = Join-Path $root $path
    $dir = Split-Path -Parent $full
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [IO.File]::WriteAllText($full, $content, [Text.UTF8Encoding]::new($false))
    Write-Host "  OK  $path"
}

Write-Host "`nMenulis file...`n"

# ---------- lib/rate-limit.ts ----------
Write-Utf8 "lib\rate-limit.ts" @'
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
type Bucket = number[];
const buckets = new Map<string, Bucket>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of buckets.entries()) {
      const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
      if (fresh.length === 0) buckets.delete(key);
      else buckets.set(key, fresh);
    }
  }, WINDOW_MS).unref?.();
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= MAX_REQUESTS) {
    buckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}

export function getRateLimitInfo(key: string) {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const remaining = Math.max(0, MAX_REQUESTS - timestamps.length);
  const resetInMs = timestamps.length > 0 ? WINDOW_MS - (now - timestamps[0]) : 0;
  return { remaining, resetInSeconds: Math.ceil(resetInMs / 1000) };
}

export function _resetRateLimit() { buckets.clear(); }
'@

# ---------- lib/storage.ts ----------
Write-Utf8 "lib\storage.ts" @'
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
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
  localStorage.setItem(KEY, JSON.stringify(list));
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
'@

# ---------- hooks/useAutoScroll.ts ----------
Write-Utf8 "hooks\useAutoScroll.ts" @'
"use client";
import { useEffect, useRef, useState } from "react";

export function useAutoScroll<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setPinned(dist < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pinned) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  const jumpToBottom = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPinned(true);
  };

  return { ref, pinned, jumpToBottom };
}
'@

# ---------- components/chat/CodeBlock.tsx ----------
Write-Utf8 "components\chat\CodeBlock.tsx" @'
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
    const text = extractText(children);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-neutral-400 bg-neutral-900">
        <span>{lang}</span>
        <button
          onClick={copy}
          className="rounded px-2 py-0.5 hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
          aria-label="Salin kode"
        >
          {copied ? "Tersalin" : "Copy"}
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
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in (node as any)) {
    return extractText((node as any).props.children);
  }
  return "";
}
'@

# ---------- components/chat/Markdown.tsx ----------
Write-Utf8 "components\chat\Markdown.tsx" @'
"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "./CodeBlock";
import "highlight.js/styles/github-dark.css";

export function Markdown({ content }: { content: string }) {
  return (
    <div className="text-[15px] leading-7 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_a]:text-sky-400 [&_a]:underline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ inline, className, children, ...props }: any) {
            if (inline) {
              return (
                <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[13px]">
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
'@

# ---------- components/chat/MessageBubble.tsx ----------
Write-Utf8 "components\chat\MessageBubble.tsx" @'
"use client";
import { memo, useState } from "react";
import { Markdown } from "./Markdown";
import type { ChatMessage } from "@/lib/storage";

type Props = {
  message: ChatMessage;
  streaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  isLast?: boolean;
};

export const MessageBubble = memo(function MessageBubble({
  message,
  streaming,
  onRegenerate,
  onEdit,
  isLast,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const isUser = message.role === "user";

  const copy = () => navigator.clipboard.writeText(message.content);

  return (
    <div className={`group flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 h-7 w-7 shrink-0 rounded-full bg-sky-600 text-xs grid place-items-center">
          AI
        </div>
      )}

      <div
        className={[
          "max-w-[75ch] rounded-2xl px-4 py-3",
          isUser
            ? "bg-sky-600/90 text-white"
            : "bg-neutral-900 text-neutral-100 border border-neutral-800",
        ].join(" ")}
      >
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
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <Markdown content={message.content} />
            {streaming && (
              <span className="inline-block w-2 h-4 align-middle bg-sky-400 animate-pulse ml-0.5" />
            )}
          </>
        )}

        {!streaming && !editing && (
          <div className="mt-2 flex gap-3 text-xs text-neutral-400 opacity-0 group-hover:opacity-100 transition">
            <button onClick={copy} className="hover:text-neutral-200">Copy</button>
            {isUser && (
              <button onClick={() => setEditing(true)} className="hover:text-neutral-200">
                Edit
              </button>
            )}
            {!isUser && isLast && onRegenerate && (
              <button onClick={onRegenerate} className="hover:text-neutral-200">
                Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
'@

# ---------- components/chat/MessageList.tsx ----------
Write-Utf8 "components\chat\MessageList.tsx" @'
"use client";
import { MessageBubble } from "./MessageBubble";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { ChatMessage } from "@/lib/storage";

type Props = {
  messages: ChatMessage[];
  streamingId: string | null;
  onRegenerate: () => void;
  onEdit: (id: string, content: string) => void;
  typing?: boolean;
};

export function MessageList({
  messages,
  streamingId,
  onRegenerate,
  onEdit,
  typing,
}: Props) {
  const { ref, pinned, jumpToBottom } = useAutoScroll<HTMLDivElement>([
    messages.length,
    messages[messages.length - 1]?.content,
  ]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={ref}
        className="h-full overflow-y-auto px-4 md:px-8 py-6 space-y-6"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            streaming={m.id === streamingId}
            isLast={i === messages.length - 1}
            onRegenerate={onRegenerate}
            onEdit={(c) => onEdit(m.id, c)}
          />
        ))}
        {typing && (
          <div className="text-neutral-400 text-sm animate-pulse">Sedang mengetik...</div>
        )}
      </div>

      {!pinned && (
        <button
          onClick={jumpToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm shadow-lg hover:bg-neutral-700"
        >
          Ke pesan terbaru
        </button>
      )}
    </div>
  );
}
'@

# ---------- components/chat/Composer.tsx ----------
Write-Utf8 "components\chat\Composer.tsx" @'
"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
};

export const Composer = forwardRef<HTMLTextAreaElement, Props>(
  function Composer({ value, onChange, onSend, onStop, streaming }, fwd) {
    const inner = useRef<HTMLTextAreaElement>(null);
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

    return (
      <div className="border-t border-neutral-800 bg-neutral-950/80 backdrop-blur p-3 md:p-4">
        <div className="mx-auto max-w-3xl flex items-end gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2 focus-within:border-sky-600">
          <textarea
            ref={inner}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Tulis pesan..."
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
              disabled={!value.trim()}
              className="rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-3 py-2 text-sm font-medium"
              aria-label="Kirim"
            >
              Kirim
            </button>
          )}
        </div>
      </div>
    );
  }
);
'@

# ---------- components/chat/EmptyState.tsx ----------
Write-Utf8 "components\chat\EmptyState.tsx" @'
"use client";
const SAMPLES = [
  "Jelaskan event loop di JavaScript dengan analogi sederhana.",
  "Buatkan function TypeScript untuk debounce.",
  "Apa perbedaan SSR, SSG, dan ISR di Next.js?",
  "Tolong review kode ini dan sebutkan 3 perbaikannya: function sum(a,b){return a+b}",
];

export function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="h-full grid place-items-center px-6">
      <div className="max-w-xl w-full text-center">
        <h1 className="text-2xl md:text-3xl font-semibold mb-2">
          Ada yang bisa saya bantu?
        </h1>
        <p className="text-neutral-400 mb-6">
          Mulai dari salah satu contoh, atau tulis pertanyaanmu sendiri.
        </p>
        <div className="grid gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="text-left rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 px-4 py-3 text-sm"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
'@

# ---------- components/chat/Sidebar.tsx ----------
Write-Utf8 "components\chat\Sidebar.tsx" @'
"use client";
import type { Conversation } from "@/lib/storage";

export function Sidebar({
  items,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: {
  items: Conversation[];
  activeId?: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="w-72 shrink-0 border-r border-neutral-800 bg-neutral-950 flex flex-col">
      <div className="p-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 px-3 py-2 text-sm font-medium"
        >
          + Chat baru
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-1 text-sm">
        {items.length === 0 && (
          <p className="px-3 py-2 text-neutral-500">Belum ada riwayat.</p>
        )}
        {items.map((c) => (
          <div
            key={c.id}
            className={[
              "group flex items-center gap-1 rounded-md px-2",
              c.id === activeId ? "bg-neutral-800" : "hover:bg-neutral-900",
            ].join(" ")}
          >
            <button
              onClick={() => onSelect(c.id)}
              className="flex-1 text-left truncate py-2"
            >
              {c.title || "Tanpa judul"}
            </button>
            <button
              onClick={() => onDelete(c.id)}
              className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 px-1"
              aria-label="Hapus"
            >
              x
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
'@

# ---------- app/api/chat/route.ts ----------
Write-Utf8 "app\api\chat\route.ts" @'
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_INPUT_CHARS = 8000;
const MAX_MESSAGES = 40;

type Msg = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limit" }), {
      status: 429,
      headers: { "Retry-After": "20" },
    });
  }

  let body: { messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return new Response("Bad messages", { status: 400 });
  }
  const last = messages[messages.length - 1];
  if (last.content.length > MAX_INPUT_CHARS) {
    return new Response("Input too long", { status: 413 });
  }

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        { role: "system", content: "Jawab singkat, ramah, pakai bahasa Indonesia." },
        ...messages,
      ],
    }),
    signal: req.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data);
              const token = json.choices?.[0]?.delta?.content;
              if (token) controller.enqueue(encoder.encode(token));
            } catch {}
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
'@

# ---------- app/page.tsx ----------
Write-Utf8 "app\page.tsx" @'
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/chat/Sidebar";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { EmptyState } from "@/components/chat/EmptyState";
import {
  Conversation,
  ChatMessage,
  loadAll,
  upsert,
  remove,
  newId,
} from "@/lib/storage";

export default function Home() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setConvs(loadAll());
  }, []);

  const activeConv = convs.find((c) => c.id === activeId);

  const startNew = () => {
    const id = newId();
    setActiveId(id);
    setMessages([]);
    setInput("");
  };

  const persist = useCallback(
    (msgs: ChatMessage[], id = activeId) => {
      if (!id) return;
      const title =
        msgs.find((m) => m.role === "user")?.content.slice(0, 40) ?? "Baru";
      const conv: Conversation = {
        id,
        title,
        updatedAt: Date.now(),
        messages: msgs,
      };
      upsert(conv);
      setConvs(loadAll());
    },
    [activeId]
  );

  const runStream = useCallback(
    async (history: ChatMessage[]) => {
      setTyping(true);
      const assistantId = newId();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "", createdAt: Date.now() },
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No body");

        setStreamingId(assistantId);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          acc += chunk;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
          );
          setTyping(false);
        }

        setStreamingId(null);
        setMessages((prev) => {
          const next = [...prev];
          persist(next);
          return next;
        });
      } catch (err: any) {
        setStreamingId(null);
        setTyping(false);
        if (err.name !== "AbortError") {
          const msg =
            err.message === "HTTP 429"
              ? "Terlalu banyak permintaan. Tunggu sekitar 20 detik lalu coba lagi."
              : "Koneksi terputus. Periksa jaringanmu dan coba lagi.";
          setMessages((prev) => [
            ...prev,
            { id: newId(), role: "assistant", content: msg, createdAt: Date.now() },
          ]);
        }
      } finally {
        abortRef.current = null;
        composerRef.current?.focus();
      }
    },
    [persist]
  );

  const send = () => {
    const text = input.trim();
    if (!text) return;
    let id = activeId;
    if (!id) {
      id = newId();
      setActiveId(id);
    }
    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    runStream(next);
    setTimeout(() => persist(next, id), 0);
  };

  const stop = () => abortRef.current?.abort();

  const onRegenerate = () => {
    if (!messages.length) return;
    const without = [...messages];
    while (without.length && without[without.length - 1].role === "assistant") {
      without.pop();
    }
    setMessages(without);
    runStream(without);
  };

  const onEdit = (id: string, content: string) => {
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const trimmed = messages.slice(0, idx + 1).map((m) =>
      m.id === id ? { ...m, content } : m
    );
    setMessages(trimmed);
    runStream(trimmed);
  };

  const selectConv = (id: string) => {
    const c = convs.find((x) => x.id === id);
    if (!c) return;
    setActiveId(id);
    setMessages(c.messages);
    setInput("");
  };

  const deleteConv = (id: string) => {
    remove(id);
    setConvs(loadAll());
    if (id === activeId) {
      setActiveId("");
      setMessages([]);
    }
  };

  return (
    <div className="flex h-dvh bg-neutral-950 text-neutral-100">
      <div className="hidden md:flex">
        <Sidebar
          items={convs}
          activeId={activeId}
          onNew={startNew}
          onSelect={selectConv}
          onDelete={deleteConv}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-neutral-800 flex items-center px-4 text-sm text-neutral-400">
          {activeConv?.title || "Chat baru"}
        </header>

        {messages.length === 0 ? (
          <EmptyState
            onPick={(s) => {
              setInput(s);
              composerRef.current?.focus();
            }}
          />
        ) : (
          <MessageList
            messages={messages}
            streamingId={streamingId}
            typing={typing}
            onRegenerate={onRegenerate}
            onEdit={onEdit}
          />
        )}

        <Composer
          ref={composerRef}
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          streaming={!!streamingId}
        />
      </main>
    </div>
  );
}
'@

# ---------- app/layout.tsx ----------
Write-Utf8 "app\layout.tsx" @'
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat Streaming" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="antialiased bg-neutral-950 text-neutral-100">
        {children}
      </body>
    </html>
  );
}
'@

Write-Host "`nSelesai. Semua file terisi.`n"
Write-Host "Langkah berikutnya:" -ForegroundColor Yellow
Write-Host "  1. npm i react-markdown remark-gfm rehype-highlight highlight.js"
Write-Host "  2. Hapus .next:  Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue"
Write-Host "  3. npm run dev"