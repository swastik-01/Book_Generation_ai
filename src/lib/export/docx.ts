import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  ImageRun,
  FootnoteReferenceRun,
  ExternalHyperlink,
  PageOrientation,
} from "docx";
import {
  downloadBlob,
  htmlToParagraphs,
  loadBundle,
  safeFilename,
  type ExportOptions,
} from "./common";

function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  type: "png" | "jpg" | "gif" | "bmp";
} {
  const m = dataUrl.match(/^data:image\/([a-z]+);base64,(.+)$/i);
  if (!m) throw new Error("Not a base64 image data URL");
  const ext = m[1].toLowerCase();
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const type = (ext === "jpeg" ? "jpg" : ext) as "png" | "jpg" | "gif" | "bmp";
  return { bytes, type };
}

export async function exportDocx(bookId: string, opts: ExportOptions) {
  const { book, chapters, frontPages, backPages, references } = await loadBundle(bookId);
  opts.onProgress?.(0.1, "Building DOCX…");

  const children: Paragraph[] = [];
  const footnotes: Record<number, { children: Paragraph[] }> = {};
  let footnoteCounter = 1;
  const refToFootnoteId = new Map<string, number>();

  if (opts.scope === "complete" && book.coverDataUrl?.startsWith("data:image/")) {
    try {
      const { bytes, type } = dataUrlToBytes(book.coverDataUrl);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              type,
              data: bytes,
              transformation: { width: 360, height: 540 },
              altText: { title: "Cover", description: book.title, name: "cover" },
            }),
          ],
        }),
      );
      children.push(new Paragraph({ children: [new PageBreak()] }));
    } catch {
      /* skip cover if invalid */
    }
  }

  if (opts.scope === "complete") {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 2400, after: 600 },
        children: [new TextRun({ text: book.title, size: 64, bold: true })],
      }),
    );
    children.push(new Paragraph({ children: [new PageBreak()] }));

    for (const fp of frontPages) {
      children.push(
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(fp.title)] }),
      );
      for (const para of htmlToParagraphs(fp.content)) {
        children.push(new Paragraph({ children: [new TextRun(para)] }));
      }
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  for (const c of chapters) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun(`Chapter ${c.index + 1}: ${c.title}`)],
      }),
    );
    const chRefs = references.filter((r) => r.chapterId === c.id && r.kind === "footnote");
    for (const r of chRefs) {
      const id = footnoteCounter++;
      refToFootnoteId.set(r.id, id);
      footnotes[id] = {
        children: [
          new Paragraph({ children: [new TextRun(r.citation + (r.url ? ` (${r.url})` : ""))] }),
        ],
      };
    }
    for (const para of htmlToParagraphs(c.content)) {
      // Replace [N] markers with footnote references where they match a chapter reference label
      const runs: (TextRun | FootnoteReferenceRun)[] = [];
      const tokens = para.split(/(\[\d+\])/g);
      for (const tok of tokens) {
        const mk = tok.match(/^\[(\d+)\]$/);
        if (mk) {
          const ref = chRefs.find((r) => r.label === mk[1]);
          const fid = ref ? refToFootnoteId.get(ref.id) : undefined;
          if (fid) {
            runs.push(new FootnoteReferenceRun(fid));
            continue;
          }
        }
        if (tok) runs.push(new TextRun(tok));
      }
      children.push(new Paragraph({ children: runs.length ? runs : [new TextRun(para)] }));
    }
  }

  if (opts.scope === "complete") {
    for (const bp of backPages) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
          children: [new TextRun(bp.title)],
        }),
      );
      for (const para of htmlToParagraphs(bp.content)) {
        children.push(new Paragraph({ children: [new TextRun(para)] }));
      }
    }
    const endnotes = references.filter((r) => r.kind === "endnote");
    if (endnotes.length) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: true,
          children: [new TextRun("References")],
        }),
      );
      for (const r of endnotes) {
        children.push(
          new Paragraph({
            children: r.url
              ? [
                  new TextRun(`[${r.label}] ${r.citation} — `),
                  new ExternalHyperlink({
                    children: [new TextRun({ text: r.url, style: "Hyperlink" })],
                    link: r.url,
                  }),
                ]
              : [new TextRun(`[${r.label}] ${r.citation}`)],
          }),
        );
      }
    }
  }

  opts.onProgress?.(0.6, "Packing…");
  const doc = new Document({
    creator: "Quill",
    title: book.title,
    styles: { default: { document: { run: { font: "Georgia", size: 24 } } } },
    footnotes,
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  opts.onProgress?.(1, "Done");
  downloadBlob(blob, `${safeFilename(book.title)}.docx`);
}
