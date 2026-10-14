// lib/documents.ts
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from "docx";
import * as XLSX from "xlsx";

/* ============================================================ */
/* Types                                                        */
/* ============================================================ */

export type DocxTable = {
  caption?: string;
  headers: string[];
  rows: (string | number)[][];
};

export type DocxSection = {
  heading: string;
  level?: 1 | 2 | 3;
  paragraphs?: string[];
  bullets?: string[];
  numbered?: string[];
  tables?: DocxTable[];
  subsections?: DocxSection[];
};

export type DocxContent = {
  title: string;
  subtitle?: string;
  author?: string;
  nim?: string;
  program?: string;
  faculty?: string;
  university?: string;
  year?: string;
  preface?: string[];
  sections: DocxSection[];
  references?: string[];
};

export type XlsxContent = {
  sheets: Array<{
    name: string;
    title?: string;
    rows: (string | number)[][];
  }>;
};

/* ============================================================ */
/* Konstanta                                                    */
/* ============================================================ */

const FONT = "Times New Roman";
const SIZE_BODY = 24;      // 12pt
const SIZE_H1 = 28;        // 14pt
const SIZE_H2 = 26;        // 13pt
const SIZE_H3 = 24;        // 12pt
const SIZE_TITLE = 32;     // 16pt
const SIZE_COVER = 36;     // 18pt
const SIZE_SUBTITLE = 28;  // 14pt
const SIZE_FOOTER = 20;    // 10pt
const COLOR_BLACK = "000000";

const LINE_SPACING = 360;
const INDENT_FIRST = 720;

/* ============================================================ */
/* Helper: text runs                                            */
/* ============================================================ */

function textRuns(text: string, size: number = SIZE_BODY): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return new TextRun({
        text: p.slice(2, -2),
        bold: true,
        font: FONT,
        size,
        color: COLOR_BLACK,
      });
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return new TextRun({
        text: p.slice(1, -1),
        italics: true,
        font: FONT,
        size,
        color: COLOR_BLACK,
      });
    }
    return new TextRun({
      text: p,
      font: FONT,
      size,
      color: COLOR_BLACK,
    });
  });
}

/* ============================================================ */
/* Helper: Bangun entri TOC dari sections                       */
/* ============================================================ */

type TocEntry = { text: string; isBold: boolean; indent: number };

function buildTocEntries(sections: DocxSection[], hasPreface: boolean, hasRefs: boolean): TocEntry[] {
  const entries: TocEntry[] = [];

  if (hasPreface) {
    entries.push({ text: "KATA PENGANTAR", isBold: true, indent: 0 });
  }

  entries.push({ text: "DAFTAR ISI", isBold: true, indent: 0 });

  for (const section of sections) {
    if (section.heading) {
      entries.push({
        text: section.heading.toUpperCase(),
        isBold: true,
        indent: 0,
      });
    }
    // Sub-bab level 2
    for (const sub of section.subsections ?? []) {
      if (sub.heading) {
        entries.push({
          text: sub.heading,
          isBold: false,
          indent: 1,
        });
      }
      // Sub-bab level 3 (kalau ada)
      for (const subsub of sub.subsections ?? []) {
        if (subsub.heading) {
          entries.push({
            text: subsub.heading,
            isBold: false,
            indent: 2,
          });
        }
      }
    }
  }

  if (hasRefs) {
    entries.push({ text: "DAFTAR PUSTAKA", isBold: true, indent: 0 });
  }

  return entries;
}

/* ============================================================ */
/* Build: Cover Page                                            */
/* ============================================================ */

function buildCoverPage(content: DocxContent): Paragraph[] {
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 300 },
      children: [new TextRun({ text: "🎓", size: 96, font: FONT })],
    })
  );

  if (content.university) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: content.university.toUpperCase(),
            bold: true,
            font: FONT,
            size: SIZE_SUBTITLE,
            color: COLOR_BLACK,
          }),
        ],
      })
    );
  }

  if (content.faculty) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
        children: [
          new TextRun({
            text: content.faculty,
            font: FONT,
            size: SIZE_BODY,
            color: COLOR_BLACK,
          }),
        ],
      })
    );
  }

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 300 },
      children: [
        new TextRun({
          text: "LAPORAN MAGANG",
          bold: true,
          font: FONT,
          size: SIZE_COVER,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: `"${content.title.toUpperCase()}"`,
          bold: true,
          font: FONT,
          size: SIZE_H1,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
      children: [
        new TextRun({
          text: "Disusun oleh:",
          font: FONT,
          size: SIZE_BODY,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: content.author || "[Nama Penyusun]",
          bold: true,
          font: FONT,
          size: SIZE_H2,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  if (content.nim) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 },
        children: [
          new TextRun({
            text: `NIM: ${content.nim}`,
            font: FONT,
            size: SIZE_BODY,
            color: COLOR_BLACK,
          }),
        ],
      })
    );
  }

  if (content.program) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 100 },
        children: [
          new TextRun({
            text: `PROGRAM STUDI ${content.program.toUpperCase()}`,
            bold: true,
            font: FONT,
            size: SIZE_H2,
            color: COLOR_BLACK,
          }),
        ],
      })
    );
  }

  const year = content.year || new Date().getFullYear().toString();
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 },
      children: [
        new TextRun({
          text: year,
          bold: true,
          font: FONT,
          size: SIZE_H1,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  return out;
}

/* ============================================================ */
/* Build: Kata Pengantar                                        */
/* ============================================================ */

function buildPreface(preface: string[]): Paragraph[] {
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
      children: [
        new TextRun({
          text: "KATA PENGANTAR",
          bold: true,
          font: FONT,
          size: SIZE_H1,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  for (const para of preface) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: LINE_SPACING, after: 120 },
        indent: { firstLine: INDENT_FIRST },
        children: textRuns(para),
      })
    );
  }

  out.push(new Paragraph({ text: "", spacing: { after: 400 } }));
  out.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { line: LINE_SPACING, after: 100 },
      children: [
        new TextRun({
          text: "Penyusun,",
          font: FONT,
          size: SIZE_BODY,
          color: COLOR_BLACK,
        }),
      ],
    })
  );
  out.push(new Paragraph({ text: "", spacing: { after: 800 } }));
  out.push(new Paragraph({ text: "", spacing: { after: 800 } }));

  return out;
}

