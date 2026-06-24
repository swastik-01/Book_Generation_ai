import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { BookMarked, BookOpen, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/app/Shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db, getSettings, uid, wordCount, type Book } from "@/lib/db";
import { splitManuscript } from "@/lib/import";
import { createSceneCardsFromChapters } from "@/lib/manuscript";
import { SYS_NOVELIST } from "@/lib/prompts";
import { buildTocHtmlFromChapters } from "@/lib/toc";
import { callLLM } from "@/llm/client";

export const Route = createFileRoute("/")({
  component: () => (
    <Shell>
      <Library />
    </Shell>
  ),
});

function Library() {
  const books = useLiveQuery(() => db.books.orderBy("updatedAt").reverse().toArray(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);

  async function handleImport(file: File) {
    setImporting(true);
    const extension = file.name.split(".").pop()?.toLowerCase();
    let raw = "";

    try {
      if (extension === "docx") {
        const mammoth = await import("mammoth/mammoth.browser" as never);
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        raw = result.value;
      } else {
        raw = await file.text();
      }
    } catch (error) {
      toast.error(`Could not read file: ${(error as Error).message}`);
      setImporting(false);
      return;
    }

    const parsed = splitManuscript(raw);
    if (!parsed.chapters.length) {
      toast.error("No content found in file.");
      setImporting(false);
      return;
    }

    const fileTitle = file.name.replace(/\.[^.]+$/, "");
    let aiTitle = fileTitle;
    let coverPrompt: string | undefined;
    let coverDataUrl: string | undefined;

    try {
      const settings = await getSettings();
      const provider = settings.providers[settings.defaultProvider];
      if (provider?.enabled) {
        toast.info("Asking AI to suggest a title and cover...");
        const sample = raw.replace(/\s+/g, " ").slice(0, 4000);
        const result = await callLLM(provider, {
          messages: [
            { role: "system", content: SYS_NOVELIST },
            {
              role: "user",
              content:
                `You are given the opening of an unnamed manuscript. Return ONLY a JSON object (no markdown):\n` +
                `{"title":"Suggested book title","coverPrompt":"One vivid sentence describing the cover art - mood, palette, key imagery."}\n\n` +
                `Manuscript opening:\n"""${sample}"""`,
            },
          ],
        });
        const parsedJson = safeJson(result.text) as { title?: string; coverPrompt?: string } | null;
        if (parsedJson?.title) aiTitle = parsedJson.title.trim().replace(/^["']|["']$/g, "");
        if (parsedJson?.coverPrompt) coverPrompt = parsedJson.coverPrompt.trim();
        if (coverPrompt) coverDataUrl = makeCoverSvg(aiTitle, coverPrompt);
      }
    } catch {
      /* keep filename as title */
    }

    const bookId = uid();
    const now = Date.now();
    const book: Book = {
      id: bookId,
      title: aiTitle,
      genre: [],
      targetChapters: parsed.chapters.length,
      targetWordsPerChapter: 2500,
      coverDataUrl,
      themes: [],
      compTitles: [],
      createdAt: now,
      updatedAt: now,
    };

    const chapterRecords = parsed.chapters.map((chapter, index) => ({
      id: uid(),
      bookId,
      index,
      partTitle: chapter.partTitle,
      title: chapter.title,
      synopsis: "",
      content: chapter.content,
      status: "draft" as const,
      wordCount: wordCount(chapter.content),
      actualSummary: "",
      revisionState: "drafting" as const,
      lastEditedAt: now,
      updatedAt: now,
    }));

    await db.books.add(book);
    await db.chapters.bulkAdd(chapterRecords);
    await db.sceneCards.bulkAdd(createSceneCardsFromChapters(chapterRecords, now));

    const importedToc = parsed.frontMatter.find((page) => page.kind === "toc");
    const importedFrontMatter = parsed.frontMatter.filter((page) => page.kind !== "toc");
    const seededFrontMatter = [
      importedToc
        ? {
            id: uid(),
            bookId,
            section: "front" as const,
            kind: "toc" as const,
            index: 0,
            title: importedToc.title || "Table of Contents",
            content: importedToc.content,
            updatedAt: now,
          }
        : {
            id: uid(),
            bookId,
            section: "front" as const,
            kind: "toc" as const,
            index: 0,
            title: "Table of Contents",
            content: buildTocHtmlFromChapters(
              chapterRecords.map((chapter) => ({
                index: chapter.index,
                title: chapter.title,
                partTitle: chapter.partTitle,
                content: chapter.content,
              })),
              { heading: "Contents", includeSummary: true },
            ),
            updatedAt: now,
          },
      ...importedFrontMatter.map((page, index) => ({
        id: uid(),
        bookId,
        section: "front" as const,
        kind: "custom" as const,
        index: index + 1,
        title: page.title || `Imported Front Matter ${index + 1}`,
        content: page.content,
        updatedAt: now,
      })),
    ];

    if (seededFrontMatter.length) {
      await db.bookPages.bulkAdd(seededFrontMatter);
    }

    toast.success(`Imported "${book.title}" with ${parsed.chapters.length} chapters`);
    if (importedToc) toast.message("Imported table of contents was placed in your TOC page.");
    else toast.message("No TOC found. We generated one from chapter analysis.");
    setImporting(false);
    navigate({ to: "/book/$bookId", params: { bookId } });
  }

  return (
    <div className="relative mx-auto w-full max-w-7xl overflow-hidden px-4 py-6 sm:px-8 sm:py-10">
      <div className="pointer-events-none absolute inset-x-4 top-4 h-44 rounded-3xl bg-gradient-to-r from-primary/10 via-accent/15 to-primary/5 blur-2xl sm:inset-x-8" />
      <header className="relative mb-8 flex flex-col gap-5 rounded-2xl border border-border/40 bg-card/70 px-4 py-6 shadow-sm backdrop-blur-md animate-fade-in-up sm:mb-12 sm:rounded-3xl sm:px-6 sm:py-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-serif text-5xl leading-none tracking-tight text-foreground sm:text-6xl">
            Library
          </h1>
          <p className="mt-3 font-serif text-base italic text-muted-foreground sm:text-lg">
            "A reader lives a thousand lives before he dies..."
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.docx"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleImport(file);
              event.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="lg"
            className="glass w-full min-w-0 border-primary/25 text-center shadow-sm hover:border-primary/40 sm:w-auto"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {importing ? "Importing..." : "Import manuscript"}
          </Button>
          <Button
            size="lg"
            className="w-full min-w-0 text-center shadow-lg shadow-primary/20 sm:w-auto"
            asChild
          >
            <Link to="/new">
              <Sparkles className="h-4 w-4 mr-2" /> Start new book
            </Link>
          </Button>
        </div>
      </header>

      {!books?.length ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
          <NewCard />
        </div>
      )}
    </div>
  );
}

function BookCard({ book }: { book: Book }) {
  const chapters = useLiveQuery(
    () => db.chapters.where("bookId").equals(book.id).toArray(),
    [book.id],
  );
  const totalWords = chapters?.reduce((total, chapter) => total + chapter.wordCount, 0) ?? 0;
  const target = book.targetChapters * book.targetWordsPerChapter;
  const pct = target ? Math.min(100, Math.round((totalWords / target) * 100)) : 0;
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");

  async function deleteBook() {
    await Promise.all([
      db.chapters.where("bookId").equals(book.id).delete(),
      db.bookPages.where("bookId").equals(book.id).delete(),
      db.bookAssets.where("bookId").equals(book.id).delete(),
      db.references.where("bookId").equals(book.id).delete(),
      db.characterProfiles.where("bookId").equals(book.id).delete(),
      db.sceneCards.where("bookId").equals(book.id).delete(),
      db.manuscriptNotes.where("bookId").equals(book.id).delete(),
      db.revisionTasks.where("bookId").equals(book.id).delete(),
    ]);
    await db.books.delete(book.id);
    toast.success(`Deleted "${book.title}"`);
    setStep(0);
    setConfirmText("");
  }

  return (
    <div className="relative group animate-fade-in-up">
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <Link
          to="/book/$bookId/read"
          params={{ bookId: book.id }}
          onClick={(event) => event.stopPropagation()}
          className="p-1.5 rounded-md bg-background/80 backdrop-blur hover:bg-primary hover:text-primary-foreground transition"
          title="Read book"
        >
          <BookMarked className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setStep(1);
          }}
          className="p-1.5 rounded-md bg-background/80 backdrop-blur hover:bg-destructive hover:text-destructive-foreground transition"
          title="Delete book"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Link to="/book/$bookId" params={{ bookId: book.id }}>
        <Card className="overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all border-border/60 bg-card/90 hover:border-primary/40">
          <div className="aspect-[3/4] bg-gradient-to-br from-secondary/95 to-accent/35 flex items-center justify-center p-6 relative">
            {book.coverDataUrl ? (
              <img
                src={book.coverDataUrl}
                alt={book.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center">
                <BookOpen className="h-10 w-10 mx-auto text-primary/60 mb-3" />
                <div className="font-serif text-xl text-primary leading-tight">{book.title}</div>
              </div>
            )}
          </div>
          <div className="p-4">
            <div className="font-serif text-lg leading-tight truncate">{book.title}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {book.genre.join(", ") || "-"} - {chapters?.length ?? 0} ch -{" "}
              {totalWords.toLocaleString()} words
            </div>
            <div className="mt-3 h-1 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </Card>
      </Link>

      <AlertDialog open={step === 1} onOpenChange={(open) => !open && setStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{book.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the book, all chapters, scenes, front/back pages, assets, notes, tasks,
              and references. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setStep(2);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={step === 2}
        onOpenChange={(open) => {
          if (!open) {
            setStep(0);
            setConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Type the title to confirm</AlertDialogTitle>
            <AlertDialogDescription>
              Type <strong>{book.title}</strong> exactly to permanently delete this book.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={book.title}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== book.title}
              onClick={(event) => {
                event.preventDefault();
                void deleteBook();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewCard() {
  return (
    <Link to="/new" className="animate-fade-in-up">
      <Card className="aspect-[3/4.4] border-dashed border-2 flex flex-col items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors">
        <Plus className="h-10 w-10 mb-2" />
        <span className="font-serif text-lg">Start a new book</span>
      </Card>
    </Link>
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* ignore */
  }
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* ignore */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function makeCoverSvg(title: string, prompt: string): string {
  const safeTitle = escapeXml(title).slice(0, 80);
  const safeBlurb = escapeXml(prompt).slice(0, 140);
  const palettes = [
    ["#3a2a1f", "#8b7355", "#c9b99a", "#faf8f5"],
    ["#1f2a3a", "#3a5470", "#a8b8c8", "#f0ebe3"],
    ["#2d1f1a", "#7a3a2a", "#d4a574", "#faf6ef"],
    ["#1a2a22", "#3a5a40", "#a8c098", "#f5f2ea"],
  ];
  const seed = Array.from(safeTitle).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
  const [bg, mid, fg, ink] = palettes[seed % palettes.length];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${mid}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="800" fill="url(#g)"/>
  <rect x="40" y="40" width="520" height="720" fill="none" stroke="${fg}" stroke-width="2" opacity="0.5"/>
  <text x="300" y="380" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="44" font-weight="600">
    <tspan x="300" dy="0">${wrapLine(safeTitle, 0)}</tspan>
    <tspan x="300" dy="52">${wrapLine(safeTitle, 1)}</tspan>
    <tspan x="300" dy="52">${wrapLine(safeTitle, 2)}</tspan>
  </text>
  <text x="300" y="640" text-anchor="middle" fill="${ink}" font-family="Georgia, serif" font-size="14" font-style="italic" opacity="0.75">
    <tspan x="300" dy="0">${wrapLine(safeBlurb, 0, 50)}</tspan>
    <tspan x="300" dy="20">${wrapLine(safeBlurb, 1, 50)}</tspan>
  </text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function wrapLine(text: string, line: number, perLine = 18): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > perLine) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines[line] || "";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function EmptyState() {
  return (
    <Card className="overflow-hidden border-dashed p-6 text-center sm:p-16">
      <BookOpen className="h-12 w-12 mx-auto text-primary/40" />
      <h2 className="mt-4 font-serif text-2xl sm:text-3xl">Your shelf is empty</h2>
      <p className="mx-auto mt-2 max-w-[28rem] px-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
        Generate a complete book from a premise, or import an existing manuscript and edit with AI.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 px-2 sm:flex-row sm:px-0">
        <Button className="w-full sm:w-auto" asChild>
          <Link to="/new">
            <Sparkles className="h-4 w-4 mr-2" /> Generate a book
          </Link>
        </Button>
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link to="/settings/ai">Configure AI providers</Link>
        </Button>
      </div>
    </Card>
  );
}
