import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Image from "@tiptap/extension-image";
import { useLiveQuery } from "dexie-react-hooks";
import { ImageIcon as ImageIconIcon, Loader2, Quote, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  db,
  uid,
  wordCount,
  type AppSettings,
  type Book,
  type Chapter,
  type ChapterStatus,
  type RevisionTaskSeverity,
  type RevisionTaskSource,
  type SceneCard,
} from "@/lib/db";
import { buildRevisionTask, loadChapterManuscriptContext } from "@/lib/manuscript";
import { callLLM, streamLLM } from "@/llm/client";
import {
  SYS_NOVELIST,
  chapterSummaryPrompt,
  continuePrompt,
  continuityPassPrompt,
  developmentalEditPrompt,
  lineEditPrompt,
  revisionTasksPrompt,
  rewritePrompt,
  sceneBeatPrompt,
} from "@/lib/prompts";
import { deleteReference } from "@/lib/references";
import { ReferenceMark } from "@/lib/reference-mark";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AiPanel } from "./AiPanel";
import { ImageInsertDialog } from "./ImageInsertDialog";
import { ReferenceDialog } from "./ReferenceDialog";

interface ChapterEditorProps {
  chapterId: string;
  bookId: string;
  settings: AppSettings;
  onDelete: () => void;
}

type StructuredAnalysis = {
  summary: string;
  findings: Array<{ title: string; details: string; severity?: RevisionTaskSeverity }>;
};

export function ChapterEditor({ chapterId, bookId, settings, onDelete }: ChapterEditorProps) {
  const chapter = useLiveQuery(() => db.chapters.get(chapterId), [chapterId]);
  const book = useLiveQuery(() => db.books.get(bookId), [bookId]);

  if (!chapter || !book) return null;

  return (
    <ChapterInner
      chapter={chapter}
      book={book}
      settings={settings}
      bookId={bookId}
      onDelete={onDelete}
    />
  );
}

