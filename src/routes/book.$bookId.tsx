import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/app/Shell";
import { EditorSidebar } from "@/components/app/EditorSidebar";
import { ChapterEditor } from "@/components/app/ChapterEditor";
import { PageEditor } from "@/components/app/PageEditor";
import { ManuscriptWorkspace, type WorkspaceTab } from "@/components/app/ManuscriptWorkspace";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db, getSettings, uid, type AppSettings, type BookPageKind, type Chapter } from "@/lib/db";
import { buildTocAnalysis, buildTocHtmlFromChapters } from "@/lib/toc";
import { callLLM } from "@/llm/client";

export const Route = createFileRoute("/book/$bookId")({
  component: BookRouteFrame,
});

function BookRouteFrame() {
  const location = useLocation();
  if (location.pathname.endsWith("/read")) return <Outlet />;
  return (
    <Shell>
      <BookEditor />
    </Shell>
  );
}

type ActiveTarget = { kind: "chapter" | "page"; id: string };

function BookEditor() {
  const { bookId } = Route.useParams();
  const book = useLiveQuery(() => db.books.get(bookId), [bookId]);
  const chapters = useLiveQuery(
    () => db.chapters.where("bookId").equals(bookId).sortBy("index"),
    [bookId],
  );
  const frontPages = useLiveQuery(
    () =>
      db.bookPages
        .where("[bookId+section+index]")
        .between([bookId, "front", -Infinity], [bookId, "front", Infinity])
        .toArray(),
    [bookId],
  );
  const backPages = useLiveQuery(
    () =>
      db.bookPages
        .where("[bookId+section+index]")
        .between([bookId, "back", -Infinity], [bookId, "back", Infinity])
        .toArray(),
    [bookId],
  );

  const [active, setActive] = useState<ActiveTarget | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<"write" | WorkspaceTab>("write");

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!active && chapters?.length) {
      setActive({ kind: "chapter", id: chapters[0].id });
    }
  }, [chapters, active]);

  if (!book || !chapters || !frontPages || !backPages || !settings) {
    return (
      <div className="h-full flex items-center justify-center gap-3 text-muted-foreground bg-background/50 backdrop-blur-sm">
        <Loader2 className="animate-spin h-5 w-5 text-primary" />
        <span className="font-serif italic text-lg">Opening your manuscript...</span>
      </div>
    );
  }

  const currentBook = book;
  const currentChapters = chapters;
  const currentFrontPages = frontPages;
  const currentBackPages = backPages;
  const currentSettings = settings;

  const totalWords = currentChapters.reduce((total, chapter) => total + chapter.wordCount, 0);
  const totalTarget = currentChapters.reduce(
    (total, chapter) => total + (chapter.targetWords ?? currentBook.targetWordsPerChapter),
    0,
  );

  async function renumberChapters(list?: Chapter[]) {
    const chaptersToRenumber =
      list || (await db.chapters.where("bookId").equals(bookId).sortBy("index"));
    await Promise.all(
      chaptersToRenumber.map((chapter, index) => {
        const hasChapterPrefix = /^chapter\s+[\d.]+/i.test(chapter.title);
        const isGeneric =
          /^Chapter\s+\d+$/i.test(chapter.title) ||
          !chapter.title ||
          chapter.title === "Untitled Chapter";

        let title = chapter.title;
        if (isGeneric) title = `Chapter ${index + 1}`;
        else if (hasChapterPrefix)
          title = chapter.title.replace(/^chapter\s+[\d.]+/i, `Chapter ${index + 1}`);

        return db.chapters.update(chapter.id, {
          index,
          title,
          updatedAt: Date.now(),
        });
      }),
    );
  }

  async function addChapter() {
    const index = currentChapters.length;
    const chapterId = uid();
    const timestamp = Date.now();
    await db.chapters.add({
      id: chapterId,
      bookId,
      index,
      title: `Chapter ${index + 1}`,
      synopsis: "",
      content: "<p>Write your story here...</p>",
      status: "draft",
      wordCount: 0,
      targetWords: currentBook.targetWordsPerChapter,
      actualSummary: "",
      revisionState: "drafting",
      lastEditedAt: timestamp,
      updatedAt: timestamp,
    });
    await db.sceneCards.add({
      id: uid(),
      bookId,
      chapterId,
      order: index * 100,
      title: `Scene 1`,
      pov: "",
      purpose: "",
      summary: "",
      location: "",
      timelineNote: "",
      status: "planned",
      targetWords: Math.max(300, Math.round(currentBook.targetWordsPerChapter / 2)),
      actualWords: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await renumberChapters();
    setWorkspaceTab("write");
    setActive({ kind: "chapter", id: chapterId });
    toast.success("New chapter added");
  }

  async function addPage(section: "front" | "back", kind: BookPageKind, label: string) {
    const source = section === "front" ? currentFrontPages : currentBackPages;
    const id = uid();
    await db.bookPages.add({
      id,
      bookId,
      section,
      kind,
      index: source.length,
      title: label,
      content: "",
      updatedAt: Date.now(),
    });
    setWorkspaceTab("write");
    setActive({ kind: "page", id });
    toast.success(`${label} page created`);
  }

  async function regenerateToc(useAi = false) {
    const toc = currentFrontPages.find((page) => page.kind === "toc");
    const chapterContext = currentChapters.map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
      partTitle: chapter.partTitle,
      synopsis: chapter.synopsis,
      actualSummary: chapter.actualSummary,
      content: chapter.content,
    }));
    let html = "";

    if (useAi) {
      const provider = currentSettings.providers[currentSettings.defaultProvider];
      if (!provider?.enabled) {
        toast.error("Enable an AI provider in settings to use AI TOC generation.");
        return;
      }
      toast.info("AI is crafting your table of contents...");
      try {
        const summaries = buildTocAnalysis(chapterContext);
        const result = await callLLM(provider, {
          messages: [
            {
              role: "system",
              content:
                "You are a professional manuscript editor. Build a polished table of contents in HTML from chapter analysis. Return ONLY HTML. Use a root <div class='toc-container p-12 max-w-2xl mx-auto paper-noise'> with an <h1>Contents</h1>, grouped sections by part when available, and one <li> per chapter containing chapter number, title, and a one-sentence summary preview.",
            },
            {
              role: "user",
              content:
                `Book: ${currentBook.title}\n\n` +
                `Chapter analysis:\n${summaries}\n\n` +
                `Keep chapter order unchanged. Do not invent chapters. Use concise summaries.`,
            },
          ],
        });
        html = result.text.replace(/```html\s*|```/g, "").trim();
        const plainText = html.replace(/<[^>]+>/g, "").trim();
        if (!html.startsWith("<div") || plainText.length < 20) {
          html = buildTocHtmlFromChapters(chapterContext, {
            heading: "Contents",
            includeSummary: true,
          });
        }
      } catch (error) {
        toast.error(`AI TOC generation failed: ${(error as Error).message}`);
        return;
      }
    } else {
      html = buildTocHtmlFromChapters(chapterContext, {
        heading: "Contents",
        includeSummary: true,
      });
    }

    if (toc) {
      await db.bookPages.update(toc.id, { content: html, updatedAt: Date.now() });
      setActive({ kind: "page", id: toc.id });
      setWorkspaceTab("write");
    } else {
      const pageId = uid();
      await db.bookPages.add({
        id: pageId,
        bookId,
        section: "front",
        kind: "toc",
        index: currentFrontPages.length,
        title: "Table of Contents",
        content: html,
        updatedAt: Date.now(),
      });
      setActive({ kind: "page", id: pageId });
      setWorkspaceTab("write");
    }

    toast.success(useAi ? "AI table of contents generated" : "Table of contents updated");
  }

  async function deleteChapter(chapterId: string) {
    await Promise.all([
      db.chapters.delete(chapterId),
      db.sceneCards.where("chapterId").equals(chapterId).delete(),
      db.references.where("chapterId").equals(chapterId).delete(),
      db.manuscriptNotes
        .where("bookId")
        .equals(bookId)
        .toArray()
        .then((notes) =>
          Promise.all(
            notes
              .filter((note) => note.chapterId === chapterId)
              .map((note) => db.manuscriptNotes.delete(note.id)),
          ),
        ),
      db.revisionTasks
        .where("bookId")
        .equals(bookId)
        .toArray()
        .then((tasks) =>
          Promise.all(
            tasks
              .filter((task) => task.chapterId === chapterId)
              .map((task) => db.revisionTasks.delete(task.id)),
          ),
        ),
    ]);
    await renumberChapters();
    setActive(null);
    toast.success("Chapter deleted and manuscript re-indexed");
  }

  const workspaceTabs: Array<{
    id: "write" | WorkspaceTab;
    label: string;
    icon?: typeof Sparkles;
  }> = [
    { id: "write", label: "Write" },
    { id: "outline", label: "Outline" },
    { id: "characters", label: "Characters" },
    { id: "research", label: "Research" },
    { id: "revision", label: "Revision" },
  ];

  const activeValue = active ? `${active.kind}:${active.id}` : "";

  function selectActiveTarget(value: string) {
    const [kind, id] = value.split(":") as ["chapter" | "page", string];
    if (!kind || !id) return;
    setWorkspaceTab("write");
    setActive({ kind, id });
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden bg-background md:h-screen">
      <EditorSidebar
        book={currentBook}
        chapters={currentChapters}
        frontPages={currentFrontPages}
        backPages={currentBackPages}
        active={active}
        setActive={(target) => {
          setWorkspaceTab("write");
          setActive(target);
        }}
        addChapter={addChapter}
        addPage={addPage}
        regenerateToc={regenerateToc}
        totalWords={totalWords}
        totalTarget={totalTarget}
      />

      <main className="relative min-w-0 flex-1 overflow-hidden border-border/40 lg:border-l">
        <div className="flex gap-2 overflow-x-auto border-b border-border/40 px-3 py-3 sm:px-5">
          <div className="min-w-52 shrink-0 lg:hidden">
            <Select value={activeValue} onValueChange={selectActiveTarget}>
              <SelectTrigger className="h-8 bg-background/60 text-xs">
                <SelectValue placeholder="Select chapter or page" />
              </SelectTrigger>
              <SelectContent>
                {currentFrontPages.map((page) => (
                  <SelectItem key={page.id} value={`page:${page.id}`}>
                    {page.title}
                  </SelectItem>
                ))}
                {currentChapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={`chapter:${chapter.id}`}>
                    {chapter.index + 1}. {chapter.title || "Untitled Chapter"}
                  </SelectItem>
                ))}
                {currentBackPages.map((page) => (
                  <SelectItem key={page.id} value={`page:${page.id}`}>
                    {page.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex shrink-0 gap-2">
            {workspaceTabs.map((tab) => (
              <Button
                key={tab.id}
                variant={workspaceTab === tab.id ? "default" : "outline"}
                size="sm"
                onClick={() => setWorkspaceTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="h-[calc(100%-57px)] overflow-hidden">
          {workspaceTab === "write" ? (
            active?.kind === "chapter" ? (
              <ChapterEditor
                key={active.id}
                chapterId={active.id}
                bookId={bookId}
                settings={currentSettings}
                onDelete={async () => {
                  if (confirm("Permanently delete this chapter?")) {
                    await deleteChapter(active.id);
                  }
                }}
              />
            ) : active?.kind === "page" ? (
              <PageEditor
                key={active.id}
                pageId={active.id}
                bookId={bookId}
                onDelete={async () => {
                  if (confirm("Permanently delete this page?")) {
                    await db.bookPages.delete(active.id);
                    setActive(null);
                  }
                }}
              />
            ) : (
              <div className="h-full grid place-items-center text-muted-foreground animate-fade-in-up">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 mx-auto mb-4 opacity-20" />
                  <p className="font-serif italic text-xl">
                    Select a chapter or page to continue your story.
                  </p>
                </div>
              </div>
            )
          ) : (
            <ManuscriptWorkspace
              tab={workspaceTab}
              book={currentBook}
              bookId={bookId}
              chapters={currentChapters}
              onOpenChapter={(chapterId) => {
                setWorkspaceTab("write");
                setActive({ kind: "chapter", id: chapterId });
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
