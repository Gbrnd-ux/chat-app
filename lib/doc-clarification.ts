// lib/doc-clarification.ts

export interface ClarificationResult {
  needsClarification: boolean;
  question?: string;
}

export interface InfoMatch {
  instansi: boolean;
  bidang: boolean;
  periode: boolean;
  tugas: boolean;
}

/* ============================================================ */
/* Entry Point                                                   */
/* ============================================================ */

export function checkDocClarification(
  prompt: string,
  type: "word" | "excel"
): ClarificationResult {
  const p = prompt.toLowerCase().trim();
  const kind = detectKind(p);

  if (p.length < 25) return buildInitialQuestion(type, kind);

  const hasSpecificInfo =
    /(di|pada|untuk)\s+[A-Z][a-zA-Z]+/.test(prompt) ||
    /\b(pt|cv|ud|toko|kafe|restoran|sekolah|kampus|universitas|perusahaan|startup|instansi)\b/i.test(p) ||
    /\b(20\d{2}|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\b/i.test(p) ||
    /\b(q1|q2|q3|q4|semester|bulan|minggu|periode)\b/i.test(p);

  if (p.length < 60 && !hasSpecificInfo) return buildInitialQuestion(type, kind);
  if (p.length < 40) return buildInitialQuestion(type, kind);

  return { needsClarification: false };
}

/* ============================================================ */
/* Context Detection                                             */
/* ============================================================ */

export function isAnsweringClarification(
  messages: Array<{ role: string; content: string }>
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant") {
      return m.content.trim().startsWith("🤔");
    }
  }
  return false;
}

/* ============================================================ */
/* Info Extraction — FIXED                                       */
/* ============================================================ */

/**
 * 🔥 FIX: Ambil SEMUA user message sejak dokumen terakhir yang berhasil.
 * Kalau belum ada dokumen, ambil SEMUA user message dari awal conversation.
 *
 * Ini memastikan konteks awal (misal "laporan magang") tidak hilang.
 */
export function extractInfoFromHistory(
  messages: Array<{ role: string; content: string; hasDoc?: boolean }>
): { text: string; info: InfoMatch } {
  // 1. Cari boundary dokumen terakhir
  let lastDocIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (
      messages[i].role === "assistant" &&
      (messages[i].hasDoc === true ||
        ((messages[i] as any).generatedDocuments?.length ?? 0) > 0)
    ) {
      lastDocIdx = i;
      break;
    }
  }

  // 2. Ambil user msgs dari boundary (atau dari awal kalau tidak ada)
  const startIdx = lastDocIdx + 1;
  const relevantMsgs = messages
    .slice(startIdx)
    .filter((m) => m.role === "user");

  const text = relevantMsgs
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join(" | ");

  return { text, info: extractInfoFromString(text) };
}

/**
 * Ekstrak info dari satu string.
 */
export function extractInfoFromString(text: string): InfoMatch {
  return {
    instansi:
      /(pt|cv|ud|universitas|kampus|sekolah|toko|kafe|restoran|perusahaan|instansi|startup|fakultas|politeknik|smk|sma)\s+[a-z]/i.test(text) ||
      /(di|pada)\s+[A-Z][a-zA-Z]+/.test(text),
    bidang:
      /(divisi|bidang|departemen|unit|bagian|jurusan|program\s+studi|prodi)\s+\S+/i.test(text),
    periode:
      /\b(20\d{2}|januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|bulan|minggu|semester|periode|q[1-4])\b/i.test(text),
    tugas:
      /(perancangan|tugas|proyek|fokus|mengerjakan|membuat|mengelola|mengembangkan|menganalisis|migrasi|redesign|membangun|desain|design|riset|penelitian)/i.test(text),
  };
}

/* ============================================================ */
/* Step-by-step Question Builder                                 */
/* ============================================================ */

function getPriorityFields(kind: string): string[] {
  // 🔥 Priority: instansi dulu, baru bidang, periode, tugas
  // (supaya flow natural)
  switch (kind) {
    case "magang":
    case "bisnis":
      return ["instansi", "bidang", "periode", "tugas"];
    case "skripsi":
    case "proposal":
    case "cv":
      return ["tugas", "bidang", "instansi", "periode"];
    default:
      return ["instansi", "bidang", "periode", "tugas"];
  }
}

