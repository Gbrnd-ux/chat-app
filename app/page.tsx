"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Sidebar } from "@/components/chat/Sidebar";
import { MessageList } from "@/components/chat/MessageList";
import { ArtifactPanel } from "@/components/chat/ArtifactPanel";
import { Composer, ComposerMode, AspectRatio, DocType } from "@/components/chat/Composer";
import { EmptyState } from "@/components/chat/EmptyState";
import { showToast } from "@/lib/toast";
import { Attachment, Conversation, ChatMessage, newId } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { getUserChats, getChatById, saveChatToSupabase, deleteChatFromSupabase, resolveChatId } from "@/lib/chat-service";
import { extractHtml, isCompleteHtml } from "@/lib/ui-output";
import {
  checkDocClarification,
  isAnsweringClarification,
  extractInfoFromHistory,
  buildNextQuestion,
  isInfoComplete,
  extractLastQuestionField,
  detectKindExport,
  type InfoMatch,
} from "@/lib/doc-clarification";
/* -------------------------------------------------------------------------- */
/* Helper: Compress image agar payload kecil                                  */
/* -------------------------------------------------------------------------- */

const COMPRESS_THRESHOLD_BYTES = 400 * 1024;
const COMPRESS_MAX_SIZE = 1280;
const COMPRESS_QUALITY = 0.82;

function dataUrlSizeBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

async function compressImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (dataUrlSizeBytes(dataUrl) < COMPRESS_THRESHOLD_BYTES) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > COMPRESS_MAX_SIZE || height > COMPRESS_MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * COMPRESS_MAX_SIZE) / width);
            width = COMPRESS_MAX_SIZE;
          } else {
            width = Math.round((width * COMPRESS_MAX_SIZE) / height);
            height = COMPRESS_MAX_SIZE;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL("image/jpeg", COMPRESS_QUALITY);
        resolve(compressed);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* -------------------------------------------------------------------------- */
/* Helper: Fetch dengan retry otomatis                                        */
/* -------------------------------------------------------------------------- */

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);

      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        return res;
      }

      lastError = new Error(`HTTP ${res.status}`);
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[retry] attempt ${attempt + 1}/${maxRetries + 1} gagal (${res.status})`);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      lastError = err;
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[retry] attempt ${attempt + 1}/${maxRetries + 1} error: ${err?.message}`);
      }
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
    }
  }

  throw lastError ?? new Error("Semua percobaan gagal");
}

