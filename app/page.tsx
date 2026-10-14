"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Sidebar } from "@/components/chat/Sidebar";
import { MessageList } from "@/components/chat/MessageList";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { Composer, ComposerMode, AspectRatio, DocType } from "@/components/chat/Composer";
import { EmptyState } from "@/components/chat/EmptyState";
import { showToast } from "@/lib/toast";
import { Attachment, Conversation, ChatMessage, loadAll, upsert, remove, newId } from "@/lib/storage";
import { extractHtml, isCompleteHtml } from "@/lib/ui-output";

function toApiMessages(history: ChatMessage[]) {
  return history.map((m) => {
    if (m.role === "assistant" || !m.attachments?.length) {
      return { role: m.role, content: m.content };
    }
    return {
      role: m.role,
      content: [
        { type: "text", text: m.content || " " },
        ...m.attachments.map((a) => ({ type: "image_url", image_url: { url: a.dataUrl } })),
      ],
    };
  });
}

// 🔥 Deteksi UI request di frontend (mirror dari backend, tapi dipakai untuk kirim flag)
function looksLikeUIRequest(text: string): boolean {
  const t = text.toLowerCase();
  const uiKeywords = [
    "landing page", "ui", "ux", "html", "css", "tailwind",
    "komponen", "component", "halaman", "page", "website",
    "form", "dashboard", "kanban", "board", "chat ui",
    "navbar", "hero", "footer", "modal", "card", "layout",
    "responsive", "wireframe", "mockup", "prototype",
    "multi-step", "multistep", "carousel", "slider",
    "kalkulator", "calculator", "todo", "notes", "timer",
    "pomodoro", "tictactoe", "game", "portofolio", "portfolio",
    "resume", "cv", "profile", "profil",
  ];
  const actionKeywords = [
    "buatkan", "buat", "buatin", "create", "generate", "design", "rancang", "bikin",
  ];
  const hasUIKeyword = uiKeywords.some((kw) => t.includes(kw));
  const hasActionKeyword = actionKeywords.some((kw) => t.includes(kw));
  if (hasUIKeyword && hasActionKeyword) return true;
  const uiKeywordCount = uiKeywords.filter((kw) => t.includes(kw)).length;
  if (uiKeywordCount >= 3) return true;
  if (t.includes("fitur:") && (t.includes("-") || t.includes("•"))) {
    return hasUIKeyword;
  }
  if (t.length < 40 && (t.includes("ui") || t.includes("generate") || t.includes("lanjut"))) {
    return hasActionKeyword;
  }
  return false;
}

