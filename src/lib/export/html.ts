import {
  downloadBlob,
  escapeXml,
  loadBundle,
  safeFilename,
  type BookBundle,
  type ExportOptions,
} from "./common";

export function renderHtmlExport(bundle: BookBundle, scope: ExportOptions["scope"]) {
  const { book, chapters, frontPages, backPages, references } = bundle;

  const css = `
    body { font-family: Georgia, serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; line-height: 1.7; }
    h1, h2, h3 { font-family: 'Cormorant Garamond', Georgia, serif; }
    h1.book-title { font-size: 3rem; text-align: center; margin: 4rem 0 0.5rem; }
    .author { text-align: center; font-style: italic; color: #555; margin-bottom: 6rem; }
    .cover { max-width: 100%; display: block; margin: 0 auto 4rem; }
    .chapter { page-break-before: always; }
    h2.chapter-title { font-size: 2rem; margin-top: 4rem; }
    .footnotes { font-size: 0.85rem; border-top: 1px solid #ccc; margin-top: 3rem; padding-top: 1rem; }
    img { max-width: 100%; height: auto; }
  `;

  let html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(book.title)}</title><style>${css}</style></head><body>`;

  if (scope === "complete") {
    if (book.coverDataUrl) html += `<img class="cover" src="${book.coverDataUrl}" alt="cover" />`;
    html += `<h1 class="book-title">${escapeXml(book.title)}</h1>`;
    for (const fp of frontPages) {
      html += `<section class="front"><h2>${escapeXml(fp.title)}</h2>${fp.content}</section>`;
    }
  }

  for (const chapter of chapters) {
    const chapterRefs = references.filter(
      (reference) => reference.chapterId === chapter.id && reference.kind === "footnote",
    );
    html += `<section class="chapter"><h2 class="chapter-title">Chapter ${chapter.index + 1}: ${escapeXml(chapter.title)}</h2>${chapter.content}`;
    if (chapterRefs.length) {
      html += `<div class="footnotes"><strong>Footnotes</strong><ol>${chapterRefs
        .map(
          (reference) =>
            `<li>${escapeXml(reference.citation)}${reference.url ? ` - <a href="${escapeXml(reference.url)}">${escapeXml(reference.url)}</a>` : ""}</li>`,
        )
        .join("")}</ol></div>`;
    }
    html += `</section>`;
  }

  if (scope === "complete") {
    for (const bp of backPages) {
      html += `<section class="back"><h2>${escapeXml(bp.title)}</h2>${bp.content}</section>`;
    }
    const endnotes = references.filter((reference) => reference.kind === "endnote");
    if (endnotes.length) {
      html += `<section class="back"><h2>References</h2><ol>${endnotes
        .map(
          (reference) =>
            `<li>${escapeXml(reference.citation)}${reference.url ? ` - <a href="${escapeXml(reference.url)}">${escapeXml(reference.url)}</a>` : ""}</li>`,
        )
        .join("")}</ol></section>`;
    }
  }

  html += `</body></html>`;
  return html;
}

export async function exportHtml(bookId: string, opts: ExportOptions) {
  const bundle = await loadBundle(bookId);
  opts.onProgress?.(0.2, "Assembling HTML...");
  const html = renderHtmlExport(bundle, opts.scope);
  opts.onProgress?.(1, "Done");
  downloadBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    `${safeFilename(bundle.book.title)}.html`,
  );
}