function buildSingleQuestion(field: string): string {
  const map: Record<string, string> = {
    instansi: "Siapa **nama instansi/perusahaan** tempat Anda?",
    bidang: "Di **bidang atau divisi** apa Anda ditempatkan?",
    periode: "Berapa **periode**-nya? (contoh: Januari – Maret 2025)",
    tugas: 'Ada **tugas atau proyek spesifik** yang ingin di-highlight? Kalau tidak ada, ketik **"skip"**.',
  };
  return map[field] ?? map.instansi;
}

export function buildNextQuestion(
  info: InfoMatch,
  kind: string
): { question: string; field: string } | null {
  const priority = getPriorityFields(kind);
  for (const field of priority) {
    if (!info[field as keyof InfoMatch]) {
      return {
        question: buildSingleQuestion(field),
        field,
      };
    }
  }
  return null;
}

export function isInfoComplete(info: InfoMatch, kind: string): boolean {
  const priority = getPriorityFields(kind);
  return priority.every((f) => info[f as keyof InfoMatch]);
}

/**
 * Deteksi field apa yang ditanya AI di assistant message terakhir.
 */
export function extractLastQuestionField(
  messages: Array<{ role: string; content: string }>
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") continue;
    if (m.role === "assistant") {
      if (!m.content.trim().startsWith("🤔")) return null;
      const c = m.content.toLowerCase();
      if (c.includes("nama instansi") || c.includes("nama perusahaan")) return "instansi";
      if (c.includes("bidang atau divisi") || c.includes("ditempatkan")) return "bidang";
      if (c.includes("berapa periode") || c.includes("periode magang")) return "periode";
      if (c.includes("tugas atau proyek") || c.includes("di-highlight")) return "tugas";
      return null;
    }
  }
  return null;
}

/* ============================================================ */
/* Kind Detection                                                */
/* ============================================================ */

export function detectKindExport(p: string): string {
  return detectKind(p.toLowerCase());
}

function detectKind(p: string): string {
  if (/\bmagang\b|\binternship\b|\bpkl\b|\bprakerin\b|\bkerja\s*praktik\b/.test(p)) return "magang";
  if (/\bskripsi\b|\bthesis\b|\bpenelitian\b|\briset\b|\bdisertasi\b|\btesis\b/.test(p)) return "skripsi";
  if (/\bproposal\b|\bpengajuan\b/.test(p)) return "proposal";
  if (/\bbisnis\b|\bbusiness\b|\blaporan keuangan\b|\bpenjualan\b|\bsales\b|\bmarketing\b|\boperasional\b/.test(p)) return "bisnis";
  if (/\bcv\b|\bresume\b|\bdaftar riwayat\b|\bportofolio\b/.test(p)) return "cv";
  return "umum";
}

/* ============================================================ */
/* Initial Question                                              */
/* ============================================================ */

function buildInitialQuestion(
  type: "word" | "excel",
  kind: string = "umum"
): ClarificationResult {
  if (type === "excel") {
    return {
      needsClarification: true,
      question:
        "Untuk membuat Excel yang sesuai, boleh saya tahu:\n\n" +
        "**Data apa** yang ingin dimasukkan?\n" +
        '_(contoh: penjualan, absensi, stok barang, keuangan)_',
    };
  }

  if (kind !== "umum") {
    const emptyInfo: InfoMatch = {
      instansi: false,
      bidang: false,
      periode: false,
      tugas: false,
    };
    const next = buildNextQuestion(emptyInfo, kind);
    if (next) {
      return {
        needsClarification: true,
        question: `${next.question}\n\n_Ketik **"generate"** kalau mau langsung dibuat._`,
      };
    }
  }

  return {
    needsClarification: true,
    question:
      "Sebelum saya buat, boleh dijelaskan dulu:\n\n" +
      "**Jenis dokumen** apa yang diinginkan?\n" +
      '_(contoh: laporan magang, skripsi, proposal, CV, laporan bisnis)_',
  };
}