/* ============================================================ */
/* Build: TOC Manual                                            */
/* ============================================================ */

function buildTableOfContents(
  sections: DocxSection[],
  hasPreface: boolean,
  hasRefs: boolean
): Paragraph[] {
  const out: Paragraph[] = [];

  // Judul
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 400 },
      children: [
        new TextRun({
          text: "DAFTAR ISI",
          bold: true,
          font: FONT,
          size: SIZE_H1,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  // Hint
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "(Nomor halaman akan muncul saat dibuka di Microsoft Word)",
          italics: true,
          font: FONT,
          size: SIZE_FOOTER,
          color: "888888",
        }),
      ],
    })
  );

  // Entri TOC
  const entries = buildTocEntries(sections, hasPreface, hasRefs);
  const indentStep = convertInchesToTwip(0.3);

  for (const entry of entries) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { line: LINE_SPACING, after: 60 },
        indent: entry.indent > 0 ? { left: indentStep * entry.indent } : undefined,
        tabStops: [
          {
            type: "right" as any,
            position: convertInchesToTwip(6.0),
            leader: "dot" as any,
          },
        ],
        children: [
          new TextRun({
            text: entry.text,
            bold: entry.isBold,
            font: FONT,
            size: SIZE_BODY,
            color: COLOR_BLACK,
          }),
          new TextRun({
            text: "\t",
            font: FONT,
            size: SIZE_BODY,
          }),
        ],
      })
    );
  }

  return out;
}

/* ============================================================ */
/* Build: Table                                                 */
/* ============================================================ */

function buildTable(table: DocxTable): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];

  if (table.caption) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
        children: [
          new TextRun({
            text: table.caption,
            bold: true,
            font: FONT,
            size: SIZE_BODY,
            color: COLOR_BLACK,
          }),
        ],
      })
    );
  }

  const borderStyle = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = {
    top: borderStyle,
    bottom: borderStyle,
    left: borderStyle,
    right: borderStyle,
  };

  const headerRow = new TableRow({
    tableHeader: true,
    children: table.headers.map(
      (h) =>
        new TableCell({
          borders,
          shading: { fill: "E8E8E8" },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: h,
                  bold: true,
                  font: FONT,
                  size: SIZE_BODY,
                  color: COLOR_BLACK,
                }),
              ],
            }),
          ],
        })
    ),
  });

  const bodyRows = table.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              borders,
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: String(cell ?? ""),
                      font: FONT,
                      size: SIZE_BODY,
                      color: COLOR_BLACK,
                    }),
                  ],
                }),
              ],
            })
        ),
      })
  );

  const colCount = table.headers.length || 1;
  const totalWidth = 9360;
  const colWidth = Math.floor(totalWidth / colCount);

  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: Array(colCount).fill(colWidth),
      rows: [headerRow, ...bodyRows],
    })
  );

  out.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  return out;
}

/* ============================================================ */
/* Build: Section (rekursif)                                    */
/* ============================================================ */

