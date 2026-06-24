import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell } from "@/components/app/Shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  db,
  getSettings,
  uid,
  wordCount,
  type AppSettings,
  type Book,
  type BookPage,
  type Chapter,
} from "@/lib/db";
import { createCharacterProfiles, createSceneCardsFromChapters } from "@/lib/manuscript";
import { streamLLM, callLLM } from "@/llm/client";
import { outlinePrompt, chapterPrompt, chapterSummaryPrompt, SYS_NOVELIST } from "@/lib/prompts";
import { buildTocHtmlFromChapters } from "@/lib/toc";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Wand2,
  X,
  FileText,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/new")({
  component: () => (
    <Shell>
      <NewBookWizard />
    </Shell>
  ),
});

const GENRES = [
  "Fantasy",
  "Sci-Fi",
  "Mystery",
  "Thriller",
  "Romance",
  "Literary",
  "Horror",
  "Historical",
  "Young Adult",
  "Non-fiction",
];
const ARCS = ["Three-Act", "Hero's Journey", "Save the Cat", "Five-Act", "Custom"];

type Draft = Omit<Book, "id" | "createdAt" | "updatedAt">;
type OutlineRow = { title: string; synopsis: string; targetWords: number };

function emptyDraft(): Draft {
  return {
    title: "",
    genre: [],
    subgenre: "",
    tone: "",
    audience: "",
    pov: "Third person limited",
    tense: "Past",
    premise: "",
    arc: "Three-Act",
    targetChapters: 12,
    targetWordsPerChapter: 2500,
    characters: [],
    setting: "",
    voiceGuide: "",
    styleGuide: "",
    themes: [],
    compTitles: [],
    researchConstraints: "",
  };
}

function NewBookWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [outline, setOutline] = useState<OutlineRow[]>([]);
  const [customBrief, setCustomBrief] = useState<string | null>(null);
  const [briefEditing, setBriefEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ ch: number; words: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seeded = window.sessionStorage.getItem("quill.draftSeed");
    if (!seeded) return;
    try {
      const partial = JSON.parse(seeded) as Partial<Draft>;
      setDraft((current) => ({ ...current, ...partial }));
      toast.success("Template loaded - review the manuscript brief and continue.");
    } catch {
      /* ignore */
    }
    window.sessionStorage.removeItem("quill.draftSeed");
  }, []);

  function up<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const provider = settings ? settings.providers[settings.defaultProvider] : null;
  const providerReady = provider?.enabled;

  async function suggestCharacters() {
    if (!provider) return;
    setBusy("chars");
    try {
      const result = await callLLM(provider, {
        messages: [
          { role: "system", content: SYS_NOVELIST },
          {
            role: "user",
            content:
              `Suggest 4 main characters for this book. Return ONLY a JSON array with items shaped like ` +
              `{"name":"", "role":"", "traits":"", "goals":"", "conflict":"", "voice":""}.\n\n` +
              `Book: ${draft.title}\nGenre: ${draft.genre.join(", ")}\nPremise: ${draft.premise}`,
          },
        ],
      });
      const parsed = extractJson(result.text);
      if (!Array.isArray(parsed)) {
        toast.error("Could not parse character suggestions");
        return;
      }
      up(
        "characters",
        parsed.map((item) => ({
          name: String(item.name || ""),
          role: String(item.role || ""),
          traits: [
            item.traits ? `Traits: ${item.traits}` : "",
            item.goals ? `Goals: ${item.goals}` : "",
            item.conflict ? `Conflict: ${item.conflict}` : "",
            item.voice ? `Voice: ${item.voice}` : "",
          ]
            .filter(Boolean)
            .join(" | "),
        })),
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateOutline() {
    if (!provider) return;
    setBusy("outline");
    try {
      const result = await callLLM(provider, {
        messages: [
          { role: "system", content: SYS_NOVELIST },
          {
            role: "user",
            content: outlinePrompt({ ...draft, id: "", createdAt: 0, updatedAt: 0 }),
          },
        ],
      });
      const parsed = extractJson(result.text);
      if (!Array.isArray(parsed) || !parsed.length) {
        toast.error("Could not parse outline");
        return;
      }
      setOutline(
        parsed.slice(0, draft.targetChapters).map((chapter) => ({
          title: String(chapter.title || ""),
          synopsis: String(chapter.synopsis || ""),
          targetWords: Math.max(100, Number(chapter.targetWords) || draft.targetWordsPerChapter),
        })),
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const generatedBrief = useMemo(() => {
    const bookLike: Book = { ...draft, id: "", createdAt: 0, updatedAt: 0 };
    const lines = [
      `Title: ${bookLike.title}`,
      bookLike.genre.length ? `Genre: ${bookLike.genre.join(", ")}` : "",
      bookLike.subgenre ? `Subgenre: ${bookLike.subgenre}` : "",
      bookLike.tone ? `Tone: ${bookLike.tone}` : "",
      bookLike.audience ? `Audience: ${bookLike.audience}` : "",
      bookLike.pov ? `POV: ${bookLike.pov}` : "",
      bookLike.tense ? `Tense: ${bookLike.tense}` : "",
      bookLike.premise ? `Premise: ${bookLike.premise}` : "",
      bookLike.arc ? `Narrative arc: ${bookLike.arc}` : "",
      bookLike.setting ? `Setting: ${bookLike.setting}` : "",
      bookLike.voiceGuide ? `Voice guide: ${bookLike.voiceGuide}` : "",
      bookLike.styleGuide ? `Style guide: ${bookLike.styleGuide}` : "",
      bookLike.themes?.length ? `Themes: ${bookLike.themes.join(", ")}` : "",
      bookLike.compTitles?.length ? `Comparable titles: ${bookLike.compTitles.join(", ")}` : "",
      bookLike.researchConstraints ? `Research constraints: ${bookLike.researchConstraints}` : "",
      (bookLike.characters || []).length
        ? `Characters:\n${(bookLike.characters || [])
            .map((character) => `- ${character.name} (${character.role}) - ${character.traits}`)
            .join("\n")}`
        : "",
      outline.length
        ? `\nOutline:\n${outline
            .map(
              (row, index) =>
                `${index + 1}. ${row.title} - ~${row.targetWords.toLocaleString()} words\n   ${row.synopsis}`,
            )
            .join("\n")}`
        : "",
    ].filter(Boolean);
    return lines.join("\n");
  }, [draft, outline]);

  const effectiveBrief = customBrief ?? generatedBrief;

  async function generateBook() {
    if (!provider) return;
    setBusy("book");
    const now = Date.now();
    const bookId = uid();
    const book: Book = {
      id: bookId,
      ...draft,
      authorName: settings?.authorName || undefined,
      customBrief: customBrief ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    const chapters: Chapter[] = outline.map((row, index) => ({
      id: uid(),
      bookId,
      index,
      title: row.title,
      synopsis: row.synopsis,
      content: "",
      status: "draft",
      wordCount: 0,
      targetWords: row.targetWords || draft.targetWordsPerChapter,
      actualSummary: row.synopsis,
      revisionState: "drafting",
      lastEditedAt: now,
      updatedAt: now,
    }));

    const titlePageAuthor = book.authorName || "";
    const year = new Date().getFullYear();
    const seedPages: BookPage[] = [
      {
        id: uid(),
        bookId,
        kind: "title-page",
        section: "front",
        index: 0,
        title: "Title Page",
        content: `<p style="text-align:center"><strong>${escapeHtml(book.title)}</strong></p>${
          titlePageAuthor
            ? `<p style="text-align:center"><em>by ${escapeHtml(titlePageAuthor)}</em></p>`
            : ""
        }`,
        updatedAt: now,
      },
      {
        id: uid(),
        bookId,
        kind: "copyright",
        section: "front",
        index: 1,
        title: "Copyright",
        content: `<p>Copyright &copy; ${year}${titlePageAuthor ? ` ${escapeHtml(titlePageAuthor)}` : ""}.</p><p>All rights reserved. No part of this book may be reproduced in any form without permission.</p>`,
        updatedAt: now,
      },
      {
        id: uid(),
        bookId,
        kind: "toc",
        section: "front",
        index: 2,
        title: "Table of Contents",
        content: buildTocHtmlFromChapters(
          chapters.map((chapter) => ({
            index: chapter.index,
            title: chapter.title,
            partTitle: chapter.partTitle,
            synopsis: chapter.synopsis,
          })),
          { heading: "Contents", includeSummary: true },
        ),
        updatedAt: now,
      },
    ];

    try {
      await db.books.add(book);
      await db.chapters.bulkAdd(chapters);
      await db.bookPages.bulkAdd(seedPages);

      const characterProfiles = createCharacterProfiles(bookId, draft.characters || [], now);
      const sceneCards = createSceneCardsFromChapters(chapters, now);
      if (characterProfiles.length) await db.characterProfiles.bulkAdd(characterProfiles);
      if (sceneCards.length) await db.sceneCards.bulkAdd(sceneCards);

      for (let index = 0; index < chapters.length; index++) {
        const chapter = chapters[index];
        setProgress({ ch: index + 1, words: 0 });
        const previousSummaries = outline.slice(0, index).map((row) => row.synopsis);
        let generatedText = "";
        await streamLLM(
          provider,
          {
            messages: [
              { role: "system", content: SYS_NOVELIST },
              { role: "user", content: chapterPrompt(book, chapter, previousSummaries) },
            ],
            maxTokens: Math.max(1500, (chapter.targetWords ?? draft.targetWordsPerChapter) * 2),
          },
          (chunk) => {
            generatedText += chunk;
            setProgress({ ch: index + 1, words: wordCount(textToHtml(generatedText)) });
          },
        );

        const finalHtml = textToHtml(generatedText);
        const summaryResult = await callLLM(provider, {
          messages: [
            { role: "system", content: SYS_NOVELIST },
            { role: "user", content: chapterSummaryPrompt(book, chapter, finalHtml) },
          ],
          maxTokens: 300,
        });
        const summary = summaryResult.text.trim() || chapter.synopsis || "";

        await db.chapters.update(chapter.id, {
          content: finalHtml,
          wordCount: wordCount(finalHtml),
          actualSummary: summary,
          lastEditedAt: Date.now(),
          updatedAt: Date.now(),
        });

        const scene = sceneCards[index];
        if (scene) {
          await db.sceneCards.update(scene.id, {
            summary,
            actualWords: wordCount(finalHtml),
            status: "drafting",
            updatedAt: Date.now(),
          });
        }
      }

      toast.success("Book generated!");
      navigate({ to: "/book/$bookId", params: { bookId } });
    } catch (error) {
      toast.error(`Generation stopped: ${(error as Error).message}`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  if (!settings) return <div className="p-6 sm:p-10">Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="font-serif text-4xl sm:text-5xl">New Book</h1>
      <p className="text-muted-foreground mt-2">
        Tell us the premise. We will outline and write the chapters.
      </p>

      <Stepper
        step={step}
        steps={["Premise", "Structure", "Characters", "Outline", "Review", "Generate"]}
      />

      {!providerReady && (
        <Card className="p-4 mt-6 border-destructive/40 bg-destructive/5">
          <p className="text-sm">
            No AI provider is enabled.{" "}
            <a href="/settings/ai" className="underline font-medium">
              Configure one
            </a>{" "}
            before generating.
          </p>
        </Card>
      )}

      <Card className="mt-6 p-4 sm:p-8">
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Title">
              <Input
                value={draft.title}
                onChange={(event) => up("title", event.target.value)}
                placeholder="The Cartographer of Lost Things"
              />
            </Field>
            <div>
              <Label>Genre</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {GENRES.map((genre) => {
                  const enabled = draft.genre.includes(genre);
                  return (
                    <button
                      key={genre}
                      onClick={() =>
                        up(
                          "genre",
                          enabled
                            ? draft.genre.filter((entry) => entry !== genre)
                            : [...draft.genre, genre],
                        )
                      }
                      className={`px-3 py-1.5 text-sm rounded-full border transition ${
                        enabled
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card hover:bg-secondary border-border"
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Subgenre / Vibe">
              <Input
                value={draft.subgenre}
                onChange={(event) => up("subgenre", event.target.value)}
                placeholder="Cozy mystery, slow-burn romance, hopeful sci-fi..."
              />
            </Field>
            <Field label="Premise (one paragraph)">
              <Textarea
                rows={4}
                value={draft.premise}
                onChange={(event) => up("premise", event.target.value)}
                placeholder="A retired cartographer is hired to map a city that only appears at dusk..."
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Tone">
                <Input
                  value={draft.tone}
                  onChange={(event) => up("tone", event.target.value)}
                  placeholder="Wistful, witty"
                />
              </Field>
              <Field label="Audience">
                <Input
                  value={draft.audience}
                  onChange={(event) => up("audience", event.target.value)}
                  placeholder="Adult literary"
                />
              </Field>
              <Field label="POV">
                <Select value={draft.pov} onValueChange={(value) => up("pov", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "First person",
                      "Second person",
                      "Third person limited",
                      "Third person omniscient",
                    ].map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Voice Guide">
              <Textarea
                rows={2}
                value={draft.voiceGuide}
                onChange={(event) => up("voiceGuide", event.target.value)}
                placeholder="Voice promises to keep across the manuscript."
              />
            </Field>
            <Field label="Style Guide">
              <Textarea
                rows={2}
                value={draft.styleGuide}
                onChange={(event) => up("styleGuide", event.target.value)}
                placeholder="Sentence-level preferences, banned habits, structural rules."
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Themes (comma-separated)">
                <Input
                  value={(draft.themes || []).join(", ")}
                  onChange={(event) => up("themes", splitCommaList(event.target.value))}
                  placeholder="Identity, ambition, belonging"
                />
              </Field>
              <Field label="Comparable Titles (comma-separated)">
                <Input
                  value={(draft.compTitles || []).join(", ")}
                  onChange={(event) => up("compTitles", splitCommaList(event.target.value))}
                  placeholder="Book A, Book B"
                />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Number of chapters">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.targetChapters}
                  onChange={(event) =>
                    up("targetChapters", Math.max(1, Number(event.target.value) || 1))
                  }
                />
              </Field>
              <Field label="Target words per chapter">
                <Input
                  type="number"
                  step={500}
                  min={300}
                  value={draft.targetWordsPerChapter}
                  onChange={(event) =>
                    up("targetWordsPerChapter", Math.max(300, Number(event.target.value) || 300))
                  }
                />
              </Field>
            </div>
            <Field label="Narrative arc">
              <Select value={draft.arc} onValueChange={(value) => up("arc", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARCS.map((arc) => (
                    <SelectItem key={arc} value={arc}>
                      {arc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tense">
              <Select value={draft.tense} onValueChange={(value) => up("tense", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Past", "Present"].map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      {entry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Research Constraints">
              <Textarea
                rows={3}
                value={draft.researchConstraints}
                onChange={(event) => up("researchConstraints", event.target.value)}
                placeholder="Fact boundaries, source expectations, and topics that need citation discipline."
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              Estimated total:{" "}
              <span className="font-medium text-foreground">
                {(draft.targetChapters * draft.targetWordsPerChapter).toLocaleString()} words
              </span>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-serif text-2xl">Characters and World</h3>
              <Button
                variant="outline"
                disabled={!providerReady || busy === "chars"}
                onClick={suggestCharacters}
                className="w-full sm:w-auto"
              >
                {busy === "chars" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                AI Suggest
              </Button>
            </div>
            <Field label="Setting">
              <Textarea
                rows={3}
                value={draft.setting}
                onChange={(event) => up("setting", event.target.value)}
                placeholder="A coastal town in 1920s New England..."
              />
            </Field>
            <div className="space-y-2">
              {(draft.characters || []).map((character, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-md bg-secondary/50 p-3 sm:flex-row sm:items-start"
                >
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input
                      value={character.name}
                      onChange={(event) => updateChar(index, { name: event.target.value })}
                      placeholder="Name"
                    />
                    <Input
                      value={character.role}
                      onChange={(event) => updateChar(index, { role: event.target.value })}
                      placeholder="Role"
                    />
                    <Input
                      value={character.traits}
                      onChange={(event) => updateChar(index, { traits: event.target.value })}
                      placeholder="Traits"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="self-end sm:self-auto"
                    onClick={() =>
                      up(
                        "characters",
                        (draft.characters || []).filter(
                          (_, characterIndex) => characterIndex !== index,
                        ),
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="ghost"
                onClick={() =>
                  up("characters", [
                    ...(draft.characters || []),
                    { name: "", role: "", traits: "" },
                  ])
                }
              >
                + Add character
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-serif text-2xl">Outline</h3>
              <Button
                onClick={generateOutline}
                disabled={!providerReady || busy === "outline"}
                className="w-full sm:w-auto"
              >
                {busy === "outline" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {outline.length ? "Regenerate outline" : "Generate outline"}
              </Button>
            </div>
            {!outline.length && (
              <p className="text-sm text-muted-foreground">
                Generate an outline of {draft.targetChapters} chapters from your premise. Each
                chapter can have its own word target.
              </p>
            )}
            <div className="space-y-3">
              {outline.map((row, index) => (
                <div key={index} className="p-4 border rounded-md bg-card">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <span className="w-8 font-serif text-lg text-muted-foreground">
                      {index + 1}.
                    </span>
                    <Input
                      value={row.title}
                      onChange={(event) =>
                        setOutline(
                          outline.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, title: event.target.value } : entry,
                          ),
                        )
                      }
                      className="font-serif text-lg"
                    />
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">
                        Target
                      </Label>
                      <Input
                        type="number"
                        min={100}
                        step={100}
                        value={row.targetWords}
                        onChange={(event) =>
                          setOutline(
                            outline.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    targetWords: Math.max(100, Number(event.target.value) || 100),
                                  }
                                : entry,
                            ),
                          )
                        }
                        className="w-24 h-9 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">words</span>
                    </div>
                  </div>
                  <Textarea
                    rows={2}
                    className="mt-2"
                    value={row.synopsis}
                    onChange={(event) =>
                      setOutline(
                        outline.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, synopsis: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            {outline.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Total target:{" "}
                <span className="font-medium text-foreground">
                  {outline
                    .reduce((total, entry) => total + (entry.targetWords || 0), 0)
                    .toLocaleString()}{" "}
                  words
                </span>{" "}
                across {outline.length} chapters.
              </p>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-serif text-2xl">Review the prompt</h3>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {customBrief !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCustomBrief(null);
                      setBriefEditing(false);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset to generated
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!briefEditing && customBrief === null) setCustomBrief(generatedBrief);
                    setBriefEditing((editing) => !editing);
                  }}
                >
                  {briefEditing ? "Done editing" : "Edit prompt"}
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This is the full context the AI will use for every chapter. Edit it to add tone notes,
              style rules, or anything else you want carried through the whole book.
            </p>
            {briefEditing ? (
              <Textarea
                rows={20}
                className="font-mono text-xs leading-relaxed"
                value={customBrief ?? generatedBrief}
                onChange={(event) => setCustomBrief(event.target.value)}
              />
            ) : (
              <pre className="text-xs leading-relaxed whitespace-pre-wrap bg-secondary/50 border rounded-md p-4 max-h-[28rem] overflow-y-auto font-mono">
                {effectiveBrief}
              </pre>
            )}
            {customBrief !== null && !briefEditing && (
              <p className="text-xs text-primary">Using your edited prompt.</p>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <h3 className="font-serif text-2xl">Ready to write</h3>
            <p className="text-muted-foreground">
              We will generate {outline.length || draft.targetChapters} chapters, around{" "}
              {draft.targetWordsPerChapter.toLocaleString()} words each, using{" "}
              <strong className="text-foreground">{settings.defaultProvider}</strong>. You can
              pause, revise, and plan scenes later in the manuscript workspace.
            </p>
            {progress && (
              <Card className="p-4 bg-secondary/50">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      Writing chapter {progress.ch} of {outline.length}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {progress.words.toLocaleString()} words so far
                    </div>
                  </div>
                </div>
                <div className="h-1.5 bg-background rounded mt-3 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(progress.ch / outline.length) * 100}%` }}
                  />
                </div>
              </Card>
            )}
            <Button
              size="lg"
              disabled={!providerReady || busy === "book" || !outline.length}
              onClick={generateBook}
              className="w-full"
            >
              {busy === "book" ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-5 w-5 mr-2" />
              )}
              Looks good - start writing
            </Button>
            {!outline.length && (
              <p className="text-xs text-destructive">Go back and generate an outline first.</p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-8 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            disabled={step === 0 || !!busy}
            onClick={() => setStep(step - 1)}
            className="w-full sm:w-auto"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < 5 && (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 0 && !draft.title) || (step === 3 && !outline.length)}
              className="w-full sm:w-auto"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );

  function updateChar(
    index: number,
    patch: Partial<{ name: string; role: string; traits: string }>,
  ) {
    up(
      "characters",
      (draft.characters || []).map((character, characterIndex) =>
        characterIndex === index ? { ...character, ...patch } : character,
      ),
    );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Stepper({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="-mx-4 mt-8 mb-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-max items-center gap-2">
        {steps.map((label, index) => (
          <div key={label} className="flex shrink-0 items-center gap-2">
            <div
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-medium ${
                index === step
                  ? "bg-primary text-primary-foreground"
                  : index < step
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {index + 1}
            </div>
            <span className={`text-sm ${index === step ? "font-medium" : "text-muted-foreground"}`}>
              {label}
            </span>
            {index < steps.length - 1 && <span className="hidden h-px w-8 bg-border sm:block" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function extractJson(text: string): Array<Record<string, unknown>> | null {
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
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function textToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${paragraph.trim().replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return (value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