/* -------------------------------------------------------------------------- */
/* Helper: Transform chat history untuk API                                   */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Komponen Utama                                                             */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
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

  const [user, setUser] = useState<any>(null);
  const userRef = useRef<any>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const activeIdRef = useRef<string>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
        getUserChats(user.id).then((chats) => {
          setConvs(chats);
        });
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        getUserChats(session.user.id).then((chats) => {
          setConvs(chats);
        });
      } else {
        setUser(null);
        setConvs([]);
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

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
    setMode("chat");
    setArtifactOpen(false);
    setActiveArtifactId(null);
  };

  const persist = useCallback((msgs: ChatMessage[], id: string) => {
    if (!id) return;
    const resolvedId = resolveChatId(id);
    const firstUser = msgs.find((m) => m.role === "user");
    const title = firstUser?.content.slice(0, 40) || (firstUser?.attachments?.length ? "Analisis gambar" : "Baru");
    const conv: Conversation = { id: resolvedId, title, updatedAt: Date.now(), messages: msgs };

    setConvs((prev) => {
      const idx = prev.findIndex((c) => c.id === resolvedId || c.id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = conv;
        return next;
      }
      return [conv, ...prev];
    });

    const currentUser = userRef.current;
    if (currentUser?.id) {
      saveChatToSupabase(currentUser.id, id, title, msgs).then((dbId) => {
        if (dbId) {
          if (activeIdRef.current === id || activeIdRef.current === resolvedId) {
            setActiveId(dbId);
            activeIdRef.current = dbId;
          }
          setConvs((prev) => {
            const exists = prev.some((c) => c.id === dbId);
            if (exists) {
              return prev
                .filter((c) => c.id !== id || id === dbId)
                .map((c) => (c.id === dbId ? { ...c, title, messages: msgs, updatedAt: Date.now() } : c));
            }
            return prev.map((c) => (c.id === id ? { ...c, id: dbId } : c));
          });
        }
      });
    }
  }, []);

  const stillHere = (conversationId: string) => {
    const cur = activeIdRef.current;
    if (cur === conversationId) return true;
    if (resolveChatId(conversationId) === cur) return true;
    if (resolveChatId(cur) === conversationId) return true;
    if (resolveChatId(conversationId) === resolveChatId(cur)) return true;
    return false;
  };

  /* ============================================================ */
  /* CHAT STREAMING                                                */
  /* ============================================================ */
  const runStream = useCallback(
    async (history: ChatMessage[], conversationId: string) => {
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
        const res = await fetchWithRetry(
          "/api/chat",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: toApiMessages(history) }),
            signal: ctrl.signal,
          },
          2
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No body");

        let isUIMode = false;

        if (stillHere(conversationId)) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m } : m))
          );
          setStreamingId(assistantId);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let streamError: Error | null = null;

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });

            if (stillHere(conversationId)) {
              if (!isUIMode && acc.includes("<!DOCTYPE html>")) {
                isUIMode = true;
              }

              if (isUIMode) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: "🎨 Sedang merancang UI..." } : m
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
        } catch (readErr: any) {
          streamError = readErr;
          if (process.env.NODE_ENV !== "production") {
            console.warn("[stream] terputus di tengah:", readErr?.message);
          }
        }

        if (!isUIMode && acc.includes("<!DOCTYPE html>") && acc.includes("</html>")) {
          if (process.env.NODE_ENV !== "production") {
            console.log("[frontend] Fallback: mendeteksi HTML lengkap dari output AI");
          }
          isUIMode = true;
        }

        if (streamError && acc.length === 0) {
          throw streamError;
        }

        const finalAssistant: ChatMessage = {
          ...assistantMsg,
          content: isUIMode ? "Berikut adalah UI yang Anda minta:" : acc,
        };

        if (streamError && acc.length > 0 && !isUIMode) {
          finalAssistant.content = acc + "\n\n_⚠️ Koneksi terputus di tengah, jawaban mungkin tidak lengkap._";
        }

        if (isUIMode) {
  // 🔥 Deteksi apakah output terpotong (marker dari backend)
  const wasTruncated = acc.includes("__TRUNCATED__");
  
  let cleanCode = extractHtml(acc);

  // 🔥 Auto-patch: kalau HTML belum lengkap, tutup tag yang terbuka
  if (cleanCode.includes("<html") && !cleanCode.includes("</html>")) {
    console.warn("[UI] HTML terpotong, auto-close tags...");

    // Hitung tag terbuka yang belum ditutup
    const countOpen = (tag: string) =>
      (cleanCode.match(new RegExp(`<${tag}\\b`, "g")) || []).length;
    const countClose = (tag: string) =>
      (cleanCode.match(new RegExp(`</${tag}>`, "g")) || []).length;

    const missingSections = Math.max(0, countOpen("section") - countClose("section"));
    const missingDivs = Math.max(0, countOpen("div") - countClose("div"));
    const missingMain = Math.max(0, countOpen("main") - countClose("main"));
    const missingHeader = Math.max(0, countOpen("header") - countClose("header"));
    const missingFooter = Math.max(0, countOpen("footer") - countClose("footer"));
    const missingNav = Math.max(0, countOpen("nav") - countClose("nav"));

    // Tutup dari dalam ke luar
    let patched = cleanCode;
    patched += "\n" + "</nav>".repeat(missingNav);
    patched += "\n" + "</header>".repeat(missingHeader);
    patched += "\n" + "</section>".repeat(missingSections);
    patched += "\n" + "</div>".repeat(missingDivs);
    patched += "\n" + "</main>".repeat(missingMain);
    patched += "\n" + "</footer>".repeat(missingFooter);
    patched += "\n</body>\n</html>";

    cleanCode = patched;
    console.log("[UI] Patched: +" + missingSections + " sections, +" + missingDivs + " divs");
  }

  if (cleanCode.includes("</html>")) {
    finalAssistant.content = wasTruncated
      ? "UI selesai (dengan auto-patch karena output terpotong)."
      : "Berikut adalah UI yang Anda minta:";
    finalAssistant.generatedUI = {
      code: cleanCode,
      prompt: history[history.length - 1].content,
    };
    if (stillHere(conversationId)) {
      setActiveArtifactId(assistantId);
      setArtifactOpen(true);
    }
  } else {
    finalAssistant.content =
      "⚠️ UI tidak bisa dirender. Coba prompt lebih singkat atau ketik regenerate.";
  }
}
        const finalMsgs = [...history, finalAssistant];
        persist(finalMsgs, conversationId);

        if (stillHere(conversationId)) {
          setStreamingId(null);
          setTyping(false);
          setMessages(finalMsgs);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;

        if (process.env.NODE_ENV !== "production") {
          console.error("[stream error]", {
            name: err?.name,
            message: err?.message,
            time: new Date().toISOString(),
          });
        }

        let msg = "Koneksi terputus. Coba lagi ya.";
        if (err.message === "HTTP 429") {
          msg = "Terlalu banyak permintaan. Tunggu sekitar 20 detik lalu coba lagi.";
        } else if (err.message?.startsWith("HTTP 5")) {
          msg = "Server AI sedang sibuk. Tunggu sebentar lalu coba lagi.";
        } else if (err.message === "HTTP 413") {
          msg = "Gambar terlalu besar. Coba kompres atau pakai gambar yang lebih kecil.";
        }

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
        if (stillHere(conversationId)) {
          setTyping(false);
          setStreamingId(null);
          composerRef.current?.focus();
        }
      }
    },
    [persist]
  );

  /* ============================================================ */
  /* IMAGE                                                         */
  /* ============================================================ */
  const generateImage = async (prompt: string, conversationId: string) => {
    const userMsg: ChatMessage = { id: newId(), role: "user", content: prompt, createdAt: Date.now() };
    const placeholderId = newId();
    const placeholder: ChatMessage = {
      id: placeholderId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
    };
    const afterUser = [...messages, userMsg];
    const next = [...afterUser, placeholder];

    if (stillHere(conversationId)) {
      setMessages(next);
      setImageLoading(true);
    }
    showToast(`Membuat gambar ${aspect}…`, "info");

    try {
      const res = await fetchWithRetry("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspect }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const { dataUrl, seed } = data;
      const finalAssistant: ChatMessage = {
        ...placeholder,
        content: "",
        generatedImages: [
          {
            id: newId(),
            dataUrl,
            prompt,
            createdAt: Date.now(),
            seed,
            aspect,
          },
        ],
      };
      const finalMsgs = [...afterUser, finalAssistant];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) {
        setMessages(finalMsgs);
        showToast("Gambar selesai", "success");
      }
    } catch (err: any) {
      const errMsg: ChatMessage = {
        ...placeholder,
        content: `⚠️ Gagal membuat gambar: ${err.message}`,
      };
      const finalMsgs = [...afterUser, errMsg];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) {
        setMessages(finalMsgs);
        showToast("Gagal membuat gambar", "error");
      }
    } finally {
      if (stillHere(conversationId)) setImageLoading(false);
    }
  };

  /* ============================================================ */
  /* DOCUMENT — helper: build file                                 */
  /* ============================================================ */
  const doGenerateDocument = async (
    prompt: string,
    afterUser: ChatMessage[],
    conversationId: string
  ) => {
    const placeholderId = newId();
    const placeholder: ChatMessage = {
      id: placeholderId,
      role: "assistant",
      content: "📝 Sedang menyusun dokumen, mohon tunggu (10-30 detik)…",
      createdAt: Date.now(),
    };
    const next = [...afterUser, placeholder];

    if (stillHere(conversationId)) {
      setMessages(next);
      setDocLoading(true);
    }
    showToast(`Menyusun ${docType === "word" ? "Word" : "Excel"}…`, "info");

    try {
      const res = await fetchWithRetry("/api/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, type: docType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      // Backend minta klarifikasi (fallback)
      if (data.status === "needs_clarification" && data.question) {
        const clarifyMsg: ChatMessage = {
          ...placeholder,
          content: `🤔 ${data.question}`,
        };
        const finalMsgs = [...afterUser, clarifyMsg];
        persist(finalMsgs, conversationId);
        if (stillHere(conversationId)) {
          setMessages(finalMsgs);
          showToast("AI butuh info tambahan", "info");
        }
        return;
      }

      // Sukses generate
      const { fileName, mimeType, base64, size } = data;
      const finalAssistant: ChatMessage = {
        ...placeholder,
        content: "",
        hasDoc: true, // 👈 session boundary untuk memory
        generatedDocuments: [
          {
            id: newId(),
            fileName,
            mimeType,
            base64,
            size,
            docType,
            prompt,
            createdAt: Date.now(),
          },
        ],
      };
      const finalMsgs = [...afterUser, finalAssistant];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) {
        setMessages(finalMsgs);
        showToast(
          data.source === "ai" ? "Dokumen siap (AI)" : "Dokumen siap",
          "success"
        );
      }

      // Auto-download
      try {
        const byteChars = atob(base64);
        const byteArray = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteArray[i] = byteChars.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[doc] auto-download gagal:", e);
        }
      }
    } catch (err: any) {
      const errMsg: ChatMessage = {
        ...placeholder,
        content: `⚠️ Gagal membuat dokumen: ${err.message}`,
      };
      const finalMsgs = [...afterUser, errMsg];
      persist(finalMsgs, conversationId);
      if (stillHere(conversationId)) {
        setMessages(finalMsgs);
        showToast("Gagal membuat dokumen", "error");
      }
    } finally {
      if (stillHere(conversationId)) setDocLoading(false);
    }
  };

  /* ============================================================ */
  /* DOCUMENT — entry point dengan memory & force generate         */
  /* ============================================================ */
  /* ============================================================ */
