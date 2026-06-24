// Smart chapter splitter for imported manuscripts.
// Skips front-matter (title page, copyright, dedication, table of contents/index)
// and only splits on real chapter headings.
import { buildTocHtmlFromChapters } from "./toc";

const TOC_TITLE_RE = /^(table of contents|contents|index)$/i;

const CHAPTER_HEADING_RE =
  /^(?:#{1,3}\s+.+|(?:chapter|ch\.?|part|book)\s+(?:[\divxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b.*|prologue|epilogue|introduction)$/gim;

export function splitIntoChapters(raw: string): { title: string; content: string }[] {
  return splitManuscript(raw).chapters;
}

export function splitManuscript(raw: string): {
  chapters: { title: string; content: string; partTitle?: string }[];
  frontMatter: { title: string; content: string; kind: "toc" | "custom" }[];
} {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { chapters: [], frontMatter: [] };

  // Pass 0: Detect Front Matter and TOC Blueprint
  let firstChapterIdx = text.length;

  // Pass 1: Find all potential headings for blueprinting
  const matches = [...text.matchAll(CHAPTER_HEADING_RE)];
  const candidates: { idx: number; lineLen: number; title: string; bodyWordCount: number }[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index!;
    const lineEnd = text.indexOf("\n", start);
    const lineLen = (lineEnd === -1 ? text.length : lineEnd) - start;
    const title = text.slice(start, start + lineLen).trim();

    const nextMatchStart = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    const body = text.slice(start + lineLen, nextMatchStart).trim();
    const wordCount = body.split(/\s+/).filter(Boolean).length;

    candidates.push({ idx: start, lineLen, title, bodyWordCount: wordCount });
  }

  // Find the real start of the book (first chapter with > 200 words)
  const firstRealChapter = candidates.find((c) => c.bodyWordCount > 200);
  if (firstRealChapter) {
    firstChapterIdx = firstRealChapter.idx;
  }

  const frontMatterText = text.slice(0, firstChapterIdx).trim();
  const frontMatterLines = frontMatterText.split("\n");

  // Extract blueprint from TOC
  const blueprint: { title: string; part?: string; summary?: string }[] = [];
  let currentPartTitle: string | undefined = undefined;

  for (let i = 0; i < frontMatterLines.length; i++) {
    const line = frontMatterLines[i].trim();
    if (!line) continue;

    if (/^part\s+/i.test(line) || /^book\s+/i.test(line) || /^section\s+/i.test(line)) {
      currentPartTitle = line;
    } else if (/^(chapter|ch\.?)\s+\d+/i.test(line)) {
      const title = line.replace(/^(chapter|ch\.?)\s+\d+[:.]?\s*/i, "").trim();
      let summary = "";
      // Look ahead for summary or extra lines
      let j = i + 1;
      while (j < frontMatterLines.length && j < i + 5) {
        const nextLine = frontMatterLines[j].trim();
        if (!nextLine || /^(chapter|ch\.?|part|book)\s+/i.test(nextLine)) break;
        if (nextLine.startsWith("* Summary:") || nextLine.startsWith("Summary:")) {
          summary = nextLine.replace(/^\*?\s*Summary:\s*/i, "");
          break;
        }
        j++;
      }
      blueprint.push({ title: title || line, part: currentPartTitle, summary });
    }
  }

  // Pass 2: Map Body Content to Blueprint
  const chapters: { title: string; content: string; partTitle?: string }[] = [];
  const bodyCandidates = candidates.filter((c) => c.idx >= firstChapterIdx);

  if (blueprint.length > 0) {
    // If we have a blueprint, try to match body headings to it
    for (let i = 0; i < blueprint.length; i++) {
      const entry = blueprint[i];
      // Try to find a heading in the body that matches the blueprint title or is "Chapter X"
      const match = bodyCandidates.find(
        (c) =>
          (entry.title && c.title.toLowerCase().includes(entry.title.toLowerCase())) ||
          c.title.toLowerCase().startsWith(`chapter ${i + 1}`) ||
          c.title.toLowerCase().startsWith(`ch ${i + 1}`) ||
          c.title.toLowerCase().includes(`chapter ${i + 1}`),
      );

      if (match) {
        const nextMatch =
          i + 1 < blueprint.length
            ? bodyCandidates.find(
                (c) =>
                  (blueprint[i + 1].title &&
                    c.title.toLowerCase().includes(blueprint[i + 1].title.toLowerCase())) ||
                  c.title.toLowerCase().startsWith(`chapter ${i + 2}`) ||
                  c.title.toLowerCase().includes(`chapter ${i + 2}`),
              )
            : null;

        const end = nextMatch ? nextMatch.idx : text.length;
        const body = text.slice(match.idx + match.lineLen, end).trim();
        chapters.push({
          title: match.title.replace(/^#+\s*/, ""),
          content: textToHtml(body || entry.summary || "..."),
          partTitle: entry.part,
        });
      } else {
        // Missing chapter in body! Create a placeholder with the TOC summary
        chapters.push({
          title: `Chapter ${i + 1}${entry.title ? `: ${entry.title}` : ""}`,
          content: textToHtml(
            entry.summary
              ? `*Summary from Index:*\n\n${entry.summary}\n\n[Content missing in manuscript - click to write]`
              : "...",
          ),
          partTitle: entry.part,
        });
      }
    }
  } else {
    // Fallback: No blueprint found, use finalCandidates logic
    const realIndices = candidates
      .map((c, i) =>
        c.bodyWordCount > 100 || (i === candidates.length - 1 && candidates.length > 1) ? i : -1,
      )
      .filter((idx) => idx !== -1);
    const finals = realIndices.length > 0 ? realIndices.map((idx) => candidates[idx]) : candidates;

    let activePart: string | undefined = undefined;
    for (let i = 0; i < finals.length; i++) {
      const c = finals[i];
      const prevIdx = i > 0 ? finals[i - 1].idx : 0;
      const skipped = candidates.filter((cand) => cand.idx > prevIdx && cand.idx < c.idx);
      const lastPart = skipped.reverse().find((s) => /^(part|book|section)\s+/i.test(s.title));
      if (lastPart) activePart = lastPart.title.replace(/^#+\s*/, "");

      const end = i + 1 < finals.length ? finals[i + 1].idx : text.length;
      const body = text.slice(c.idx + c.lineLen, end).trim();
      chapters.push({
        title: c.title.replace(/^#+\s*/, ""),
        content: textToHtml(body || "..."),
        partTitle: activePart,
      });
    }
  }

  // Front Matter
  const frontMatter: { title: string; content: string; kind: "toc" | "custom" }[] = [];
  if (frontMatterText) {
    const tocHeadingIndex = frontMatterLines.findIndex((line) => TOC_TITLE_RE.test(line.trim()));
    const hasToc =
      tocHeadingIndex >= 0 ||
      (blueprint.length > 0 && /\b(contents|index)\b/i.test(frontMatterText));

    if (hasToc) {
      const rawToc = (
        tocHeadingIndex >= 0 ? frontMatterLines.slice(tocHeadingIndex).join("\n") : frontMatterText
      ).trim();
      const tocContent =
        blueprint.length > 0
          ? buildTocHtmlFromChapters(
              blueprint.map((entry, index) => ({
                index,
                title: entry.title,
                partTitle: entry.part,
                synopsis: entry.summary,
              })),
              { heading: "Contents", includeSummary: true },
            )
          : textToHtml(rawToc);

      frontMatter.push({
        title: "Table of Contents",
        content: tocContent,
        kind: "toc",
      });
    }

    const nonTocFrontMatter =
      tocHeadingIndex > 0 ? frontMatterLines.slice(0, tocHeadingIndex).join("\n").trim() : "";
    const genericFrontMatter = hasToc ? nonTocFrontMatter : frontMatterText;
    if (genericFrontMatter) {
      frontMatter.push({
        title: "Front Matter",
        content: textToHtml(genericFrontMatter),
        kind: "custom",
      });
    }
  }

  return { chapters, frontMatter };
}

export function textToHtml(text: string): string {
  // Normalize whitespace: replace 3+ newlines with 2
  const normalized = text.replace(/\n{3,}/g, "\n\n").trim();

  return normalized
    .split(/\n\s*\n/)
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";

      // Detect sub-headings: short lines, no ending punctuation, starts with uppercase
      const lines = trimmed.split("\n");
      if (lines.length === 1) {
        const line = lines[0];
        const isPotentialHeading =
          line.length < 100 &&
          /^[A-Z]/.test(line) &&
          !/[.?!]$/.test(line) &&
          line.split(" ").length < 15;

        if (isPotentialHeading) {
          return `<h3 class="font-serif text-xl font-bold mt-8 mb-4 text-primary/90 tracking-tight border-b border-primary/10 pb-2">${escapeHtml(line)}</h3>`;
        }
      }

      return `<p class="mb-4 leading-relaxed">${escapeHtml(trimmed).replace(/\n/g, "<br/>")}</p>`;
    })
    .filter(Boolean)
    .join("");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function isLikelyTocChapter(title: string, content: string): boolean {
  const t = title.toLowerCase();
  if (t.includes("contents") || t.includes("index") || t.includes("table of contents")) return true;
  // If content is very short and contains many "Chapter" or "..." strings
  const c = content.toLowerCase();
  const chapterCount = (c.match(/chapter/g) || []).length;
  const dotCount = (c.match(/\.\.\./g) || []).length;
  return (chapterCount > 3 || dotCount > 5) && content.length < 2000;
}
