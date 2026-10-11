// app/api/generate-document/route.ts
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildDocx, buildXlsx } from "@/lib/documents";
export const maxDuration = 60;
const MAX_PROMPT_CHARS = 1500;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

type DocType = "word" | "excel";

// ============================================================
// PROMPT BARU: ala profesor pembimbing skripsi
// ============================================================
function systemPrompt(type: DocType): string {
  if (type === "word") {
    return [
      "Kamu adalah seorang PROFESOR PEMBIMBING dengan 20 tahun pengalaman membimbing skripsi, tesis, dan laporan magang di universitas ternama Indonesia.",
      "",
      "TUGASMU: Menghasilkan dokumen akademik/profesional BERKUALITAS TINGGI, SETARA STANDAR SKRIPSI SARJANA.",
      "",
      "STRUKTUR WAJIB (sesuaikan dengan jenis dokumen):",
      "- Laporan magang → Bab: Pendahuluan, Profil Instansi/Perusahaan, Pelaksanaan Magang (dengan sub-bab per tugas), Pembahasan & Analisis, Kesimpulan & Saran",
      "- Skripsi/penelitian → Bab: Pendahuluan, Tinjauan Pustaka, Metodologi, Hasil & Pembahasan, Kesimpulan",
      "- Proposal → Latar Belakang, Rumusan Masalah, Tujuan, Manfaat, Tinjauan Pustaka, Metodologi, Timeline, Anggaran",
      "- Laporan bisnis → Executive Summary, Analisis Situasi, Metodologi, Temuan, Rekomendasi",
      "",
      "ATURAN KONTEN (WAJIB DIPATUHI):",
      "1. Minimal 5 bab/section utama, idealnya 6-8",
      "2. Setiap bab HARUS punya 2-4 sub-bab (level 2)",
      "3. Setiap sub-bab HARUS punya 2-4 paragraf",
      "4. Setiap paragraf HARUS 4-8 kalimat penuh (bukan 1-2 kalimat)",
      "5. Gunakan bahasa Indonesia formal, baku, akademik",
      "6. Sebutkan istilah teknis, definisi, dan contoh konkret",
      "7. Sertakan data/angka/estimasi di mana relevan",
      "8. Struktur argumentatif: klaim → penjelasan → bukti/contoh → simpulan",
      "9. JANGAN pakai bullet yang dangkal — kalau pakai list, jelaskan tiap poin",
      "10. JANGAN mengulang-ulang kalimat yang sama",
      "",
      "FORMAT OUTPUT — WAJIB hanya JSON ini, tanpa penjelasan:",
      '{',
      '  "title": "judul lengkap dokumen (Title Case)",',
      '  "subtitle": "subjudul opsional (contoh: Laporan Magang di PT XYZ)",',
      '  "author": "nama penyusun jika disebutkan, kosongkan kalau tidak",',
      '  "sections": [',
      '    {',
      '      "heading": "BAB I PENDAHULUAN",',
      '      "level": 1,',
      '      "paragraphs": ["paragraf pembuka bab..."],',
      '      "subsections": [',
      '        {',
      '          "heading": "1.1 Latar Belakang",',
      '          "level": 2,',
      '          "paragraphs": ["paragraf 1...", "paragraf 2...", "paragraf 3..."],',
      '          "bullets": ["opsional"],',
      '          "numbered": ["opsional"]',
      '        }',
      '      ]',
      '    }',
      '  ]',
      '}',
      "",
      "MINIMAL jumlah paragraf total: 25-40 paragraf untuk dokumen berkualitas.",
      "Pakai **bold** untuk istilah kunci, *italic* untuk istilah asing.",
      "Output HANYA JSON, tanpa markdown code fence, tanpa pembuka/penutup.",
    ].join("\n");
  }

  // Excel
  return [
    "Kamu adalah seorang ANALIS DATA PROFESIONAL yang membuat spreadsheet untuk kebutuhan bisnis, akademik, dan operasional.",
    "",
    "TUGASMU: Menghasilkan data tabular yang REALISTIS, DETAIL, dan PROFESIONAL.",
    "",
    "ATURAN:",
    "1. Setiap sheet WAJIB punya header row dengan nama kolom yang jelas",
    "2. Data harus REALISTIS: nama Indonesia yang wajar, angka yang masuk akal",
    "3. Jumlah baris: 15-40 baris per sheet (jangan cuma 3-5 baris!)",
    "4. Multiple sheets kalau relevan (contoh: Pemasukan, Pengeluaran, Ringkasan)",
    "5. Setiap sheet boleh punya `title` sebagai judul di baris atas",
    "6. JANGAN pakai formula Excel — kirim nilai jadi",
    "7. Kolom tanggal format: DD/MM/YYYY",
    "8. Kolom angka: langsung angka (jangan string)",
    "",
    "FORMAT OUTPUT — WAJIB hanya JSON ini:",
    '{',
    '  "sheets": [',
    '    {',
    '      "name": "Sheet1",',
    '      "title": "Judul sheet opsional",',
    '      "rows": [',
    '        ["Header1", "Header2", "Header3"],',
    '        ["data", 123, "text"],',
    '      ]',
    '    }',
    '  ]',
    '}',
    "",
    "Output HANYA JSON, tanpa markdown code fence.",
  ].join("\n");
}