function buildSection(section: DocxSection): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const level = section.level ?? 1;

  if (section.heading) {
    let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel];
    let size: number;
    let alignment: (typeof AlignmentType)[keyof typeof AlignmentType];

    if (level === 1) {
      headingLevel = HeadingLevel.HEADING_1;
      size = SIZE_H1;
      alignment = AlignmentType.CENTER;
    } else if (level === 2) {
      headingLevel = HeadingLevel.HEADING_2;
      size = SIZE_H2;
      alignment = AlignmentType.LEFT;
    } else {
      headingLevel = HeadingLevel.HEADING_3;
      size = SIZE_H3;
      alignment = AlignmentType.LEFT;
    }

    out.push(
      new Paragraph({
        heading: headingLevel,
        alignment,
        spacing: {
          before: level === 1 ? 400 : 300,
          after: level === 1 ? 300 : 200,
          line: LINE_SPACING,
        },
        children: [
          new TextRun({
            text: level === 1 ? section.heading.toUpperCase() : section.heading,
            bold: true,
            font: FONT,
            size,
            color: COLOR_BLACK,
          }),
        ],
      })
    );
  }

  for (const para of section.paragraphs ?? []) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: LINE_SPACING, after: 120 },
        indent: { firstLine: INDENT_FIRST },
        children: textRuns(para),
      })
    );
  }

  for (const b of section.bullets ?? []) {
    out.push(
      new Paragraph({
        bullet: { level: 0 },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: LINE_SPACING, after: 80 },
        children: textRuns(b),
      })
    );
  }

  (section.numbered ?? []).forEach((n, i) => {
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: LINE_SPACING, after: 80 },
        indent: {
          left: convertInchesToTwip(0.5),
          hanging: convertInchesToTwip(0.25),
        },
        children: [
          new TextRun({
            text: `${i + 1}. `,
            font: FONT,
            size: SIZE_BODY,
            color: COLOR_BLACK,
          }),
          ...textRuns(n),
        ],
      })
    );
  });

  for (const t of section.tables ?? []) {
    out.push(...buildTable(t));
  }

  for (const sub of section.subsections ?? []) {
    out.push(...buildSection({ ...sub, level: (level + 1) as 1 | 2 | 3 }));
  }

  return out;
}

/* ============================================================ */
/* Build: Daftar Pustaka                                        */
/* ============================================================ */

function buildReferences(refs: string[]): Paragraph[] {
  const out: Paragraph[] = [];

  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 400 },
      children: [
        new TextRun({
          text: "DAFTAR PUSTAKA",
          bold: true,
          font: FONT,
          size: SIZE_H1,
          color: COLOR_BLACK,
        }),
      ],
    })
  );

  for (const ref of refs) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: LINE_SPACING, after: 120 },
        indent: { left: 720, hanging: 720 },
        children: textRuns(ref),
      })
    );
  }

  return out;
}

/* ============================================================ */
/* Build Word (.docx)                                           */
/* ============================================================ */

export async function buildDocx(content: DocxContent): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  const hasPreface = !!(content.preface && content.preface.length > 0);
  const hasRefs = !!(content.references && content.references.length > 0);

  // ============= COVER =============
  children.push(...buildCoverPage(content));
  children.push(
    new Paragraph({
      pageBreakBefore: true,
      children: [new TextRun({ text: "" })],
    })
  );

  // ============= KATA PENGANTAR =============
  if (hasPreface) {
    children.push(...buildPreface(content.preface!));
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        children: [new TextRun({ text: "" })],
      })
    );
  }

  // ============= DAFTAR ISI (manual, dinamis) =============
  children.push(...buildTableOfContents(content.sections ?? [], hasPreface, hasRefs));
  children.push(
    new Paragraph({
      pageBreakBefore: true,
      children: [new TextRun({ text: "" })],
    })
  );

  // ============= SECTIONS =============
  for (const section of content.sections ?? []) {
    children.push(...buildSection(section));
  }

  // ============= DAFTAR PUSTAKA =============
  if (hasRefs) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        children: [new TextRun({ text: "" })],
      })
    );
    children.push(...buildReferences(content.references!));
  }

  const doc = new Document({
    creator: content.author || "AI Chat",
    title: content.title,
    description: content.subtitle || "",
    features: {
      updateFields: true,
    },
    styles: {
      default: {
        document: {
          run: { font: FONT, size: SIZE_BODY, color: COLOR_BLACK },
          paragraph: { spacing: { line: LINE_SPACING } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1.18),
              right: convertInchesToTwip(1.18),
              bottom: convertInchesToTwip(1.18),
              left: convertInchesToTwip(1.57),
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
                    size: SIZE_FOOTER,
                    color: COLOR_BLACK,
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

/* ============================================================ */
/* Build Excel                                                  */
/* ============================================================ */

export function buildXlsx(content: XlsxContent): Buffer {
  const wb = XLSX.utils.book_new();

  const sheets = content.sheets?.length
    ? content.sheets
    : [{ name: "Sheet1", rows: [["(kosong)"]] }];

  for (const sheet of sheets) {
    const allRows: (string | number)[][] = sheet.title
      ? [[sheet.title], [], ...sheet.rows]
      : sheet.rows;

    const ws = XLSX.utils.aoa_to_sheet(allRows);

    const colWidths: Array<{ wch: number }> = [];
    const colCount = Math.max(...allRows.map((r) => r?.length ?? 0), 1);
    for (let c = 0; c < colCount; c++) {
      let maxLen = 10;
      for (const row of allRows) {
        const val = row?.[c];
        if (val != null) maxLen = Math.max(maxLen, String(val).length + 2);
      }
      colWidths.push({ wch: Math.min(maxLen, 50) });
    }
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, (sheet.name || "Sheet").slice(0, 31));
  }

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(out);
}