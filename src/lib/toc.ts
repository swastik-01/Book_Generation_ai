import { stripHtml, summarizeHtml } from "./db";

export interface TocChapterInput {
  index: number;
  title: string;
  partTitle?: string;
  synopsis?: string;
  actualSummary?: string;
  content?: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function chapterSummary(chapter: TocChapterInput, maxLength = 170) {
  const fromFields = chapter.actualSummary || chapter.synopsis || "";
  if (fromFields.trim()) return stripHtml(fromFields).slice(0, maxLength).trim();
  if (chapter.content) return summarizeHtml(chapter.content, maxLength).trim();
  return "";
}

export function buildTocHtmlFromChapters(
  chapters: TocChapterInput[],
  options: { heading?: string; includeSummary?: boolean } = {},
) {
  const { heading = "Contents", includeSummary = true } = options;
  if (!chapters.length) {
    return `
      <div class="toc-container p-10 max-w-2xl mx-auto paper-noise">
        <h1 class="font-serif text-4xl mb-8 text-center border-b pb-4">${escapeHtml(heading)}</h1>
        <p class="text-center text-muted-foreground italic">No chapters yet.</p>
      </div>
    `;
  }

  const grouped = new Map<string, TocChapterInput[]>();
  for (const chapter of chapters) {
    const key = chapter.partTitle?.trim() || "";
    const existing = grouped.get(key);
    if (existing) existing.push(chapter);
    else grouped.set(key, [chapter]);
  }

  const groupHtml = Array.from(grouped.entries())
    .map(([partTitle, partChapters]) => {
      const partHeader = partTitle
        ? `<h3 class="text-primary/60 font-black text-[10px] uppercase tracking-[0.3em] mb-4 border-l-2 border-primary/20 pl-3">${escapeHtml(partTitle)}</h3>`
        : "";
      const chapterRows = partChapters
        .map((chapter) => {
          const title = chapter.title?.trim() || `Chapter ${chapter.index + 1}`;
          const summary = includeSummary ? chapterSummary(chapter) : "";
          return `
            <li class="group">
              <div class="flex items-baseline gap-2">
                <span class="text-muted-foreground font-mono text-[10px] w-6">${chapter.index + 1}.</span>
                <span class="font-serif text-xl font-medium group-hover:text-primary transition-colors">${escapeHtml(title)}</span>
                <div class="flex-1 border-b border-dotted border-muted-foreground/30 mb-1 mx-2"></div>
              </div>
              ${
                summary
                  ? `<p class="ml-8 text-sm text-muted-foreground/90 italic mt-1">${escapeHtml(summary)}</p>`
                  : ""
              }
            </li>
          `;
        })
        .join("");

      return `
        <section class="toc-section">
          ${partHeader}
          <ol class="space-y-5 list-none">
            ${chapterRows}
          </ol>
        </section>
      `;
    })
    .join("");

  return `
    <div class="toc-container p-12 max-w-2xl mx-auto paper-noise">
      <h1 class="font-serif text-4xl mb-12 text-center tracking-widest uppercase border-b pb-6">${escapeHtml(heading)}</h1>
      <div class="space-y-10">
        ${groupHtml}
      </div>
    </div>
  `;
}

export function buildTocAnalysis(chapters: TocChapterInput[]) {
  return chapters
    .sort((left, right) => left.index - right.index)
    .map((chapter) => {
      const title = chapter.title?.trim() || `Chapter ${chapter.index + 1}`;
      const summary = chapterSummary(chapter, 220) || "No summary available.";
      return `${chapter.partTitle ? `[${chapter.partTitle}] ` : ""}Chapter ${chapter.index + 1}: ${title}\nSummary: ${summary}`;
    })
    .join("\n\n");
}
