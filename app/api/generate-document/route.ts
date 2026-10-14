// app/api/generate-document/route.ts
import { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildDocx, buildXlsx, type DocxContent, type XlsxContent } from "@/lib/documents";

export const maxDuration = 25;

const MAX_PROMPT_CHARS = 2500;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

// 🔥 Vercel Hobby limit 10s. Set 8s supaya aman.
const AI_TIMEOUT_MS = 8000;

type DocType = "word" | "excel";

/* ============================================================ */
/* Helpers                                                       */
/* ============================================================ */

function extractField(text: string, kind: string): string | null {
  const t = text;

  if (kind === "instansi") {
    // PT/CV/UD/Universitas X
    const m = t.match(/\b(PT|CV|UD|Universitas|Institut|Politeknik|SMK|SMA|Kampus|Sekolah|Toko|Kafe|Restoran|Perusahaan|Startup)\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/);
    if (m) return m[0];
    // "di PT X"
    const m2 = t.match(/(?:di|pada)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
    if (m2) return m2[1];
  }

  if (kind === "bidang") {
    const m = t.match(/(?:divisi|bidang|departemen|unit|bagian)\s+([A-Za-z\/\-\s]+?)(?:\s*\||$|,)/i);
    if (m) return m[1].trim();
  }

  if (kind === "periode") {
    const m = t.match(/(\d{1,2}\s+\w+\s+\d{4}\s*[-–]\s*\d{1,2}\s+\w+\s+\d{4})/);
    if (m) return m[1];
    const m2 = t.match(/(\w+\s*[-–]\s*\w+\s+\d{4})/);
    if (m2) return m2[1];
    const m3 = t.match(/\b(20\d{2})\b/);
    if (m3) return m3[1];
  }

  if (kind === "tugas") {
    const m = t.match(/(?:perancangan|perancang|desain|design|pengembangan|analisis|implementasi|evaluasi)\s+([^|]+?)(?:\s*\||$|,)/i);
    if (m) return m[1].trim().slice(0, 100);
  }

  return null;
}

/* ============================================================ */
/* System Prompt — Ringkas supaya AI cepat selesai              */
/* ============================================================ */

function systemPrompt(type: DocType): string {
  if (type === "word") {
    return [
      "Kamu adalah dosen pembimbing S3 yang menulis dokumen akademik.",
      "",
      "STRUKTUR (sesuaikan jenis):",
      "- Laporan magang: BAB I Pendahuluan, BAB II Profil Instansi, BAB III Pelaksanaan, BAB IV Pembahasan, BAB V Kesimpulan (masing-masing 2-3 sub-bab)",
      "- Skripsi: BAB I-V dengan struktur akademik standar",
      "- Proposal: Pendahuluan, Rumusan Masalah, Tujuan, Metodologi, Timeline",
      "",
      "ATURAN (PENTING — jangan berlebihan):",
      "1. WAJIB 4-5 bab saja",
      "2. Setiap bab punya 1-2 sub-bab",
      "3. Setiap sub-bab punya 2 paragraf",
      "4. Setiap paragraf 4-5 kalimat penuh dan bermakna",
      "5. Bahasa Indonesia FORMAL dan AKADEMIK",
      "6. Sebutkan contoh konkret & istilah teknis",
      "7. JANGAN copy-paste kalimat sama",
      "",
      "TARGET: 12-15 paragraf TOTAL (jangan lebih)",
      "",
      "FORMAT OUTPUT (WAJIB hanya JSON, tanpa penjelasan):",
      "{",
      '  "title": "judul lengkap dokumen",',
      '  "subtitle": "subjudul seperti: Laporan Magang di PT XYZ Periode Jan-Mar 2025",',
      '  "author": "nama penyusun (kalau disebutkan)",',
      '  "sections": [',
      '    {',
      '      "heading": "BAB I PENDAHULUAN",',
      '      "level": 1,',
      '      "paragraphs": ["paragraf pembuka bab"],',
      '      "subsections": [',
      '        {',
      '          "heading": "1.1 Latar Belakang",',
      '          "level": 2,',
      '          "paragraphs": ["paragraf 1", "paragraf 2"]',
      '        }',
      '      ]',
      '    }',
      '  ]',
      "}",
      "",
      "Pakai **bold** untuk istilah kunci. Output HANYA JSON.",
    ].join("\n");
  }

  return [
    "Kamu adalah analis data profesional.",
    "",
    "ATURAN:",
    "1. Setiap sheet punya header row yang JELAS",
    "2. Data REALISTIS: nama Indonesia, angka masuk akal",
    "3. 10-15 baris per sheet, max 2 sheet",
    "4. Tanggal: DD/MM/YYYY",
    "5. Angka: number (bukan string)",
    "6. Sertakan baris TOTAL di akhir",
    "",
    "FORMAT (WAJIB JSON):",
    "{",
    '  "sheets": [',
    '    {',
    '      "name": "Sheet1",',
    '      "title": "Judul sheet",',
    '      "rows": [["Header1", "Header2"], ["data", 123]]',
    '    }',
    '  ]',
    "}",
    "",
    "Output HANYA JSON, tanpa markdown code fence.",
  ].join("\n");
}

/* ============================================================ */
/* LLM Call — timeout 8s                                        */
/* ============================================================ */

async function llmGenerate(prompt: string, type: DocType): Promise<any> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY kosong");

  const models = [
    "gemini-2.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
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
          temperature: 0.7,
          max_tokens: 4000, // 🔥 Turun dari 10000 supaya cepat
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt(type) },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });

      if (!res.ok) {
        lastErr = `[${res.status}] ${(await res.text()).slice(0, 200)}`;
        console.warn(`[doc] ${model} gagal: ${res.status}`);
        if (res.status === 401 || res.status === 403) break;
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
      if (err?.name === "TimeoutError" || err?.name === "AbortError") {
        lastErr = `Timeout setelah ${AI_TIMEOUT_MS}ms`;
        console.warn(`[doc] ${model} timeout`);
      } else {
        lastErr = err.message;
        console.warn(`[doc] ${model} error: ${err.message}`);
      }
    }
  }

  throw new Error(lastErr || "Semua model gagal");
}

