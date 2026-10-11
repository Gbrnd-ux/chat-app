// lib/documents.ts
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from "docx";
import * as XLSX from "xlsx";

// ============================================================
// Schema dokumen (baru)
// ============================================================
export type DocxSection = {
  heading: string;
  level?: 1 | 2 | 3;
  paragraphs?: string[];
  bullets?: string[];
  numbered?: string[];
  subsections?: DocxSection[];
};

export type DocxContent = {
  title: string;
  subtitle?: string;
  author?: string;
  sections: DocxSection[];
};

export type XlsxContent = {
  sheets: Array<{
    name: string;
    title?: string;
    rows: (string | number)[][];
  }>;
};

// ============================================================
// Word — format akademik (Times New Roman, 1.5 spacing, justified)
// ============================================================
const FONT = "Times New Roman";
const FONT_SIZE_HALF_PT = 24; // 24 half-points = 12pt

function textRuns(text: string): TextRun[] {
  // Dukung **bold**, *italic*
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return new TextRun({
        text: p.slice(2, -2),
        bold: true,
        font: FONT,
        size: FONT_SIZE_HALF_PT,
      });
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return new TextRun({
        text: p.slice(1, -1),
        italics: true,
        font: FONT,
        size: FONT_SIZE_HALF_PT,
      });
    }
    return new TextRun({
      text: p,
      font: FONT,
      size: FONT_SIZE_HALF_PT,
    });
  });
}

function buildSection(section: DocxSection): Paragraph[] {
  const out: Paragraph[] = [];
  const level = section.level ?? 1;

  // Heading
  if (section.heading) {
    const headingLevel =
      level === 1
        ? HeadingLevel.HEADING_1
        : level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;

    out.push(
      new Paragraph({
        heading: headingLevel,
        spacing: { before: 300, after: 200, line: 360 },
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: section.heading,
            bold: true,
            font: FONT,
            size: level === 1 ? 28 : level === 2 ? 26 : 24, // 14/13/12pt
          }),
        ],
      })
    );
  }

  // Paragraphs
  for (const para of section.paragraphs ?? []) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 360, after: 120 }, // 1.5 line spacing
        indent: { firstLine: convertInchesToTwip(0.5) }, // indent 1.27cm
        children: textRuns(para),
      })
    );
  }

  // Bullets
  if (section.bullets?.length) {
    for (const b of section.bullets) {
      out.push(
        new Paragraph({
          bullet: { level: 0 },
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 360, after: 80 },
          children: textRuns(b),
        })
      );
    }
  }

  // Numbered list (manual numbering, biar konsisten)
  if (section.numbered?.length) {
    section.numbered.forEach((n, i) => {
      out.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 360, after: 80 },
          indent: { left: convertInchesToTwip(0.5) },
          children: [
            new TextRun({
              text: `${i + 1}. `,
              bold: false,
              font: FONT,
              size: FONT_SIZE_HALF_PT,
            }),
            ...textRuns(n),
          ],
        })
      );
    });
  }

  // Subsections (recursive)
  for (const sub of section.subsections ?? []) {
    out.push(...buildSection({ ...sub, level: (level + 1) as 1 | 2 | 3 }));
  }

  return out;
}

export async function buildDocx(content: DocxContent): Promise<Buffer> {
  const children: Paragraph[] = [];

  // === Title Page ===
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400, line: 360 },
      children: [
        new TextRun({
          text: content.title || "Dokumen",
          bold: true,
          font: FONT,
          size: 32, // 16pt
        }),
      ],
    })
  );

  if (content.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400, line: 360 },
        children: [
          new TextRun({
            text: content.subtitle,
            font: FONT,
            size: 26,
          }),
        ],
      })
    );
  }

  if (content.author) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 200 },
        children: [
          new TextRun({
            text: "Disusun oleh:",
            font: FONT,
            size: FONT_SIZE_HALF_PT,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: content.author,
            bold: true,
            font: FONT,
            size: 26,
          }),
        ],
      })
    );
  }

  // Page break setelah title page
  children.push(
    new Paragraph({
      pageBreakBefore: true,
      children: [new TextRun({ text: "" })],
    })
  );

  // === Sections ===
  for (const section of content.sections ?? []) {
    children.push(...buildSection(section));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.18),    // 3 cm
              right: convertInchesToTwip(1.18),  // 3 cm
              bottom: convertInchesToTwip(1.18), // 3 cm
              left: convertInchesToTwip(1.57),   // 4 cm
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: ["Halaman ", PageNumber.CURRENT],
                    font: FONT,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ============================================================
// Excel — dengan header berwarna & auto-width
// ============================================================
export function buildXlsx(content: XlsxContent): Buffer {
  const wb = XLSX.utils.book_new();

  const sheets = content.sheets?.length
    ? content.sheets
    : [{ name: "Sheet1", rows: [["(kosong)"]] }];

  for (const sheet of sheets) {
    // Kalau ada title, prepend sebagai baris pertama
    const allRows: (string | number)[][] = sheet.title
      ? [[sheet.title], [], ...sheet.rows]
      : sheet.rows;

    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // Auto-width
    const colWidths: Array<{ wch: number }> = [];
    const colCount = Math.max(...allRows.map((r) => r?.length ?? 0), 1);
    for (let c = 0; c < colCount; c++) {
      let maxLen = 10;
      for (const row of allRows) {
        const val = row?.[c];
        if (val != null) {
          maxLen = Math.max(maxLen, String(val).length + 2);
        }
      }
      colWidths.push({ wch: Math.min(maxLen, 50) });
    }
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      (sheet.name || "Sheet").slice(0, 31)
    );
  }

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(out);
}