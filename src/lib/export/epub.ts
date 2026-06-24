import { zipSync, strToU8 } from "fflate";
import { downloadBlob, escapeXml, loadBundle, safeFilename, type ExportOptions } from "./common";

function chapterXhtml(title: string, htmlBody: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body><h1>${escapeXml(title)}</h1>${htmlBody}</body></html>`;
}

export async function exportEpub(bookId: string, opts: ExportOptions) {
  const { book, chapters, frontPages, backPages, references } = await loadBundle(bookId);
  opts.onProgress?.(0.2, "Building EPUB…");

  const id = `urn:uuid:${crypto.randomUUID()}`;
  const files: Record<string, Uint8Array> = {};
  files["mimetype"] = strToU8("application/epub+zip");
  files["META-INF/container.xml"] = strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  files["OEBPS/style.css"] = strToU8(
    `body{font-family:Georgia,serif;line-height:1.7}h1{font-size:1.6em;margin:2em 0 1em}p{margin:0 0 1em}img{max-width:100%}`,
  );

  const manifest: string[] = [];
  const spine: string[] = [];
  let coverItem = "";

  // Cover
  if (opts.scope === "complete" && book.coverDataUrl?.startsWith("data:image/")) {
    const m = book.coverDataUrl.match(/^data:image\/([a-z]+);base64,(.+)$/i);
    if (m) {
      const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      files[`OEBPS/cover.${ext}`] = bytes;
      manifest.push(
        `<item id="cover-image" href="cover.${ext}" media-type="image/${ext === "jpg" ? "jpeg" : ext}" properties="cover-image"/>`,
      );
      files["OEBPS/cover.xhtml"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head>
<body><div style="text-align:center"><img src="cover.${ext}" alt="cover"/></div></body></html>`);
      manifest.push(`<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
      spine.push(`<itemref idref="cover"/>`);
      coverItem = `<meta name="cover" content="cover-image"/>`;
    }
  }

  // Front matter
  if (opts.scope === "complete") {
    frontPages.forEach((p, i) => {
      const fname = `front-${i + 1}.xhtml`;
      files[`OEBPS/${fname}`] = strToU8(chapterXhtml(p.title, p.content));
      manifest.push(
        `<item id="front-${i + 1}" href="${fname}" media-type="application/xhtml+xml"/>`,
      );
      spine.push(`<itemref idref="front-${i + 1}"/>`);
    });
  }

  // Chapters
  chapters.forEach((c, i) => {
    const fname = `chap-${i + 1}.xhtml`;
    const chRefs = references.filter((r) => r.chapterId === c.id && r.kind === "footnote");
    let body = c.content;
    if (chRefs.length) {
      body += `<hr/><h2>Footnotes</h2><ol>${chRefs.map((r) => `<li>${escapeXml(r.citation)}${r.url ? ` — <a href="${escapeXml(r.url)}">${escapeXml(r.url)}</a>` : ""}</li>`).join("")}</ol>`;
    }
    files[`OEBPS/${fname}`] = strToU8(chapterXhtml(`Chapter ${i + 1}: ${c.title}`, body));
    manifest.push(`<item id="chap-${i + 1}" href="${fname}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="chap-${i + 1}"/>`);
  });

  if (opts.scope === "complete") {
    backPages.forEach((p, i) => {
      const fname = `back-${i + 1}.xhtml`;
      files[`OEBPS/${fname}`] = strToU8(chapterXhtml(p.title, p.content));
      manifest.push(
        `<item id="back-${i + 1}" href="${fname}" media-type="application/xhtml+xml"/>`,
      );
      spine.push(`<itemref idref="back-${i + 1}"/>`);
    });
    const endnotes = references.filter((r) => r.kind === "endnote");
    if (endnotes.length) {
      const html = `<ol>${endnotes.map((r) => `<li>${escapeXml(r.citation)}${r.url ? ` — <a href="${escapeXml(r.url)}">${escapeXml(r.url)}</a>` : ""}</li>`).join("")}</ol>`;
      files["OEBPS/references.xhtml"] = strToU8(chapterXhtml("References", html));
      manifest.push(
        `<item id="references" href="references.xhtml" media-type="application/xhtml+xml"/>`,
      );
      spine.push(`<itemref idref="references"/>`);
    }
  }

  // Nav doc
  const navItems = chapters
    .map(
      (c, i) =>
        `<li><a href="chap-${i + 1}.xhtml">Chapter ${i + 1}: ${escapeXml(c.title)}</a></li>`,
    )
    .join("");
  files["OEBPS/nav.xhtml"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><h1>Contents</h1><ol>${navItems}</ol></nav></body></html>`);
  manifest.push(
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
  );
  manifest.push(`<item id="style" href="style.css" media-type="text/css"/>`);

  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="bookid">${id}</dc:identifier>
  <dc:title>${escapeXml(book.title)}</dc:title>
  <dc:language>en</dc:language>
  <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  ${coverItem}
</metadata>
<manifest>${manifest.join("")}</manifest>
<spine>${spine.join("")}</spine>
</package>`);

  opts.onProgress?.(0.7, "Zipping…");
  // mimetype must be stored uncompressed and first.
  const zipped = zipSync(files, { level: 6 });
  // Wrap into ArrayBuffer to satisfy Blob typing in TS strict mode.
  const ab = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(ab).set(zipped);
  downloadBlob(
    new Blob([ab], { type: "application/epub+zip" }),
    `${safeFilename(book.title)}.epub`,
  );
  opts.onProgress?.(1, "Done");
}