function ChapterInner({
  chapter,
  book,
  settings,
  bookId,
  onDelete,
}: {
  chapter: Chapter;
  book: Book;
  settings: AppSettings;
  bookId: string;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [synopsis, setSynopsis] = useState(chapter.synopsis || "");
  const [target, setTarget] = useState<number>(chapter.targetWords ?? book.targetWordsPerChapter);
  const [busy, setBusy] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState("");
  const [canInsertOutput, setCanInsertOutput] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteInstr, setRewriteInstr] = useState("Tighten and improve flow");
  const [imgDialog, setImgDialog] = useState(false);
  const [refDialog, setRefDialog] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);

  const [providerOverride, setProviderOverrideState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("quill.lastProvider");
      if (saved && saved in settings.providers) return saved;
    }
    return settings.defaultProvider;
  });

  const chapterScenes = useLiveQuery(
    () => db.sceneCards.where("chapterId").equals(chapter.id).sortBy("order"),
    [chapter.id],
  );
  const chapterRefs = useLiveQuery(
    () =>
      db.references
        .where("bookId")
        .equals(bookId)
        .toArray()
        .then((references) => references.filter((reference) => reference.chapterId === chapter.id)),
    [bookId, chapter.id],
  );

  useEffect(() => {
    setTitle(chapter.title);
    setSynopsis(chapter.synopsis || "");
    setTarget(chapter.targetWords ?? book.targetWordsPerChapter);
    setAiOutput("");
    setCanInsertOutput(false);
    setChatMessages([]);
  }, [
    chapter.id,
    chapter.title,
    chapter.synopsis,
    chapter.targetWords,
    book.targetWordsPerChapter,
  ]);

  useEffect(() => {
    if (!chapterScenes?.length) {
      setActiveSceneId(null);
      return;
    }
    if (!activeSceneId || !chapterScenes.some((scene) => scene.id === activeSceneId)) {
      setActiveSceneId(chapterScenes[0].id);
    }
  }, [chapterScenes, activeSceneId]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: "The story begins here..." }),
        CharacterCount.configure(),
        Image.configure({ inline: false, allowBase64: true }),
        ReferenceMark,
      ],
      content: chapter.content || "",
      onUpdate: ({ editor: activeEditor }) => {
        const html = activeEditor.getHTML();
        void db.chapters.update(chapter.id, {
          content: html,
          wordCount: wordCount(html),
          lastEditedAt: Date.now(),
          updatedAt: Date.now(),
        });
      },
    },
    [chapter.id],
  );

  const provider = settings.providers[providerOverride as keyof typeof settings.providers];
  const ready = provider?.enabled;
  const activeScene = chapterScenes?.find((scene) => scene.id === activeSceneId) || null;
  const charCount = editor?.storage.characterCount?.characters() || 0;
  const wcLive = useMemo(
    () => wordCount(editor?.getHTML() || chapter.content),
    [editor, chapter.content],
  );
  const targetWords = chapter.targetWords ?? book.targetWordsPerChapter;
  const pct = targetWords ? Math.min(100, Math.round((wcLive / targetWords) * 100)) : 0;

  function setProviderOverride(value: string) {
    setProviderOverrideState(value);
    try {
      window.localStorage.setItem("quill.lastProvider", value);
    } catch {
      /* ignore */
    }
  }

  async function saveMeta() {
    await db.chapters.update(chapter.id, {
      title,
      synopsis,
      targetWords: target,
      updatedAt: Date.now(),
    });
  }

  async function setStatus(status: ChapterStatus) {
    await db.chapters.update(chapter.id, {
      status,
      revisionState:
        status === "final" ? "polished" : status === "edited" ? "revising" : "drafting",
      updatedAt: Date.now(),
    });
  }

  async function gatherContext() {
    const context = await loadChapterManuscriptContext(bookId, chapter, activeSceneId || undefined);
    return {
      characters: context.characters,
      scenes: context.chapterScenes,
      notes: context.scopedNotes,
      revisionTasks: context.openTasks,
      recentChapters: context.recentChapters,
      activeScene: context.activeScene,
    };
  }

  async function continueWriting() {
    if (!ready || !editor) return;
    setBusy("continue");
    setCanInsertOutput(false);
    try {
      const context = await gatherContext();
      const existingText = editor.getText();
      let streamed = "";
      await streamLLM(
        provider,
        {
          messages: [
            { role: "system", content: SYS_NOVELIST },
            { role: "user", content: continuePrompt(book, chapter, existingText, context) },
          ],
        },
        (chunk) => {
          streamed += chunk;
        },
      );

      const paragraphs = streamed
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
      if (paragraphs.length) {
        const html = paragraphs
          .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
          .join("");
        editor.chain().focus("end").insertContent(html).run();
      }
      const html = editor.getHTML();
      await db.chapters.update(chapter.id, {
        content: html,
        wordCount: wordCount(html),
        lastEditedAt: Date.now(),
        updatedAt: Date.now(),
      });
      setAiOutput("Continued the chapter directly in the editor.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rewrite() {
    if (!ready) return;
    const text =
      rewriteText ||
      (editor?.state.selection.empty ? editor?.getText() : window.getSelection()?.toString()) ||
      "";
    if (!text.trim()) {
      toast.error("Select text in the editor or paste it into the rewrite box first.");
      return;
    }
    setBusy("rewrite");
    setAiOutput("");
    setCanInsertOutput(true);
    try {
      const context = await gatherContext();
      await streamLLM(
        provider,
        {
          messages: [
            { role: "system", content: SYS_NOVELIST },
            { role: "user", content: rewritePrompt(text, rewriteInstr, book, context) },
          ],
        },
        (chunk) => setAiOutput((previous) => previous + chunk),
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function buildSceneBeats() {
    if (!ready) return;
    setBusy("scene-beats");
    setAiOutput("");
    setCanInsertOutput(false);
    try {
      const context = await gatherContext();
      const result = await callLLM(provider, {
        messages: [
          { role: "system", content: SYS_NOVELIST },
          { role: "user", content: sceneBeatPrompt(book, chapter, context) },
        ],
      });
      const parsed = extractJsonArray(result.text);
      if (!parsed.length) throw new Error("The scene beat response could not be parsed.");

      const existing = chapterScenes || [];
      await Promise.all(existing.map((scene) => db.sceneCards.delete(scene.id)));
      const timestamp = Date.now();
      const created = parsed.map((item, index) => ({
        id: uid(),
        bookId,
        chapterId: chapter.id,
        order: index * 100,
        title: String(item.title || `Scene ${index + 1}`),
        pov: String(item.pov || ""),
        purpose: String(item.purpose || ""),
        summary: String(item.summary || ""),
        location: String(item.location || ""),
        timelineNote: String(item.timelineNote || ""),
        status: "planned" as const,
        targetWords: Math.max(
          100,
          Number(item.targetWords) || Math.round(targetWords / Math.max(parsed.length, 1)),
        ),
        actualWords: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      await db.sceneCards.bulkAdd(created);
      setActiveSceneId(created[0]?.id || null);
      setAiOutput(
        created
          .map(
            (scene, index) =>
              `${index + 1}. ${scene.title}\n${scene.summary || scene.purpose || "No summary provided."}`,
          )
          .join("\n\n"),
      );
      toast.success(`Built ${created.length} scene beats.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runStructuredAnalysis(
    busyKey: string,
    source: RevisionTaskSource,
    buildPrompt: (context: Awaited<ReturnType<typeof gatherContext>>) => string,
  ) {
    if (!ready || !editor) return;
    setBusy(busyKey);
    setAiOutput("");
    setCanInsertOutput(false);
    try {
      const context = await gatherContext();
      const result = await callLLM(provider, {
        messages: [
          { role: "system", content: SYS_NOVELIST },
          { role: "user", content: buildPrompt(context) },
        ],
      });
      const parsed = extractStructuredAnalysis(result.text);
      if (!parsed) throw new Error("The analysis result could not be parsed.");
      setAiOutput(formatStructuredAnalysis(parsed));
      await persistRevisionTasks(parsed, source);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function continuityPass() {
    await runStructuredAnalysis("continuity", "continuity-pass", (context) =>
      continuityPassPrompt(book, chapter, editor?.getText() || "", context),
    );
  }

  async function developmentalEdit() {
    await runStructuredAnalysis("developmental", "developmental-edit", (context) =>
      developmentalEditPrompt(book, chapter, editor?.getText() || "", context),
    );
  }

  async function lineEdit() {
    await runStructuredAnalysis("line-edit", "line-edit", (context) =>
      lineEditPrompt(book, chapter, editor?.getText() || "", context),
    );
  }

  async function summarizeChapter() {
    if (!ready || !editor) return;
    setBusy("summarize");
    setAiOutput("");
    setCanInsertOutput(false);
    try {
      const context = await gatherContext();
      const result = await callLLM(provider, {
        messages: [
          { role: "system", content: SYS_NOVELIST },
          { role: "user", content: chapterSummaryPrompt(book, chapter, editor.getText(), context) },
        ],
        maxTokens: 300,
      });
      const summary = result.text.trim();
      await db.chapters.update(chapter.id, {
        actualSummary: summary,
        updatedAt: Date.now(),
      });
      if (activeScene) {
        await db.sceneCards.update(activeScene.id, {
          summary,
          updatedAt: Date.now(),
        });
      }
      setAiOutput(summary);
      toast.success("Chapter summary updated.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createRevisionTasks() {
    if (!ready || !editor) return;
    setBusy("revision-tasks");
    setAiOutput("");
    setCanInsertOutput(false);
    try {
      const context = await gatherContext();
      const result = await callLLM(provider, {
        messages: [
          { role: "system", content: SYS_NOVELIST },
          { role: "user", content: revisionTasksPrompt(book, chapter, editor.getText(), context) },
        ],
      });
      const parsed = extractJsonArray(result.text);
      if (!parsed.length) throw new Error("The revision task response could not be parsed.");
      const created = parsed
        .map((item) =>
          buildRevisionTask({
            bookId,
            chapterId: chapter.id,
            sceneId: activeScene?.id,
            title: String(item.title || "").trim(),
            details: String(item.details || "").trim(),
            severity: normalizeSeverity(String(item.severity || "medium")),
            source: "ai-critique",
          }),
        )
        .filter((task) => task.title && task.details);
      if (!created.length) throw new Error("No usable revision tasks were returned.");
      await db.revisionTasks.bulkAdd(created);
      setAiOutput(
        created
          .map((task, index) => `${index + 1}. [${task.severity}] ${task.title}\n${task.details}`)
          .join("\n\n"),
      );
      toast.success(`Created ${created.length} revision tasks.`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function chatSend() {
    if (!ready || !chatInput.trim()) return;
    const message = chatInput.trim();
    setChatInput("");
    setChatMessages((current) => [
      ...current,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    setBusy("chat");
    try {
      const context = await gatherContext();
      await streamLLM(
        provider,
        {
          messages: [
            {
              role: "system",
              content:
                `${SYS_NOVELIST}\n\n` +
                `You are helping the author with Chapter ${chapter.index + 1}: "${chapter.title}".\n` +
                `Current chapter text:\n${(editor?.getText() || "").slice(0, 6000)}\n\n` +
                `Scene focus: ${context.activeScene?.title || "No active scene selected."}\n` +
                `Open tasks: ${context.revisionTasks?.length || 0}\n` +
                `Use the manuscript context to answer concisely and practically.`,
            },
            ...chatMessages,
            { role: "user", content: message },
          ],
        },
        (chunk) =>
          setChatMessages((current) => {
            const copy = [...current];
            copy[copy.length - 1] = {
              role: "assistant",
              content: copy[copy.length - 1].content + chunk,
            };
            return copy;
          }),
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function insertAiOutput() {
    if (!editor || !aiOutput || !canInsertOutput) return;
    editor
      .chain()
      .focus()
      .insertContent(`<p>${aiOutput.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>")}</p>`)
      .run();
    setAiOutput("");
    setCanInsertOutput(false);
  }

  function insertImageDataUrl(dataUrl: string) {
    editor?.chain().focus().setImage({ src: dataUrl }).run();
  }

  function insertReferenceMarker(refId: string, label: string, kind: "footnote" | "endnote") {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "text",
        text: `[${label}]`,
        marks: [{ type: "referenceMark", attrs: { refId, label, kind } }],
      })
      .run();
  }

  async function persistRevisionTasks(parsed: StructuredAnalysis, source: RevisionTaskSource) {
    const findings = parsed.findings
      .map((finding) =>
        buildRevisionTask({
          bookId,
          chapterId: chapter.id,
          sceneId: activeScene?.id,
          title: finding.title,
          details: finding.details,
          severity: normalizeSeverity(finding.severity || "medium"),
          source,
        }),
      )
      .filter((task) => task.title && task.details);
    if (findings.length) {
      await db.revisionTasks.bulkAdd(findings);
      toast.success(`Created ${findings.length} revision tasks.`);
    }
  }

  async function addSceneFromPanel() {
    const lastOrder = chapterScenes?.[chapterScenes.length - 1]?.order ?? chapter.index * 100;
    const timestamp = Date.now();
    const newSceneId = uid();
    await db.sceneCards.add({
      id: newSceneId,
      bookId,
      chapterId: chapter.id,
      order: lastOrder + 100,
      title: `Scene ${(chapterScenes?.length || 0) + 1}`,
      pov: "",
      purpose: "",
      summary: "",
      location: "",
      timelineNote: "",
      status: "planned",
      targetWords: Math.max(
        300,
        Math.round((chapter.targetWords || 1200) / Math.max((chapterScenes?.length || 0) + 1, 1)),
      ),
      actualWords: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setActiveSceneId(newSceneId);
  }

  async function deleteSceneFromPanel(sceneId: string) {
    await db.sceneCards.delete(sceneId);
    if (activeSceneId === sceneId) {
      const fallback = (chapterScenes || []).find((scene) => scene.id !== sceneId);
      setActiveSceneId(fallback?.id || null);
    }
  }

  function updateSceneFromPanel(sceneId: string, patch: Partial<SceneCard>) {
    void db.sceneCards.update(sceneId, {
      ...patch,
      updatedAt: Date.now(),
    });
  }

  return (
    <div className="flex h-full overflow-hidden animate-fade-in-up">
      <div className="flex-1 min-w-0 flex overflow-hidden">
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-10">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold bg-secondary/30 px-2.5 py-1 rounded-md">
                Chapter {chapter.index + 1}
              </span>
              <div className="flex-1" />

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-background/50 border border-border/40 rounded-md px-2 py-1">
                  <Label className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">
                    Goal
                  </Label>
                  <Input
                    type="number"
                    value={target}
                    min={100}
                    step={100}
                    onChange={(event) => setTarget(Math.max(100, Number(event.target.value) || 0))}
                    onBlur={saveMeta}
                    className="w-16 h-6 text-[11px] border-0 focus-visible:ring-0 p-0 text-center font-mono"
                  />
                </div>

                <Select
                  value={chapter.status}
                  onValueChange={(value) => void setStatus(value as ChapterStatus)}
                >
                  <SelectTrigger className="w-24 h-8 text-[11px] font-medium bg-background/50 border-border/40 capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="edited">Edited</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1 bg-background/50 border border-border/40 rounded-md p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setImgDialog(true)}
                    title="Insert image"
                  >
                    <ImageIconIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setRefDialog(true)}
                    title="Insert reference"
                  >
                    <Quote className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:text-destructive hover:bg-destructive/5"
                    onClick={onDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={saveMeta}
              placeholder="Untitled Chapter"
              className="font-serif text-5xl border-0 px-0 focus-visible:ring-0 shadow-none h-auto py-1 mb-3 bg-transparent tracking-tight font-semibold"
            />

            <Textarea
              value={synopsis}
              onChange={(event) => setSynopsis(event.target.value)}
              onBlur={saveMeta}
              placeholder="Write a brief synopsis of this chapter..."
              rows={2}
              className="border-0 px-0 focus-visible:ring-0 shadow-none resize-none italic text-muted-foreground/80 bg-transparent text-sm leading-relaxed mb-6"
            />

            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5 text-primary/60" /> {wcLive.toLocaleString()} /{" "}
                  {targetWords.toLocaleString()} words
                </span>
                <span>{charCount.toLocaleString()} chars</span>
                <span className={cn(pct >= 100 ? "text-emerald-500" : "text-primary/60")}>
                  {pct}%
                </span>
              </div>
              <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all duration-700",
                    pct >= 100 ? "bg-emerald-500" : "bg-primary",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card/50 p-4 mb-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Manuscript summary
                  </div>
                  <p className="text-sm mt-2 text-foreground/90">
                    {chapter.actualSummary ||
                      "No chapter summary yet. Run Summarize chapter from the AI panel."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!ready || !!busy}
                  onClick={summarizeChapter}
                >
                  {busy === "summarize" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Refresh summary
                </Button>
              </div>
            </div>

            <div className="prose-container min-h-[60vh] mt-6">
              <EditorContent editor={editor} />
            </div>

            <ChapterReferencesFooter refs={chapterRefs || []} />
          </div>
        </div>
      </div>

      <AiPanel
        settings={settings}
        providerOverride={providerOverride}
        setProviderOverride={setProviderOverride}
        ready={ready}
        busy={busy}
        onContinue={continueWriting}
        onBuildSceneBeats={buildSceneBeats}
        onRewrite={rewrite}
        onContinuityPass={continuityPass}
        onDevelopmentalEdit={developmentalEdit}
        onLineEdit={lineEdit}
        onSummarizeChapter={summarizeChapter}
        onCreateRevisionTasks={createRevisionTasks}
        onChat={chatSend}
        rewriteText={rewriteText}
        setRewriteText={setRewriteText}
        rewriteInstr={rewriteInstr}
        setRewriteInstr={setRewriteInstr}
        chatMessages={chatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        aiOutput={aiOutput}
        canInsert={canInsertOutput}
        onInsert={insertAiOutput}
        chapterScenes={chapterScenes || []}
        activeSceneId={activeSceneId}
        setActiveSceneId={setActiveSceneId}
        onAddScene={addSceneFromPanel}
        onDeleteScene={deleteSceneFromPanel}
        onUpdateScene={updateSceneFromPanel}
      />

      <ImageInsertDialog
        open={imgDialog}
        onOpenChange={setImgDialog}
        bookId={bookId}
        provider={provider}
        editor={editor || null}
        onInsert={(dataUrl) => {
          insertImageDataUrl(dataUrl);
          setImgDialog(false);
        }}
      />

      <ReferenceDialog
        open={refDialog}
        onOpenChange={setRefDialog}
        bookId={bookId}
        chapterId={chapter.id}
        provider={provider}
        onInserted={(refId, label, kind) => {
          insertReferenceMarker(refId, label, kind);
          setRefDialog(false);
        }}
      />
    </div>
  );
}

function escapeHtml(value: string) {
  return (value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractJsonArray(text: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    /* ignore */
  }
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    /* ignore */
  }
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      /* ignore */
    }
  }
  return [];
}

function extractStructuredAnalysis(text: string): StructuredAnalysis | null {
  try {
    return normalizeStructuredAnalysis(JSON.parse(text));
  } catch {
    /* ignore */
  }
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  try {
    return normalizeStructuredAnalysis(JSON.parse(cleaned));
  } catch {
    /* ignore */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return normalizeStructuredAnalysis(JSON.parse(match[0]));
    } catch {
      /* ignore */
    }
  }
  return null;
}

function normalizeStructuredAnalysis(input: unknown): StructuredAnalysis | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as {
    summary?: unknown;
    findings?: Array<{ title?: unknown; details?: unknown; severity?: unknown }>;
  };
  return {
    summary: String(candidate.summary || ""),
    findings: Array.isArray(candidate.findings)
      ? candidate.findings
          .map((finding) => ({
            title: String(finding.title || "").trim(),
            details: String(finding.details || "").trim(),
            severity: normalizeSeverity(String(finding.severity || "medium")),
          }))
          .filter((finding) => finding.title && finding.details)
      : [],
  };
}

function normalizeSeverity(value: string): RevisionTaskSeverity {
  if (value === "high") return "high";
  if (value === "low") return "low";
  return "medium";
}

function formatStructuredAnalysis(parsed: StructuredAnalysis) {
  const findings = parsed.findings.length
    ? parsed.findings
        .map(
          (finding, index) =>
            `${index + 1}. [${finding.severity}] ${finding.title}\n${finding.details}`,
        )
        .join("\n\n")
    : "No structured findings returned.";
  return `${parsed.summary || "No summary provided."}\n\n${findings}`.trim();
}

function ChapterReferencesFooter({
  refs,
}: {
  refs: Array<{
    id: string;
    label: string;
    citation: string;
    url?: string;
    kind: "footnote" | "endnote";
  }>;
}) {
  const footnotes = refs.filter((ref) => ref.kind === "footnote");
  const endnotes = refs.filter((ref) => ref.kind === "endnote");

  if (!footnotes.length && !endnotes.length) return null;

  return (
    <div className="mt-20 pt-8 border-t border-border/40 text-sm space-y-6 animate-fade-in-up pb-20">
      {footnotes.length > 0 && (
        <div className="space-y-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold border-l-2 border-primary/40 pl-3">
            Footnotes
          </div>
          <ol className="space-y-3 pl-1">
            {footnotes.map((ref) => (
              <li
                key={ref.id}
                className="font-serif leading-relaxed text-foreground/80 flex items-start gap-2"
              >
                <span className="text-[10px] font-bold text-primary/60 mt-1 min-w-[20px]">
                  [{ref.label}]
                </span>
                <div className="flex-1">
                  {ref.citation}
                  {ref.url ? (
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 underline text-primary/60 hover:text-primary transition-colors truncate block text-xs mt-1"
                    >
                      {ref.url}
                    </a>
                  ) : null}
                </div>
                <button
                  className="ml-2 text-muted-foreground hover:text-destructive transition-colors p-1"
                  onClick={() => deleteReference(ref.id)}
                  title="Delete reference"
                >
                  x
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {endnotes.length > 0 && (
        <div className="space-y-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold border-l-2 border-accent/40 pl-3">
            Endnotes
          </div>
          <ol className="space-y-3 pl-1 text-muted-foreground/80">
            {endnotes.map((ref) => (
              <li key={ref.id} className="font-serif leading-relaxed flex items-start gap-2">
                <span className="text-[10px] font-bold opacity-60 mt-1 min-w-[20px]">
                  [{ref.label}]
                </span>
                <div className="flex-1">{ref.citation}</div>
                <button
                  className="ml-2 hover:text-destructive transition-colors p-1"
                  onClick={() => deleteReference(ref.id)}
                  title="Delete reference"
                >
                  x
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