// ============================================================
// Panggil LLM (max_tokens diperbesar)
// ============================================================
async function llmGenerate(prompt: string, type: DocType): Promise<any> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY kosong");

  const models = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
  ];

  let lastErr = "";

  for (const model of models) {
    try {
      console.log(`[doc] coba model: ${model}`);

      const res = await fetch(`${GEMINI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.5,
          max_tokens: 8000, // dinaikkan drastis
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt(type) },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        lastErr = `[${res.status}] ${(await res.text()).slice(0, 200)}`;
        console.warn(`[doc] ${model} gagal: ${res.status}`);
        continue;
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      const finishReason = data?.choices?.[0]?.finish_reason;
      console.log(`[doc] ${model} ok, finish: ${finishReason}, len: ${content.length}`);

      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      return JSON.parse(cleaned);
    } catch (err: any) {
      lastErr = err.message;
      console.warn(`[doc] ${model} error: ${err.message}`);
    }
  }

  throw new Error(lastErr || "Semua model gagal");
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "rate_limit" }), {
      status: 429,
      headers: { "Retry-After": "20", "Content-Type": "application/json" },
    });
  }

  let body: { prompt?: string; type?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = (body.prompt ?? "").trim();
  const type: DocType = body.type === "excel" ? "excel" : "word";

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt kosong" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return new Response(JSON.stringify({ error: "Prompt terlalu panjang" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[doc] type: ${type}`);
  console.log(`[doc] prompt: "${prompt.slice(0, 80)}"`);

  try {
    const content = await llmGenerate(prompt, type);
    console.log(`[doc] LLM selesai, membangun file...`);

    let buffer: Buffer;
    let fileName: string;
    let mimeType: string;

    if (type === "word") {
      // Count paragraf untuk logging
      let totalParas = 0;
      const countParas = (secs: any[]) => {
        for (const s of secs ?? []) {
          totalParas += (s.paragraphs?.length ?? 0);
          if (s.subsections) countParas(s.subsections);
        }
      };
      countParas(content.sections ?? []);
      console.log(`[doc] ${content.sections?.length ?? 0} bab, ${totalParas} paragraf`);

      buffer = await buildDocx(content);
      const safeTitle = String(content.title || "dokumen")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 40)
        .toLowerCase();
      fileName = `${safeTitle || "dokumen"}.docx`;
      mimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      buffer = buildXlsx(content);
      const safeName = String(content.sheets?.[0]?.name || "spreadsheet")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 40)
        .toLowerCase();
      fileName = `${safeName || "spreadsheet"}.xlsx`;
      mimeType =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    console.log(`[doc] sukses: ${fileName} (${buffer.length} bytes)`);

    const base64 = buffer.toString("base64");

    return new Response(
      JSON.stringify({
        status: "completed",
        fileName,
        mimeType,
        base64,
        size: buffer.length,
        type,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[doc] error:", err.message);
    return new Response(
      JSON.stringify({
        error: "generate_failed",
        detail: err.message,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}