export default function Home() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [activeModel, setActiveModel] = useState<string>("");
  const [mode, setMode] = useState<ComposerMode>("chat");
  const [aspect, setAspect] = useState<AspectRatio>("1:1");
  const [docType, setDocType] = useState<DocType>("word");
  const [imageLoading, setImageLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string>("");
  const [docLoading, setDocLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const videoPollRef = useRef<number | null>(null);

  const activeIdRef = useRef<string>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { setConvs(loadAll()); }, []);
  useEffect(() => {
    return () => {
      if (videoPollRef.current) clearTimeout(videoPollRef.current);
    };
  }, []);

  const activeConv = convs.find((c) => c.id === activeId);
  const activeArtifact = messages.find((m) => m.id === activeArtifactId && m.generatedUI);

  const cancelAll = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (videoPollRef.current) {
      clearTimeout(videoPollRef.current);
      videoPollRef.current = null;
    }
    setStreamingId(null);
    setTyping(false);
    setImageLoading(false);
    setVideoLoading(false);
    setVideoStatus("");
    setDocLoading(false);
  };

  const startNew = () => {
    cancelAll();
    const id = newId();
    setActiveId(id);
    activeIdRef.current = id;
    setMessages([]);
    setInput("");
    setAttachments([]);
    setActiveModel("");
    setMode("chat");
    setArtifactOpen(false);
    setActiveArtifactId(null);
  };

  const persist = useCallback((msgs: ChatMessage[], id: string) => {
    if (!id) return;
    const firstUser = msgs.find((m) => m.role === "user");
    const title = firstUser?.content.slice(0, 40) || (firstUser?.attachments?.length ? "Analisis gambar" : "Baru");
    const conv: Conversation = { id, title, updatedAt: Date.now(), messages: msgs };
    upsert(conv);
    setConvs(loadAll());
  }, []);

  const stillHere = (conversationId: string) => activeIdRef.current === conversationId;

  // ============================================================
  // CHAT STREAMING
  // ============================================================
  const runStream = useCallback(
    async (history: ChatMessage[], conversationId: string, forceUI: boolean = false) => {
      if (stillHere(conversationId)) setTyping(true);

      const assistantId = newId();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      };

      if (stillHere(conversationId)) {
        setMessages((prev) => [...prev, assistantMsg]);
      }

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        // 🔥 Kirim flag mode ke backend
        const requestBody: { messages: any[]; mode?: "ui" } = {
          messages: toApiMessages(history),
        };
        if (forceUI) requestBody.mode = "ui";

        if (process.env.NODE_ENV !== "production") {
          console.log(`[frontend] Sending mode = ${forceUI ? "ui" : "chat"}`);
        }

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: ctrl.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No body");

        const modelUsed = res.headers.get("X-Model-Used") ?? undefined;
        const providerUsed = res.headers.get("X-Provider-Used") ?? undefined;
        const modeHeader = res.headers.get("X-Mode");
        let isUIMode = modeHeader === "ui";

        if (stillHere(conversationId)) {
          if (modelUsed) setActiveModel(`${providerUsed ?? "?"} · ${modelUsed}`);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, model: modelUsed, provider: providerUsed }
                : m
            )
          );
          setStreamingId(assistantId);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });

          if (stillHere(conversationId)) {
            if (isUIMode) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: "🎨 Sedang merancang UI..." }
                    : m
                )
              );
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: acc } : m
                )
              );
            }
            setTyping(false);
          }
        }

        // 🔥 FALLBACK: Kalau backend salah deteksi, tapi AI tetap menghasilkan HTML lengkap
        if (!isUIMode && acc.includes("<!DOCTYPE html>") && acc.toLowerCase().includes("</html>")) {
          console.log("[frontend] Fallback: mendeteksi HTML lengkap dari output AI");
          isUIMode = true;
        }

        const finalAssistant: ChatMessage = {
          ...assistantMsg,
          content: isUIMode ? "Berikut adalah UI yang Anda minta:" : acc,
          model: modelUsed,
          provider: providerUsed,
        };

        if (isUIMode) {
          const cleanCode = extractHtml(acc);
          if (isCompleteHtml(cleanCode)) {
            finalAssistant.content = "Berikut adalah UI yang Anda minta:";
            finalAssistant.generatedUI = {
              code: cleanCode,
              prompt: history[history.length - 1].content,
            };
            if (stillHere(conversationId)) {
              setActiveArtifactId(assistantId);
              setArtifactOpen(true);
            }
          } else {
            finalAssistant.content = "⚠️ Gagal menghasilkan UI yang lengkap. Silakan coba lagi.";
          }
        }

        const finalMsgs = [...history, finalAssistant];
        persist(finalMsgs, conversationId);

        if (stillHere(conversationId)) {
          setStreamingId(null);
          setMessages(finalMsgs);
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        const msg =
          err.message === "HTTP 429"
            ? "Terlalu banyak permintaan. Tunggu sekitar 20 detik."
            : "Koneksi terputus.";
        const errMsg: ChatMessage = {
          id: newId(),
          role: "assistant",
          content: msg,
          createdAt: Date.now(),
        };
        const finalMsgs = [...history, assistantMsg, errMsg];
        persist(finalMsgs, conversationId);

        if (stillHere(conversationId)) {
          setStreamingId(null);
          setTyping(false);
          setMessages(finalMsgs);
          showToast(msg, "error");
        }
      } finally {
        abortRef.current = null;
        if (stillHere(conversationId)) composerRef.current?.focus();
      }
    },
    [persist]
  );

  // ... (generateImage, generateVideo, generateDocument, regenerateImage tetap sama)
  // Saya singkat di sini — copy dari kode Anda yang sudah ada, tidak ada perubahan
  
  const generateImage = async (prompt: string, conversationId: string) => {
    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt, createdAt: Date.now() };
    const placeholderId = newId();
    const placeholder: ChatMessage = { id: placeholderId, role: "assistant", content: "", createdAt: Date.now(), model: "…", provider: "…" };
    const afterUser = [...messages, userMsg];
    const next = [...afterUser, placeholder];
    if (stillHere(conversationId)) { setMessages(next); setImageLoading(true); }
    showToast(`Membuat gambar ${aspect}…`, "info");
    try {
      const res = await fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspect }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.detail || data?.error || `HTTP ${res.status}`); }
      const data = await res.json();
      const { dataUrl, model, provider, seed } = data;
      const finalAssistant: ChatMessage = { ...placeholder, content: "", model, provider, generatedImages: [{ id: newId(), dataUrl, prompt, model, provider, createdAt: Date.now(), seed, aspect }] };
      const finalMsgs = [...afterUser, finalAssistant];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) { setMessages(finalMsgs); setActiveModel(`${provider} · ${model}`); showToast("Gambar selesai", "success"); }
    } catch (err: any) {
      const errMsg: ChatMessage = { ...placeholder, content: `⚠️ Gagal membuat gambar: ${err.message}`, model: undefined, provider: undefined };
      const finalMsgs = [...afterUser, errMsg];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) { setMessages(finalMsgs); showToast("Gagal membuat gambar", "error"); }
    } finally { if (stillHere(conversationId)) setImageLoading(false); }
  };

  const generateVideo = async (prompt: string, conversationId: string) => {
    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt, createdAt: Date.now() };
    const placeholderId = newId();
    const placeholder: ChatMessage = { id: placeholderId, role: "assistant", content: "", createdAt: Date.now(), model: "…", provider: "…" };
    const afterUser = [...messages, userMsg];
    const next = [...afterUser, placeholder];
    if (stillHere(conversationId)) { setMessages(next); setVideoLoading(true); setVideoStatus("Mengirim…"); }
    showToast("Membuat video… (30–120 detik)", "info");
    try {
      const res = await fetch("/api/generate-video/agnes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, aspect: "16:9 (832x480)", duration: 3.5 }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.detail || data?.error || `HTTP ${res.status}`); }
      const data = await res.json();
      if (data.status !== "completed" || !data.videoUrl) throw new Error("Response tidak berisi video");
      const finalAssistant: ChatMessage = { ...placeholder, content: "", model: data.model ?? "wan-2.2-14b", provider: data.provider ?? "huggingface", generatedVideos: [{ id: newId(), videoUrl: data.videoUrl, prompt, model: data.model ?? "wan-2.2-14b", provider: data.provider ?? "huggingface", createdAt: Date.now() }] };
      const finalMsgs = [...afterUser, finalAssistant];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) { setMessages(finalMsgs); setActiveModel(`${data.provider} · ${data.model}`); showToast("Video siap!", "success"); }
    } catch (err: any) {
      const errMsg: ChatMessage = { ...placeholder, content: `⚠️ Gagal membuat video: ${err.message}`, model: undefined, provider: undefined };
      const finalMsgs = [...afterUser, errMsg];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) { setMessages(finalMsgs); showToast("Gagal membuat video", "error"); }
    } finally { if (stillHere(conversationId)) { setVideoLoading(false); setVideoStatus(""); } }
  };

  const generateDocument = async (prompt: string, conversationId: string) => {
    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt, createdAt: Date.now() };
    const placeholderId = newId();
    const placeholder: ChatMessage = { id: placeholderId, role: "assistant", content: "", createdAt: Date.now(), model: "…", provider: "…" };
    const afterUser = [...messages, userMsg];
    const next = [...afterUser, placeholder];
    if (stillHere(conversationId)) { setMessages(next); setDocLoading(true); }
    showToast(`Membuat ${docType === "word" ? "Word" : "Excel"}…`, "info");
    try {
      const res = await fetch("/api/generate-document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, type: docType }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.detail || data?.error || `HTTP ${res.status}`); }
      const data = await res.json();
      const { fileName, mimeType, base64, size } = data;
      const finalAssistant: ChatMessage = { ...placeholder, content: "", model: docType === "word" ? "docx-builder" : "xlsx-builder", provider: "local", generatedDocuments: [{ id: newId(), fileName, mimeType, base64, size, docType, prompt, createdAt: Date.now() }] };
      const finalMsgs = [...afterUser, finalAssistant];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) { setMessages(finalMsgs); setActiveModel(`local · ${docType}`); showToast("Dokumen siap", "success"); }
      try {
        const byteChars = atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
        const blob = new Blob([byteArray], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      } catch (e) { console.warn("[doc] auto-download gagal:", e); }
    } catch (err: any) {
      const errMsg: ChatMessage = { ...placeholder, content: `⚠️ Gagal membuat dokumen: ${err.message}`, model: undefined, provider: undefined };
      const finalMsgs = [...afterUser, errMsg];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) { setMessages(finalMsgs); showToast("Gagal membuat dokumen", "error"); }
    } finally { if (stillHere(conversationId)) setDocLoading(false); }
  };

  const regenerateImage = async (messageId: string) => {
    const conversationId = activeId;
    if (!conversationId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.generatedImages?.length) return;
    const prevImg = msg.generatedImages[0];
    const keepAspect = (prevImg.aspect as AspectRatio) ?? "1:1";
    showToast("Membuat variasi baru…", "info");
    try {
      const res = await fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prevImg.prompt, aspect: keepAspect }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.detail || data?.error || `HTTP ${res.status}`); }
      const data = await res.json();
      const { dataUrl, model, provider, seed } = data;
      const updated = messages.map((m) => m.id === messageId ? { ...m, model, provider, generatedImages: [{ id: newId(), dataUrl, prompt: prevImg.prompt, model, provider, createdAt: Date.now(), seed, aspect: keepAspect }] } : m);
      persist(updated, conversationId);
      if (stillHere(conversationId)) { setMessages(updated); showToast("Variasi baru siap", "success"); }
    } catch (err: any) {
      if (stillHere(conversationId)) showToast(`Gagal: ${err.message}`, "error");
    }
  };

  // ============================================================
  // SEND
  // ============================================================
  const send = () => {
    const text = input.trim();
    if (!text) return;
    let id = activeId;
    if (!id) {
      id = newId();
      setActiveId(id);
      activeIdRef.current = id;
    }

    if (mode === "image") { generateImage(text, id); setInput(""); return; }
    if (mode === "video") { generateVideo(text, id); setInput(""); return; }
    if (mode === "document") { generateDocument(text, id); setInput(""); return; }

    // 🔥 Deteksi UI request di frontend
    const forceUI = looksLikeUIRequest(text);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[frontend] looksLikeUIRequest("${text}") = ${forceUI}`);
    }

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: text,
      createdAt: Date.now(),
      attachments: attachments.length ? attachments : undefined,
    };
    const next = [...messages, userMsg];

    if (stillHere(id)) setMessages(next);
    setInput("");
    setAttachments([]);
    persist(next, id);
    runStream(next, id, forceUI);
  };

  const stop = () => abortRef.current?.abort();

  const onRegenerate = () => {
    if (!messages.length) return;
    const without = [...messages];
    while (without.length && without[without.length - 1].role === "assistant") {
      without.pop();
    }
    const id = activeId;
    if (!id) return;
    const lastUserMsg = [...without].reverse().find((m) => m.role === "user");
    const forceUI = lastUserMsg ? looksLikeUIRequest(lastUserMsg.content) : false;
    if (stillHere(id)) setMessages(without);
    persist(without, id);
    runStream(without, id, forceUI);
  };

  const onEdit = (id: string, content: string) => {
    const conversationId = activeId;
    if (!conversationId) return;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const trimmed = messages
      .slice(0, idx + 1)
      .map((m) => (m.id === id ? { ...m, content } : m));
    const forceUI = looksLikeUIRequest(content);
    if (stillHere(conversationId)) setMessages(trimmed);
    persist(trimmed, conversationId);
    runStream(trimmed, conversationId, forceUI);
  };

  const selectConv = (id: string) => {
    cancelAll();
    const c = convs.find((x) => x.id === id);
    if (!c) return;
    setActiveId(id);
    activeIdRef.current = id;
    setMessages(c.messages);
    setInput("");
    setAttachments([]);
    setMode("chat");
    const lastAssistant = [...c.messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.model);
    setActiveModel(
      lastAssistant?.model
        ? `${lastAssistant.provider ?? "?"} · ${lastAssistant.model}`
        : ""
    );

    const lastUI = [...c.messages].reverse().find((m) => m.generatedUI);
    if (lastUI) {
      setActiveArtifactId(lastUI.id);
      setArtifactOpen(true);
    } else {
      setActiveArtifactId(null);
      setArtifactOpen(false);
    }
  };

  const deleteConv = (id: string) => {
    remove(id);
    setConvs(loadAll());
    if (id === activeId) {
      cancelAll();
      setActiveId("");
      activeIdRef.current = "";
      setMessages([]);
      setAttachments([]);
      setActiveModel("");
      setArtifactOpen(false);
      setActiveArtifactId(null);
    }
    showToast("Percakapan dihapus", "info");
  };

  const handleOpenArtifact = (messageId: string) => {
    setActiveArtifactId(messageId);
    setArtifactOpen(true);
  };

  return (
    <div className="flex h-dvh bg-neutral-950 text-neutral-100">
      {isDesktop && (
        <Sidebar
          items={convs}
          activeId={activeId}
          onNew={startNew}
          onSelect={selectConv}
          onDelete={deleteConv}
        />
      )}

      {!isDesktop && sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 shadow-2xl">
            <Sidebar
              items={convs}
              activeId={activeId}
              onNew={() => { startNew(); setSidebarOpen(false); }}
              onSelect={(id) => { selectConv(id); setSidebarOpen(false); }}
              onDelete={deleteConv}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </>
      )}

      <div className="flex-1 flex min-w-0">
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-12 border-b border-neutral-800 flex items-center px-3 md:px-4 text-sm text-neutral-400 gap-3">
            {!isDesktop && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-1.5 hover:bg-neutral-800 text-neutral-300 shrink-0"
                aria-label="Buka sidebar"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
            <span className="truncate">{activeConv?.title || "Chat baru"}</span>
            {activeArtifact && !artifactOpen && (
              <button
                onClick={() => setArtifactOpen(true)}
                className="ml-auto shrink-0 text-[11px] px-2.5 py-1 rounded-md bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 transition"
              >
                🎨 Buka UI
              </button>
            )}
            {videoLoading && videoStatus && (
              <span className="ml-auto shrink-0 text-xs text-amber-400 font-mono">{videoStatus}</span>
            )}
            {!videoLoading && !activeArtifact && activeModel && (
              <span className="ml-auto shrink-0 text-xs text-neutral-500 font-mono truncate max-w-[40%]">
                {activeModel}
              </span>
            )}
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
              onRegenerateImage={regenerateImage}
              onEdit={onEdit}
              activeArtifactId={activeArtifactId}
              onOpenArtifact={handleOpenArtifact}
            />
          )}

          <Composer
            ref={composerRef}
            value={input}
            onChange={setInput}
            onSend={send}
            onStop={stop}
            streaming={!!streamingId || imageLoading || videoLoading || docLoading}
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            mode={mode}
            onModeChange={setMode}
            aspect={aspect}
            onAspectChange={setAspect}
            docType={docType}
            onDocTypeChange={setDocType}
          />
        </main>

        {artifactOpen && activeArtifact && activeArtifact.generatedUI && (
          <>
            {isDesktop ? (
              <div className="w-[45%] min-w-[380px] max-w-[720px] shrink-0 animate-[slideInRight_0.2s_ease-out]">
                <ArtifactPanel
                  code={activeArtifact.generatedUI.code}
                  prompt={activeArtifact.generatedUI.prompt}
                  onClose={() => setArtifactOpen(false)}
                />
              </div>
            ) : (
              <div className="fixed inset-0 z-50 bg-neutral-950 animate-[slideInRight_0.2s_ease-out]">
                <ArtifactPanel
                  code={activeArtifact.generatedUI.code}
                  prompt={activeArtifact.generatedUI.prompt}
                  onClose={() => setArtifactOpen(false)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}