import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let rawText = "";

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      rawText = text;
    } else if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
      file.name.endsWith(".docx")
    ) {
      const mammothResult = await mammoth.extractRawText({ buffer });
      rawText = mammothResult.value;
    } else {
      return NextResponse.json({ error: "Format file tidak didukung. Gunakan PDF atau DOCX." }, { status: 400 });
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json({ error: "Dokumen kosong atau teks tidak terbaca." }, { status: 400 });
    }

    const chunks = chunkText(rawText);
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS?.split(',')[0];

    if (!geminiKey) {
      return NextResponse.json({ error: "API Key Gemini tidak ditemukan." }, { status: 500 });
    }

    for (const chunk of chunks) {
      if (chunk.trim().length === 0) continue;

      // 🔥 Menggunakan model embedding terbaru
      const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: chunk }] },
            outputDimensionality: 768 // Wajib agar cocok dengan tabel Supabase
          }),
        }
      );

      const embedData = await embedRes.json();
      
      if (!embedData || !embedData.embedding || !embedData.embedding.values) {
        console.error("Gagal mendapatkan embedding:", embedData);
        continue; 
      }

      await supabase.from("documents").insert({
        content: chunk,
        metadata: { filename: file.name },
        embedding: embedData.embedding.values,
      });
    }

    return NextResponse.json({ success: true, chunks: chunks.length });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}