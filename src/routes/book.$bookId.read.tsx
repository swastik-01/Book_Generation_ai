import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "@/lib/db";
import { isLikelyTocChapter } from "@/lib/import";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize2, BookOpen } from "lucide-react";

export const Route = createFileRoute("/book/$bookId/read")({
  component: ReadingView,
});

type Section = { kind: "cover" | "page" | "chapter" | "endnotes"; title: string; html: string };

function ReadingView() {
  const { bookId } = Route.useParams();
  const navigate = useNavigate();

  const [sections, setSections] = useState<Section[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [pageIdx, setPageIdx] = useState(0);
  const [doublePage, setDoublePage] = useState(true);
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<"paper" | "sepia" | "dark">("paper");
  const [flipping, setFlipping] = useState<"next" | "prev" | null>(null);
  const [bookTitle, setBookTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continuous, setContinuous] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const heightScale = window.innerHeight < 850 ? window.innerHeight / 900 : 1;
      const widthScale = window.innerWidth < (doublePage ? 1200 : 600) ? window.innerWidth / (doublePage ? 1300 : 700) : 1;
      setScale(Math.min(heightScale, widthScale));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [doublePage]);

  // Load all content as flat ordered sections.
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const book = await db.books.get(bookId);
        if (!book) {
          setSections([]);
          setError("Book not found in this browser.");
          return;
        }
        setBookTitle(book.title);

        const [chapters, pagesAll, refs] = await Promise.all([
          db.chapters.where("bookId").equals(bookId).sortBy("index"),
          db.bookPages.where("bookId").equals(bookId).toArray(),
          db.references.where("bookId").equals(bookId).toArray(),
        ]);

        const front = pagesAll
          .filter((p) => p.section === "front")
          .sort((a, b) => a.index - b.index);
        const back = pagesAll.filter((p) => p.section === "back").sort((a, b) => a.index - b.index);
        const built: Section[] = [];

        // Cover
        if (book.coverDataUrl) {
          built.push({
            kind: "cover",
            title: book.title,
            html: `<div class="flex flex-col items-center justify-center h-full text-center p-4">
                    <div class="relative mb-8 group">
                      <img src="${book.coverDataUrl}" class="max-w-[85%] max-h-[45vh] shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-sm mx-auto transition-transform duration-500 group-hover:scale-[1.02]" />
                    </div>
                    <h1 class="text-4xl font-serif mb-4 tracking-tight leading-tight">${escape(book.title)}</h1>
                    ${book.authorName ? `<p class="text-xl opacity-60 font-serif italic">by ${escape(book.authorName)}</p>` : ""}
                    <div class="mt-12 w-12 h-[1px] bg-black/10 mx-auto"></div>
                  </div>`,
          });
        }

        // Front Matter
        for (const fp of front) {
          // If the content already has an H1 (like our new premium TOC), don't add another
          const hasH1 = fp.content.includes("<h1");
          built.push({
            kind: "page",
            title: fp.title,
            html: hasH1 ? fp.content : `<h1>${escape(fp.title)}</h1>${fp.content}`,
          });
        }

        // Chapters
        for (const c of chapters) {
          const chRefs = refs.filter((r) => r.chapterId === c.id && r.kind === "footnote");

          // Fix redundant "Chapter X: Chapter X"
          const cleanTitle = c.title.replace(/^chapter\s+\d+[:.]?\s*/i, "");
          let body = `<h1>Chapter ${c.index + 1}: ${escape(cleanTitle)}</h1>${c.content}`;

          if (chRefs.length) {
            body += `<hr class="my-8 opacity-20"/><div class="text-sm opacity-80 italic"><strong>Footnotes</strong><ol class="mt-2 space-y-1">${chRefs.map((r) => `<li>${escape(r.citation)}${r.url ? ` — <a href="${r.url}" class="underline">${escape(r.url)}</a>` : ""}</li>`).join("")}</ol></div>`;
          }
          built.push({ kind: "chapter", title: c.title, html: body });
        }

        // Back Matter
        for (const bp of back) {
          built.push({
            kind: "page",
            title: bp.title,
            html: `<h1>${escape(bp.title)}</h1>${bp.content}`,
          });
        }

        const endnotes = refs.filter((r) => r.kind === "endnote");
        if (endnotes.length) {
          built.push({
            kind: "endnotes",
            title: "References",
            html: `<h1>References</h1><ol class="space-y-4">${endnotes.map((r) => `<li>${escape(r.citation)}${r.url ? ` — <a href="${r.url}" class="underline">${escape(r.url)}</a>` : ""}</li>`).join("")}</ol>`,
          });
        }

        setSections(built);
      } catch (e) {
        setSections([]);
        setError((e as Error).message || "Could not open the reader.");
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId]);

  // Paginate by laying sections into a hidden box and binary-searching breaks.
  useEffect(() => {
    if (!sections.length) return;
    if (continuous) {
      setPages(sections.map((s) => s.html));
      setPageIdx(0);
      return;
    }

    const out: string[] = [];
    const measurer = document.createElement("div");
    // MATCH THE CSS EXACTLY: 540x720, padding 56px (content width: 540 - 112 = 428)
    measurer.style.cssText = `
      position:fixed; left:-9999px; top:0; 
      width:540px; height:720px; 
      padding:56px; box-sizing:border-box;
      font-family:'Cormorant Garamond', serif; 
      line-height:1.8; overflow:hidden; visibility:hidden;
      background: white;
    `;
    measurer.className = "page-content prose prose-serif max-w-none prose-p:mb-4 prose-h1:text-center prose-h1:text-3xl prose-h1:mb-8 prose-h1:font-serif";
    document.body.appendChild(measurer);

    try {
      for (const s of sections) {
        const sectionDiv = document.createElement("div");
        sectionDiv.style.fontSize = `${fontSize}px`;
        sectionDiv.innerHTML = s.html;

        const blocks = Array.from(sectionDiv.children) as HTMLElement[];
        let currentPageHtml = "";

        for (const blk of blocks) {
          const originalHtml = blk.outerHTML;
          measurer.innerHTML = currentPageHtml + originalHtml;

          if (measurer.scrollHeight > measurer.clientHeight) {
            // This block overflows. Push current page if not empty.
            if (currentPageHtml) {
              out.push(currentPageHtml);
              currentPageHtml = "";
            }

            // Now, can we fit this block alone on a fresh page?
            measurer.innerHTML = originalHtml;
            if (measurer.scrollHeight <= measurer.clientHeight) {
              currentPageHtml = originalHtml;
            } else {
              // GIGA-BLOCK: This single element is bigger than a whole page!
              // We must split it. For now, we'll split by sentences or just force it in.
              // A better way: split the text content if it's a P or DIV.
            if ((blk.tagName === "P" || blk.tagName === "DIV") && s.kind !== "cover") {
                // Better splitting logic: match words OR tags
                const parts = blk.innerHTML.match(/(<[^>]+>|[^<>\s]+|\s+)/g) || [];
                let subBuf = "";
                for (const part of parts) {
                  const testHtml = `<${blk.tagName.toLowerCase()}>${subBuf}${part}</${blk.tagName.toLowerCase()}>`;
                  measurer.innerHTML = testHtml;
                  if (measurer.scrollHeight > measurer.clientHeight) {
                    if (subBuf) {
                      out.push(`<${blk.tagName.toLowerCase()}>${subBuf}</${blk.tagName.toLowerCase()}>`);
                    }
                    subBuf = part;
                  } else {
                    subBuf += part;
                  }
                }
                currentPageHtml = subBuf ? `<${blk.tagName.toLowerCase()}>${subBuf}</${blk.tagName.toLowerCase()}>` : "";
              } else {
                // For H1, H2, IMG, etc.
                measurer.innerHTML = currentPageHtml + originalHtml;
                if (measurer.scrollHeight > measurer.clientHeight) {
                  if (currentPageHtml) out.push(currentPageHtml);
                  currentPageHtml = originalHtml;
                } else {
                  currentPageHtml += originalHtml;
                }
              }
            }
          } else {
            currentPageHtml += originalHtml;
          }
        }

        if (currentPageHtml) out.push(currentPageHtml);

        // Add a blank page if needed to ensure next section starts on a fresh spread
        if (doublePage && out.length % 2 !== 0) {
          // out.push("<div class='flex items-center justify-center h-full opacity-10 font-serif italic'>•</div>");
        }
      }
    } catch (e) {
      console.error("Pagination error", e);
      setContinuous(true);
    } finally {
      document.body.removeChild(measurer);
    }

    setPages(out);
    setPageIdx(0);
  }, [sections, fontSize, continuous, doublePage]);

  const go = useCallback(
    (dir: "next" | "prev") => {
      setFlipping(dir);
      const step = doublePage ? 2 : 1;
      setTimeout(() => {
        setPageIdx((i) =>
          Math.max(0, Math.min(pages.length - 1, dir === "next" ? i + step : i - step)),
        );
        setFlipping(null);
      }, 280);
    },
    [doublePage, pages.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go("next");
      else if (e.key === "ArrowLeft") go("prev");
      else if (e.key.toLowerCase() === "d") setDoublePage((d) => !d);
      else if (e.key.toLowerCase() === "f")
        document.documentElement.requestFullscreen?.().catch(() => {});
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const themeStyles = useMemo(() => {
    if (theme === "sepia") return { bg: "#f5e9d4", page: "#f9f0dc", ink: "#3a2a1a" };
    if (theme === "dark") return { bg: "#161616", page: "#222", ink: "#e8e3d8" };
    return { bg: "#e8e0d2", page: "#fdfaf3", ink: "#1a1a1a" };
  }, [theme]);

  const totalPages = pages.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading book…
      </div>
    );
  }

  if (error || !sections.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <p>{error || "No content to read yet."}</p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/book/$bookId", params: { bookId } })}
        >
          Back to editor
        </Button>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: themeStyles.bg, color: themeStyles.ink }}
    >
      <header
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ borderColor: "rgba(0,0,0,0.1)" }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/book/$bookId", params: { bookId } })}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Editor
        </Button>
        <div className="font-serif text-lg truncate flex-1">{bookTitle}</div>
        <div className="text-xs opacity-70 hidden sm:block">
          {Math.min(pageIdx + 1, totalPages)} / {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-60">A</span>
          <Slider
            value={[fontSize]}
            min={14}
            max={26}
            step={1}
            onValueChange={(v) => setFontSize(v[0])}
            className="w-24"
          />
          <span className="text-base opacity-60">A</span>
        </div>
        <Select value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
          <SelectTrigger className="w-24 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="paper">Paper</SelectItem>
            <SelectItem value="sepia">Sepia</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setDoublePage(!doublePage)}>
          <BookOpen className="h-4 w-4 mr-1" /> {doublePage ? "Single" : "Double"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </header>

      <div
        className="flex-1 flex items-center justify-center p-6 select-none overflow-hidden relative"
        style={{ perspective: "3000px" }}
      >
        <div
          className={`flex items-stretch transition-all duration-700 relative ${flipping ? "scale-[0.98] opacity-90" : "scale-100 opacity-100"}`}
          style={{ 
            transform: `scale(${scale})`,
            transformOrigin: "center",
          }}
        >
          {/* Book Spine/Shadow */}
          {doublePage && (
            <div className="absolute inset-y-0 left-1/2 -ml-[20px] w-[40px] z-20 pointer-events-none bg-gradient-to-r from-transparent via-black/15 to-transparent blur-[2px]" />
          )}
          
          <Page
            html={pages[pageIdx] || ""}
            fontSize={fontSize}
            bg={themeStyles.page}
            ink={themeStyles.ink}
            flip={flipping}
            side="left"
            number={pageIdx + 1}
          />
          {doublePage && (
            <>
              <div className="w-[1px] self-stretch bg-black/5 z-10" />
              <Page
                html={pages[pageIdx + 1] || ""}
                fontSize={fontSize}
                bg={themeStyles.page}
                ink={themeStyles.ink}
                flip={flipping}
                side="right"
                number={pageIdx + 2}
              />
            </>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-center gap-4 py-4">
        <Button variant="outline" onClick={() => go("prev")} disabled={pageIdx === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Prev
        </Button>
        <span className="text-xs opacity-70">Use ← → keys</span>
        <Button variant="outline" onClick={() => go("next")} disabled={pageIdx >= totalPages - 1}>
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </footer>

      <style>{`
        .reader-page { 
          position: relative;
          width: 540px; 
          height: 720px; 
          box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.4), 0 18px 36px -18px rgba(0, 0, 0, 0.5); 
          padding: 64px 56px; 
          overflow: hidden; 
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid rgba(0,0,0,0.08);
          background-image: linear-gradient(to right, rgba(255,255,255,0.05), transparent 5%, transparent 95%, rgba(0,0,0,0.05));
        }
        .page-left { 
          border-radius: 6px 40px 40px 6px; 
          box-shadow: -15px 25px 50px rgba(0,0,0,0.25), inset -30px 0 40px -20px rgba(0,0,0,0.15);
        }
        .page-right { 
          border-radius: 40px 6px 6px 40px; 
          box-shadow: 15px 25px 50px rgba(0,0,0,0.25), inset 30px 0 40px -20px rgba(0,0,0,0.15);
        }
        .page-texture {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }
        .page-content img {
          display: block;
          margin: 2rem auto;
          max-width: 90%;
          height: auto;
          border-radius: 2px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .drop-cap::first-letter {
          float: left;
          font-size: 4.5rem;
          line-height: 0.8;
          padding-top: 4px;
          padding-right: 12px;
          padding-left: 3px;
          font-family: 'Cormorant Garamond', serif;
          font-weight: 700;
          color: var(--primary, #c084fc);
        }
        .reader-page h1 { 
          font-family: 'Cormorant Garamond', serif; 
          font-size: 2.8rem; 
          margin-top: 3rem;
          margin-bottom: 4rem; 
          font-weight: 500; 
          line-height: 1.2; 
          text-align: center; 
          letter-spacing: -0.01em;
          color: rgba(0,0,0,0.85);
        }
        .reader-page h2 { font-family: 'Cormorant Garamond', serif; font-size: 1.6rem; margin: 2.5rem 0 1.2rem; font-weight: 500; text-align: center; opacity: 0.8; }
        .reader-page p { margin-bottom: 1.6rem; font-size: 1.15em; text-indent: 0; }
        .reader-page p + p { text-indent: 2em; margin-top: -1.6rem; } /* Classic book style: indent paragraphs except first */
        .reader-page .drop-cap + p { text-indent: 0; margin-top: 0; }
        .reader-page img { max-width: 100%; height: auto; border-radius: 4px; }
        .flipping { filter: brightness(0.95); }
      `}</style>
    </div>
  );
}

function Page({
  html,
  fontSize,
  bg,
  ink,
  flip,
  side,
  number,
}: {
  html: string;
  fontSize: number;
  bg: string;
  ink: string;
  flip: "next" | "prev" | null;
  side: "left" | "right";
  number: number;
}) {
  const cls =
    flip === "next" && side === "right"
      ? "flip-next-right"
      : flip === "prev" && side === "left"
        ? "flip-prev-left"
        : "";

  // Apply Drop Cap if it's the start of a chapter (starts with <h1>Chapter)
  const hasChapterHeader = html.includes("<h1");
  const processedHtml = hasChapterHeader
    ? html.replace(
        /<p class="mb-4 leading-relaxed">(\w)/,
        '<p class="mb-4 leading-relaxed drop-cap">$1',
      )
    : html;

  return (
    <div
      className={`reader-page ${cls} ${side === "left" ? "page-left" : "page-right"}`}
      style={{
        backgroundColor: bg,
        color: ink,
        fontSize,
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        lineHeight: 1.8,
      }}
    >
      <div className="page-texture" />
      <div
        className="page-content prose prose-serif max-w-none prose-p:mb-4 prose-h1:text-center prose-h1:text-3xl prose-h1:mb-8 prose-h1:font-serif"
        dangerouslySetInnerHTML={{
          __html: processedHtml || "<p style='opacity:0.2;text-align:center;margin-top:40%'>•</p>",
        }}
      />
      {html && (
        <div className="page-number absolute bottom-4 left-0 right-0 text-center text-[10px] opacity-40 font-mono tracking-widest">
          — {number} —
        </div>
      )}
    </div>
  );
}

function escape(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
