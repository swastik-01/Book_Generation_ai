import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Shell } from "@/components/app/Shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db, getSettings, type AppSettings, type Chapter } from "@/lib/db";
import { runScan, type PlagiarismHit } from "@/lib/plagiarism";
import { streamLLM } from "@/llm/client";
import { rewritePrompt, SYS_NOVELIST } from "@/lib/prompts";
import { toast } from "sonner";
import { ShieldCheck, Loader2, Wand2, ExternalLink, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/plagiarism")({
  component: () => (
    <Shell>
      <PlagiarismPage />
    </Shell>
  ),
});

function PlagiarismPage() {
  const books = useLiveQuery(() => db.books.orderBy("updatedAt").reverse().toArray(), []);
  const [bookId, setBookId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string>("all");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [hits, setHits] = useState<PlagiarismHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, msg: "" });
  const [paraphrasing, setParaphrasing] = useState<number | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);
  useEffect(() => {
    if (!bookId && books?.length) setBookId(books[0].id);
  }, [books, bookId]);

  const chapters = useLiveQuery<Chapter[]>(
    () =>
      bookId
        ? db.chapters.where("bookId").equals(bookId).sortBy("index")
        : Promise.resolve([] as Chapter[]),
    [bookId],
  );

  const plag = settings?.plagiarism || { engine: "local" as const };

  async function runCheck() {
    if (!bookId || !chapters || !settings) return;
    setHits(null);
    setBusy(true);
    setProgress({ pct: 0, msg: "Starting…" });
    try {
      const target = chapterId === "all" ? chapters : chapters.filter((c) => c.id === chapterId);
      const result = await runScan({
        chapters: target,
        settings: plag,
        onProgress: (pct, msg) => setProgress({ pct, msg }),
      });
      setHits(result);
      toast.success(
        `Scan complete — ${result.length} potential match${result.length === 1 ? "" : "es"}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function paraphrase(idx: number) {
    if (!hits || !settings) return;
    const hit = hits[idx];
    const provider = settings.providers[settings.defaultProvider];
    if (!provider?.enabled) {
      toast.error("Enable an AI provider in Settings");
      return;
    }
    setParaphrasing(idx);
    let out = "";
    try {
      await streamLLM(
        provider,
        {
          messages: [
            { role: "system", content: SYS_NOVELIST },
            {
              role: "user",
              content: rewritePrompt(
                hit.paragraph,
                "Paraphrase to remove similarity to source while preserving meaning and voice",
                { title: "" } as Parameters<typeof rewritePrompt>[2],
              ),
            },
          ],
        },
        (c) => {
          out += c;
        },
      );
      // Replace in chapter
      const chs = await db.chapters.where("bookId").equals(bookId!).sortBy("index");
      const ch = chs.find((c) => c.title === hit.chapterTitle && c.index === hit.chapterIndex);
      if (ch) {
        const replaced = ch.content.split(hit.paragraph).join(out.trim());
        await db.chapters.update(ch.id, { content: replaced, updatedAt: Date.now() });
        toast.success("Paragraph paraphrased and replaced");
        setHits(hits.filter((_, i) => i !== idx));
      } else {
        toast.error("Couldn't locate paragraph to replace");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParaphrasing(null);
    }
  }

  const sorted = useMemo(() => (hits ? [...hits].sort((a, b) => b.score - a.score) : null), [hits]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="flex items-center gap-3 font-serif text-4xl sm:text-5xl">
        <ShieldCheck className="h-8 w-8 text-primary sm:h-9 sm:w-9" /> Plagiarism
      </h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">
        Per-paragraph scan against the open web (Google or Bing) or an internal-duplicate check that
        runs offline. Configure your search provider in{" "}
        <a href="/settings/ai" className="underline">
          AI Settings
        </a>
        .
      </p>

      <Card className="mt-8 space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="min-w-0">
            <Label>Book</Label>
            <Select value={bookId || ""} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a book" />
              </SelectTrigger>
              <SelectContent>
                {(books || []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label>Scope</Label>
            <Select value={chapterId} onValueChange={setChapterId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Whole book</SelectItem>
                {(chapters || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Ch {c.index + 1} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label>Engine</Label>
            <div className="text-sm h-10 px-3 flex items-center rounded-md border bg-secondary/30 capitalize">
              {plag.engine}
              {plag.engine !== "local" && plag.apiKey
                ? " · key set"
                : plag.engine !== "local"
                  ? " · no key"
                  : ""}
            </div>
          </div>
        </div>
        <Button className="w-full sm:w-auto" onClick={runCheck} disabled={busy || !bookId}>
          {busy ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4 mr-2" />
          )}
          Run scan
        </Button>
        {busy && (
          <div>
            <div className="h-1 bg-secondary rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(progress.pct * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{progress.msg}</p>
          </div>
        )}
      </Card>

      {sorted && sorted.length === 0 && !busy && (
        <Card className="mt-6 p-6 text-center text-muted-foreground sm:p-8">
          No potential matches found. ✓
        </Card>
      )}

      {sorted && sorted.length > 0 && (
        <div className="mt-6 space-y-3">
          {sorted.map((h, i) => (
            <Card key={i} className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="shrink-0">
                  <div
                    className={`text-xs font-mono px-2 py-1 rounded ${h.score >= 0.7 ? "bg-destructive text-destructive-foreground" : h.score >= 0.4 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-secondary"}`}
                  >
                    {Math.round(h.score * 100)}%
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">
                    Chapter {h.chapterIndex + 1} · {h.chapterTitle}
                  </div>
                  <p className="text-sm font-serif leading-relaxed">"{h.paragraph}"</p>
                  {h.matchedSnippet && (
                    <div className="mt-2 text-xs text-muted-foreground border-l-2 border-amber-500/40 pl-3 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{h.matchedSnippet}</span>
                    </div>
                  )}
                  {h.source && (
                    <a
                      href={h.source}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-xs text-primary"
                    >
                      <ExternalLink className="h-3 w-3" /> {h.source}
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full sm:w-auto"
                    disabled={paraphrasing !== null}
                    onClick={() => paraphrase(sorted.indexOf(h))}
                  >
                    {paraphrasing === sorted.indexOf(h) ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3 mr-1" />
                    )}
                    Paraphrase with AI
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