/* DOCUMENT — step-by-step questioning                           */
/* ============================================================ */
const generateDocument = async (prompt: string, conversationId: string) => {
  const isAnswer = isAnsweringClarification(messages);

  const userMsg: ChatMessage = {
    id: newId(),
    role: "user",
    content: prompt,
    createdAt: Date.now(),
  };
  const afterUser = [...messages, userMsg];

  // Extract info + kind dari semua msgs
  const { text: combinedText, info } = extractInfoFromHistory(afterUser);
  const kind = detectKindExport(combinedText);

  // Merge lastQField (untuk handle jawaban pendek seperti "UI/UX")
  const lastQField = extractLastQuestionField(afterUser);
  if (lastQField && !info[lastQField as keyof InfoMatch]) {
    (info as any)[lastQField] = true;
  }

  // KASUS A: User menjawab klarifikasi
  if (isAnswer) {
    // Force generate
    const forceGenerate = /^(generate|gas|langsung|buat|oke|ok|ya|yes|skip|lompati|cukup)$/i.test(
      prompt.trim()
    );

    const complete = isInfoComplete(info, kind);
    const userMsgCount = afterUser.filter((m) => m.role === "user").length;
    const tooManyAnswers = userMsgCount >= 6;

    // Debug
    if (process.env.NODE_ENV !== "production") {
      console.log("[doc] kind:", kind, "info:", info);
      console.log("[doc] force:", forceGenerate, "complete:", complete, "count:", userMsgCount);
    }

    // Generate kalau:
    // 1. Force generate
    // 2. Info lengkap
    // 3. Sudah jawab ≥ 6x (safety)
    if (forceGenerate || complete || tooManyAnswers) {
      await doGenerateDocument(combinedText, afterUser, conversationId);
      return;
    }

    // Belum lengkap → tanya field berikutnya
    const nextQ = buildNextQuestion(info, kind);
    if (nextQ) {
      const followUpMsg: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: `🤔 ${nextQ.question}\n\n_Ketik **"generate"** kalau mau langsung dibuat._`,
        createdAt: Date.now(),
      };
      const next = [...afterUser, followUpMsg];
      if (stillHere(conversationId)) setMessages(next);
      persist(next, conversationId);
      return;
    }

    // Semua sudah ditanya → generate
    await doGenerateDocument(combinedText, afterUser, conversationId);
    return;
  }

  // KASUS B: Prompt pertama
  const clarity = checkDocClarification(prompt, docType);
  if (clarity.needsClarification && clarity.question) {
    const clarifyMsg: ChatMessage = {
      id: newId(),
      role: "assistant",
      content: `🤔 ${clarity.question}`,
      createdAt: Date.now(),
    };
    const next = [...afterUser, clarifyMsg];
    if (stillHere(conversationId)) setMessages(next);
    persist(next, conversationId);
    return;
  }

  // Prompt pertama sudah cukup detail → generate
  await doGenerateDocument(prompt, afterUser, conversationId);
};

  /* ============================================================ */
  /* REGENERATE IMAGE                                              */
  /* ============================================================ */
  const regenerateImage = async (messageId: string) => {
    const conversationId = activeId;
    if (!conversationId) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.generatedImages?.length) return;
    const prevImg = msg.generatedImages[0];
    const keepAspect = (prevImg.aspect as AspectRatio) ?? "1:1";
    showToast("Membuat variasi baru…", "info");

    try {
      const res = await fetchWithRetry("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prevImg.prompt, aspect: keepAspect }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const { dataUrl, seed } = data;
      const updated = messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              generatedImages: [
                {
                  id: newId(),
                  dataUrl,
                  prompt: prevImg.prompt,
                  createdAt: Date.now(),
                  seed,
                  aspect: keepAspect,
                },
              ],
            }
          : m
      );
      persist(updated, conversationId);
      if (stillHere(conversationId)) {
        setMessages(updated);
        showToast("Variasi baru siap", "success");
      }
    } catch (err: any) {
      if (stillHere(conversationId)) showToast(`Gagal: ${err.message}`, "error");
    }
  };

  /* ============================================================ */
  /* SEND                                                          */
  /* ============================================================ */
  const send = () => {
    const text = input.trim();
    if (!text && !attachments.length) return;
    let id = activeId;
    if (!id) {
      id = newId();
      setActiveId(id);
      activeIdRef.current = id;
    }

    if (mode === "image") { generateImage(text, id); setInput(""); return; }
    if (mode === "video") {
      showToast("Fitur video masih dalam pengembangan. Segera hadir! 🎬", "info");
      return;
    }
    if (mode === "document") { generateDocument(text, id); setInput(""); return; }

    const prepareAndSend = async () => {
      let compressedAttachments: Attachment[] | undefined;

      if (attachments.length) {
        try {
          compressedAttachments = await Promise.all(
            attachments.map(async (a) => {
              const compressedDataUrl = await compressImage(a.dataUrl);
              const newSize = dataUrlSizeBytes(compressedDataUrl);
              return { ...a, dataUrl: compressedDataUrl, size: newSize };
            })
          );
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[compress] gagal, pakai original:", err);
          }
          compressedAttachments = attachments;
        }
      }

      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        content: text || " ",
        createdAt: Date.now(),
        attachments: compressedAttachments,
      };
      const next = [...messages, userMsg];

      if (stillHere(id)) setMessages(next);
      setInput("");
      setAttachments([]);
      persist(next, id);
      runStream(next, id);
    };

    prepareAndSend();
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
    if (stillHere(id)) setMessages(without);
    persist(without, id);
    runStream(without, id);
  };

  const onEdit = (id: string, content: string) => {
    const conversationId = activeId;
    if (!conversationId) return;
    const idx = messages.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const trimmed = messages
      .slice(0, idx + 1)
      .map((m) => (m.id === id ? { ...m, content } : m));
    if (stillHere(conversationId)) setMessages(trimmed);
    persist(trimmed, conversationId);
    runStream(trimmed, conversationId);
  };

  const selectConv = async (id: string) => {
    cancelAll();
    const resolvedId = resolveChatId(id);
    let c = convs.find((x) => x.id === resolvedId || x.id === id);

    if (!c || !c.messages || c.messages.length === 0) {
      const detail = await getChatById(resolvedId);
      if (detail) {
        const loadedConv: Conversation = {
          id: String(detail.id),
          title: detail.title || "Tanpa judul",
          updatedAt: detail.created_at ? new Date(detail.created_at).getTime() : Date.now(),
          messages: detail.messages || [],
        };
        c = loadedConv;
        setConvs((prev) => {
          const filtered = prev.filter((item) => item.id !== id && item.id !== String(detail.id));
          return [loadedConv, ...filtered];
        });
      }
    }

    if (!c) return;

    setActiveId(c.id);
    activeIdRef.current = c.id;
    setMessages(c.messages || []);
    setInput("");
    setAttachments([]);
    setMode("chat");

    const lastUI = [...(c.messages || [])].reverse().find((m) => m.generatedUI);
    if (lastUI) {
      setActiveArtifactId(lastUI.id);
      setArtifactOpen(true);
    } else {
      setActiveArtifactId(null);
      setArtifactOpen(false);
    }
  };

  const deleteConv = async (id: string) => {
    const resolvedId = resolveChatId(id);
    await deleteChatFromSupabase(resolvedId);
    setConvs((prev) => prev.filter((c) => c.id !== id && c.id !== resolvedId));
    if (
      id === activeId ||
      resolvedId === activeId ||
      id === activeIdRef.current ||
      resolvedId === activeIdRef.current
    ) {
      cancelAll();
      setActiveId("");
      activeIdRef.current = "";
      setMessages([]);
      setAttachments([]);
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
          userEmail={user?.email}
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
              userEmail={user?.email}
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
            {typing && !videoLoading && (
              <span className="ml-auto shrink-0 text-xs text-neutral-500">
                sedang mengetik…
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