import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";
import {
  downloadBlob,
  htmlToParagraphs,
  loadBundle,
  safeFilename,
  type ExportOptions,
} from "./common";

function trimSize(t: ExportOptions["trim"]): [number, number] {
  switch (t) {
    case "5x8":
      return [360, 576];
    case "A5":
      return PageSizes.A5;
    case "Letter":
      return PageSizes.Letter;
    case "6x9":
    default:
      return [432, 648];
  }
}

export async function exportPdf(bookId: string, opts: ExportOptions) {
  const { book, chapters, frontPages, backPages, references } = await loadBundle(bookId);
  opts.onProgress?.(0.1, "Setting up PDF…");

  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const [pageW, pageH] = trimSize(opts.trim);
  const margin = 54;
  const lineHeight = 14;
  const bodySize = 11;

  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  function newPage() {
    page = pdf.addPage([pageW, pageH]);
    y = pageH - margin;
  }

  function wrapText(
    text: string,
    font = serif,
    size = bodySize,
    maxWidth = pageW - margin * 2,
  ): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      const width = font.widthOfTextAtSize(trial, size);
      if (width > maxWidth && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = trial;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawParagraph(
    text: string,
    opts: {
      font?: typeof serif;
      size?: number;
      bold?: boolean;
      italic?: boolean;
      align?: "left" | "center";
      spaceAfter?: number;
    } = {},
  ) {
    const font = opts.bold ? serifBold : opts.italic ? serifItalic : opts.font || serif;
    const size = opts.size || bodySize;
    const lh = size * 1.35;
    for (const line of wrapText(text, font, size)) {
      if (y - lh < margin) newPage();
      const lw = font.widthOfTextAtSize(line, size);
      const x = opts.align === "center" ? (pageW - lw) / 2 : margin;
      page.drawText(line, { x, y: y - size, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= lh;
    }
    y -= opts.spaceAfter ?? 6;
  }

  // Cover page (image only)
  if (opts.scope === "complete" && book.coverDataUrl?.startsWith("data:image/")) {
    try {
      const ext = book.coverDataUrl.match(/^data:image\/([a-z]+);/i)?.[1].toLowerCase();
      const b64 = book.coverDataUrl.split(",")[1];
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const img =
        ext === "png"
          ? await pdf.embedPng(bytes)
          : ext === "jpg" || ext === "jpeg"
            ? await pdf.embedJpg(bytes)
            : null;
      if (img) {
        const ratio = Math.min((pageW - margin * 2) / img.width, (pageH - margin * 2) / img.height);
        const w = img.width * ratio,
          h = img.height * ratio;
        page.drawImage(img, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
        newPage();
      }
    } catch {
      /* skip */
    }
  }

  if (opts.scope === "complete") {
    // Title page
    y = pageH * 0.6;
    drawParagraph(book.title, { size: 28, bold: true, align: "center", spaceAfter: 16 });
    newPage();

    for (const fp of frontPages) {
      drawParagraph(fp.title, { size: 18, bold: true, spaceAfter: 12 });
      for (const p of htmlToParagraphs(fp.content)) drawParagraph(p);
      newPage();
    }
  }

  opts.onProgress?.(0.4, "Laying out chapters…");
  for (const c of chapters) {
    if (y < pageH - margin) newPage();
    drawParagraph(`Chapter ${c.index + 1}`, {
      size: 12,
      italic: true,
      align: "center",
      spaceAfter: 6,
    });
    drawParagraph(c.title, { size: 22, bold: true, align: "center", spaceAfter: 24 });
    for (const p of htmlToParagraphs(c.content)) drawParagraph(p);
    const chRefs = references.filter((r) => r.chapterId === c.id && r.kind === "footnote");
    if (chRefs.length) {
      y -= lineHeight;
      drawParagraph("Footnotes", { size: 10, bold: true, spaceAfter: 4 });
      for (const r of chRefs)
        drawParagraph(`[${r.label}] ${r.citation}${r.url ? ` — ${r.url}` : ""}`, { size: 9 });
    }
  }

  if (opts.scope === "complete") {
    for (const bp of backPages) {
      newPage();
      drawParagraph(bp.title, { size: 18, bold: true, spaceAfter: 12 });
      for (const p of htmlToParagraphs(bp.content)) drawParagraph(p);
    }
    const endnotes = references.filter((r) => r.kind === "endnote");
    if (endnotes.length) {
      newPage();
      drawParagraph("References", { size: 18, bold: true, spaceAfter: 12 });
      for (const r of endnotes)
        drawParagraph(`[${r.label}] ${r.citation}${r.url ? ` — ${r.url}` : ""}`, { size: 9 });
    }
  }

  opts.onProgress?.(0.9, "Finalising…");
  const bytes = await pdf.save();
  // Wrap into a fresh ArrayBuffer so Blob doesn't get a SharedArrayBuffer-typed view.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  downloadBlob(new Blob([ab], { type: "application/pdf" }), `${safeFilename(book.title)}.pdf`);
  opts.onProgress?.(1, "Done");
}