/* ============================================================ */
/* Smart Fallback — Pakai info dari user                        */
/* ============================================================ */

function detectDocKind(prompt: string): "magang" | "skripsi" | "proposal" | "bisnis" | "general" {
  const p = prompt.toLowerCase();
  if (/magang|internship|pkl|prakerin/.test(p)) return "magang";
  if (/skripsi|thesis|penelitian|riset|disertasi|tesis/.test(p)) return "skripsi";
  if (/proposal|pengajuan/.test(p)) return "proposal";
  if (/bisnis|business|penjualan|sales|marketing|keuangan/.test(p)) return "bisnis";
  return "general";
}

function cleanTitle(text: string): string {
  // Ambil sebelum " | "
  const first = text.split("|")[0].trim();
  // Bersihkan prefix
  return first
    .replace(/^(buatin|buatkan|buat|tolong|minta|saya|aku|mohon|please)\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Dokumen Baru";
}

function buildSmartFallback(prompt: string, type: DocType): DocxContent | XlsxContent {
  const kind = detectDocKind(prompt);

  // Extract info dari prompt combined
  const instansi = extractField(prompt, "instansi") || "[Nama Instansi]";
  const bidang = extractField(prompt, "bidang") || "";
  const periode = extractField(prompt, "periode") || "";
  const tugas = extractField(prompt, "tugas") || "";

  // Judul dari prompt bersih
  const cleanPromptTitle = cleanTitle(prompt);
  const title = kind === "magang" && instansi !== "[Nama Instansi]"
    ? `Laporan Magang di ${instansi}`
    : cleanPromptTitle;

  const subtitle = kind === "magang" && periode
    ? `Periode ${periode}`
    : undefined;

  if (type === "excel") {
    if (kind === "bisnis") {
      return {
        sheets: [
          {
            name: "Penjualan",
            title,
            rows: [
              ["No", "Tanggal", "Produk", "Kategori", "Qty", "Harga Satuan", "Total"],
              [1, "02/01/2025", "Produk A", "Elektronik", 24, 185000, 4440000],
              [2, "05/01/2025", "Produk B", "Fashion", 36, 95000, 3420000],
              [3, "08/01/2025", "Produk C", "Makanan", 48, 22000, 1056000],
              [4, "11/01/2025", "Produk D", "Minuman", 60, 18000, 1080000],
              [5, "14/01/2025", "Produk E", "Sembako", 30, 38000, 1140000],
              [6, "17/01/2025", "Produk F", "Elektronik", 25, 72000, 1800000],
              [7, "20/01/2025", "Produk G", "Sembako", 40, 15500, 620000],
              [8, "23/01/2025", "Produk H", "Protein", 35, 32000, 1120000],
              [9, "26/01/2025", "Produk I", "Makanan", 20, 105000, 2100000],
              [10, "29/01/2025", "Produk J", "Kebersihan", 45, 28000, 1260000],
              ["", "", "", "TOTAL", "", "", 19036000],
            ],
          },
        ],
      };
    }
    return {
      sheets: [
        {
          name: "Data",
          title,
          rows: [
            ["No", "Item", "Deskripsi", "Jumlah", "Satuan", "Harga", "Total"],
            [1, "Item A", "Deskripsi item A", 10, "pcs", 50000, 500000],
            [2, "Item B", "Deskripsi item B", 5, "pcs", 120000, 600000],
            [3, "Item C", "Deskripsi item C", 20, "pcs", 30000, 600000],
            [4, "Item D", "Deskripsi item D", 8, "box", 75000, 600000],
            [5, "Item E", "Deskripsi item E", 15, "pcs", 45000, 675000],
            ["", "", "", "", "TOTAL", "", 2975000],
          ],
        },
      ],
    };
  }

  // Word fallback
  const instansiClause = instansi !== "[Nama Instansi]" ? ` di **${instansi}**` : "";
  const bidangClause = bidang ? ` pada divisi **${bidang}**` : "";
  const periodeClause = periode ? ` selama periode **${periode}**` : "";
  const tugasClause = tugas ? ` Fokus utama kegiatan adalah **${tugas}**.` : "";

  if (kind === "magang") {
    return {
      title,
      subtitle,
      sections: [
        {
          heading: "BAB I PENDAHULUAN",
          level: 1,
          paragraphs: [
            `Magang merupakan salah satu bentuk pembelajaran experiential yang penting dalam kurikulum pendidikan tinggi. Kegiatan ini menjembatani kesenjangan antara teori akademik dan praktik profesional di dunia kerja nyata.`,
          ],
          subsections: [
            {
              heading: "1.1 Latar Belakang",
              level: 2,
              paragraphs: [
                `Perkembangan industri yang semakin dinamis menuntut lulusan perguruan tinggi memiliki kompetensi siap pakai. Program magang hadir sebagai wadah strategis untuk membekali mahasiswa dengan keterampilan praktis, etika kerja, dan pemahaman budaya organisasi yang tidak sepenuhnya dapat diperoleh melalui pembelajaran di kelas.`,
                `Melalui kegiatan magang${instansiClause}${bidangClause}${periodeClause}, penulis memperoleh kesempatan untuk mengaplikasikan ilmu yang telah dipelajari, sekaligus mengidentifikasi tantangan nyata yang dihadapi industri.${tugasClause} Pengalaman tersebut diharapkan menjadi bekal berharga bagi pengembangan karier di masa depan.`,
              ],
            },
            {
              heading: "1.2 Tujuan dan Manfaat",
              level: 2,
              paragraphs: [
                `Tujuan utama kegiatan magang ini adalah untuk memperoleh pengalaman kerja langsung, memahami proses bisnis organisasi, serta mengembangkan soft skill yang relevan dengan kebutuhan industri modern.`,
              ],
              numbered: [
                "Mengembangkan kompetensi teknis sesuai bidang studi",
                "Memahami budaya dan dinamika dunia kerja profesional",
                "Membangun jaringan profesional untuk karier jangka panjang",
                "Melatih kedisiplinan, tanggung jawab, dan etika kerja",
              ],
            },
          ],
        },
        {
          heading: "BAB II PROFIL INSTANSI",
          level: 1,
          paragraphs: [
            `Bab ini menjelaskan secara umum profil organisasi tempat penulis melaksanakan magang, mencakup visi, misi, struktur organisasi, dan bidang usaha yang dijalankan.`,
          ],
          subsections: [
            {
              heading: "2.1 Sejarah dan Bidang Usaha",
              level: 2,
              paragraphs: [
                `${instansi} merupakan organisasi yang bergerak di bidang industrinya dengan reputasi yang baik. Organisasi ini telah beroperasi selama bertahun-tahun dan melayani berbagai segmen pelanggan dengan komitmen terhadap kualitas dan inovasi berkelanjutan.`,
                `Seiring waktu, ${instansi} terus mengembangkan layanan dan memperluas jangkauan operasional untuk memenuhi kebutuhan pasar yang terus berubah. Hal ini menunjukkan adaptabilitas dan visi jangka panjang yang kuat dari manajemen.`,
              ],
            },
            {
              heading: "2.2 Struktur Organisasi",
              level: 2,
              paragraphs: [
                `${instansi} memiliki struktur organisasi yang terorganisir dengan pembagian tugas dan tanggung jawab yang jelas di setiap divisi. Hal ini memungkinkan koordinasi yang efektif dalam menjalankan operasional sehari-hari.`,
              ],
            },
          ],
        },
        {
          heading: "BAB III PELAKSANAAN MAGANG",
          level: 1,
          paragraphs: [
            `Bab ini menguraikan kegiatan yang dilaksanakan penulis selama periode magang, mulai dari tahap orientasi hingga penugasan rutin di divisi terkait.`,
          ],
          subsections: [
            {
              heading: `3.1 Kegiatan di ${bidang || "Divisi Penempatan"}`,
              level: 2,
              paragraphs: [
                `Selama periode magang${periodeClause}, penulis ditempatkan di ${bidang || "divisi terkait"} dan terlibat dalam berbagai kegiatan operasional dan proyek yang diberikan oleh pembimbing lapangan.`,
                tugas
                  ? `Fokus utama penugasan penulis adalah ${tugas}. Melalui penugasan ini, penulis memperoleh pemahaman mendalam tentang proses kerja profesional serta tantangan nyata di industri.`
                  : `Kegiatan tersebut mencakup administrasi, dokumentasi, analisis data, dan asistensi pada proyek tertentu dengan supervisi mentor berpengalaman.`,
              ],
            },
            {
              heading: "3.2 Kendala dan Solusi",
              level: 2,
              paragraphs: [
                `Kendala utama yang dihadapi selama magang adalah proses adaptasi terhadap alur kerja dan sistem informasi yang digunakan organisasi. Hal ini wajar terjadi karena perbedaan antara lingkungan akademik dan lingkungan industri.`,
                `Untuk mengatasi kendala tersebut, penulis aktif berkomunikasi dengan mentor, mempelajari dokumentasi internal, dan mengamati praktik kerja rekan-rekan senior. Pendekatan ini terbukti efektif dalam mempercepat proses adaptasi.`,
              ],
            },
          ],
        },
        {
          heading: "BAB IV PEMBAHASAN",
          level: 1,
          paragraphs: [
            `Bab ini membahas refleksi penulis terhadap pengalaman magang, mencakup kesesuaian teori dengan praktik, serta pembelajaran yang diperoleh.`,
          ],
          subsections: [
            {
              heading: "4.1 Refleksi Pengalaman",
              level: 2,
              paragraphs: [
                `Melalui pengalaman magang ini, penulis menyadari pentingnya adaptabilitas dan kemauan belajar berkelanjutan di lingkungan kerja yang dinamis. Teori yang dipelajari di bangku kuliah menjadi fondasi yang baik, namun penerapannya memerlukan penyesuaian dengan konteks organisasi.`,
                `Pengalaman ini juga memberikan perspektif baru tentang pentingnya komunikasi efektif, kerja sama tim, dan manajemen waktu dalam menyelesaikan tugas-tugas profesional.`,
              ],
            },
          ],
        },
        {
          heading: "BAB V KESIMPULAN DAN SARAN",
          level: 1,
          paragraphs: [
            `Kegiatan magang memberikan pengalaman berharga yang tidak dapat diperoleh hanya melalui pembelajaran teoritis. Penulis memperoleh pemahaman mendalam tentang dunia kerja, meningkatkan kompetensi teknis, dan mengembangkan soft skill yang relevan.`,
          ],
          subsections: [
            {
              heading: "5.1 Kesimpulan",
              level: 2,
              paragraphs: [
                `Secara keseluruhan, kegiatan magang${instansiClause} telah mencapai tujuan yang ditetapkan. Penulis berhasil mengaplikasikan ilmu yang dipelajari, memahami dinamika dunia kerja, dan mengembangkan kompetensi profesional yang akan bermanfaat bagi karier ke depan.`,
              ],
            },
            {
              heading: "5.2 Saran",
              level: 2,
              paragraphs: [
                `Untuk mahasiswa yang akan melaksanakan magang, disarankan untuk mempersiapkan diri dengan baik, memiliki inisiatif tinggi, dan aktif berkomunikasi dengan mentor. Untuk instansi, disarankan untuk terus memberikan program mentoring yang terstruktur agar peserta magang memperoleh manfaat maksimal.`,
              ],
            },
          ],
        },
      ],
    };
  }

  // Generic fallback
  return {
    title,
    sections: [
      {
        heading: "BAB I PENDAHULUAN",
        level: 1,
        paragraphs: [
          `Dokumen ini disusun berdasarkan permintaan: "${prompt.slice(0, 200)}". Bab ini memberikan pengantar yang menjelaskan konteks, tujuan, dan ruang lingkup dokumen.`,
        ],
        subsections: [
          {
            heading: "1.1 Latar Belakang",
            level: 2,
            paragraphs: [
              `Bagian ini menjelaskan latar belakang yang menjadi dasar penyusunan dokumen, mencakup konteks permasalahan, urgensi, dan relevansi topik yang dibahas. Pemahaman yang komprehensif terhadap latar belakang sangat penting untuk memastikan dokumen ini memberikan kontribusi yang bermakna.`,
              `Melalui analisis yang sistematis, dokumen ini diharapkan dapat menjawab kebutuhan pihak-pihak terkait dan menjadi referensi yang bermanfaat untuk pengembangan lebih lanjut.`,
            ],
          },
        ],
      },
      {
        heading: "BAB II PEMBAHASAN",
        level: 1,
        paragraphs: [`Bab ini membahas topik utama dokumen secara sistematis dan komprehensif.`],
        subsections: [
          {
            heading: "2.1 Isi Utama",
            level: 2,
            paragraphs: [
              `Pembahasan disusun dengan mengacu pada kerangka teoretis dan praktik terbaik yang relevan. Setiap poin dibahas secara mendalam untuk memberikan pemahaman yang utuh dan aplikatif.`,
              `Beberapa contoh konkret dan ilustrasi disertakan untuk memperjelas konsep yang dibahas, sehingga pembaca dapat mengaplikasikannya dalam konteks yang sesuai dengan kebutuhan mereka.`,
            ],
          },
        ],
      },
      {
        heading: "BAB III KESIMPULAN DAN SARAN",
        level: 1,
        paragraphs: [`Bab ini menyimpulkan seluruh pembahasan dan merumuskan saran untuk pengembangan lebih lanjut.`],
        subsections: [
          {
            heading: "3.1 Kesimpulan",
            level: 2,
            paragraphs: [
              `Berdasarkan pembahasan pada bab-bab sebelumnya, dapat disimpulkan bahwa topik yang dibahas memiliki relevansi yang signifikan dan memerlukan perhatian berkelanjutan.`,
            ],
          },
          {
            heading: "3.2 Saran",
            level: 2,
            paragraphs: [
              `Disarankan untuk melakukan pengembangan lebih lanjut dengan memperhatikan konteks spesifik dan kebutuhan pengguna. Dokumen ini dapat dijadikan titik awal untuk pengembangan yang lebih mendalam.`,
            ],
          },
        ],
      },
    ],
  };
}

/* ============================================================ */
/* POST Handler                                                  */
/* ============================================================ */

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

  console.log(`[doc] type: ${type}, prompt len: ${prompt.length}`);
  console.log(`[doc] prompt: "${prompt.slice(0, 150)}..."`);

  let content: any;
  let source: "ai" | "fallback" = "ai";

  try {
    content = await llmGenerate(prompt, type);
    console.log(`[doc] ✅ AI sukses`);
  } catch (err: any) {
    console.warn(`[doc] ⚠️ AI gagal: ${err.message} → fallback`);
    content = buildSmartFallback(prompt, type);
    source = "fallback";
  }

  if (content?.needsClarification === true) {
    return new Response(
      JSON.stringify({
        status: "needs_clarification",
        question: content.question || "Bisa dijelaskan lebih detail?",
        type,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    let buffer: Buffer;
    let fileName: string;
    let mimeType: string;

    if (type === "word") {
      buffer = await buildDocx(content as DocxContent);
      const safeTitle = String(content.title || "dokumen")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 40)
        .toLowerCase();
      fileName = `${safeTitle || "dokumen"}.docx`;
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      buffer = buildXlsx(content as XlsxContent);
      const safeName = String(content.sheets?.[0]?.name || "spreadsheet")
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 40)
        .toLowerCase();
      fileName = `${safeName || "spreadsheet"}.xlsx`;
      mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }

    console.log(`[doc] ✅ (${source}) ${fileName} (${buffer.length} bytes)`);

    const base64 = buffer.toString("base64");

    return new Response(
      JSON.stringify({
        status: "completed",
        fileName,
        mimeType,
        base64,
        size: buffer.length,
        type,
        source,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[doc] build error:", err.message);
    return new Response(
      JSON.stringify({ error: "build_failed", detail: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}