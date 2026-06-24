import type { Chapter, PlagiarismSettings } from "./db";

export interface PlagiarismHit {
  paragraph: string;
  chapterTitle: string;
  chapterIndex: number;
  score: number; // 0..1
  source?: string; // url
  matchedSnippet?: string;
  /** identifier so the UI can mutate/paraphrase the right paragraph */
  paragraphIndex: number;
}

export interface ScanInput {
  chapters: Chapter[];
  settings: PlagiarismSettings;
  /** progress callback, fraction 0..1 */
  onProgress?: (p: number, msg: string) => void;
  /** abort */
  signal?: AbortSignal;
}

export function paragraphsOf(html: string): string[] {
  const text = html.replace(/<[^>]+>/g, "\n");
  return text
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.split(/\s+/).length >= 14);
}

function shingles(text: string, k = 5): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + k <= tokens.length; i++) out.add(tokens.slice(i, i + k).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  return inter / (a.size + b.size - inter);
}

export async function runScan(input: ScanInput): Promise<PlagiarismHit[]> {
  const { chapters, settings, onProgress, signal } = input;
  const hits: PlagiarismHit[] = [];

  // Build paragraph map up-front so we can also do internal duplicate detection.
  const paragraphs: { ch: Chapter; idx: number; text: string; sh: Set<string> }[] = [];
  for (const c of chapters) {
    paragraphsOf(c.content).forEach((p, idx) =>
      paragraphs.push({ ch: c, idx, text: p, sh: shingles(p) }),
    );
  }

  // Always include local internal-duplicate scan.
  for (let i = 0; i < paragraphs.length; i++) {
    for (let j = i + 1; j < paragraphs.length; j++) {
      const score = jaccard(paragraphs[i].sh, paragraphs[j].sh);
      if (score >= 0.6) {
        const a = paragraphs[i],
          b = paragraphs[j];
        hits.push({
          paragraph: b.text,
          paragraphIndex: b.idx,
          chapterTitle: b.ch.title,
          chapterIndex: b.ch.index,
          score,
          matchedSnippet: `Internal duplicate of: "${a.text.slice(0, 120)}…" (Ch ${a.ch.index + 1})`,
        });
      }
    }
  }

  if (settings.engine === "local") {
    onProgress?.(1, "Local scan complete");
    return hits;
  }

  // External web search per paragraph (Google CSE or Bing).
  const total = paragraphs.length;
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) break;
    const p = paragraphs[i];
    onProgress?.(i / Math.max(1, total), `Checking paragraph ${i + 1} / ${total}`);
    try {
      const phrase = p.text.slice(0, 200);
      const results =
        settings.engine === "google"
          ? await googleSearch(phrase, settings)
          : await bingSearch(phrase, settings);

      for (const r of results) {
        const sh = shingles(`${r.title} ${r.snippet}`);
        const score = jaccard(p.sh, sh);
        if (score >= 0.3) {
          hits.push({
            paragraph: p.text,
            paragraphIndex: p.idx,
            chapterTitle: p.ch.title,
            chapterIndex: p.ch.index,
            score,
            source: r.url,
            matchedSnippet: r.snippet,
          });
          break;
        }
      }
    } catch (e) {
      // surface in the first hit as a banner-like entry? simpler: rethrow on i==0
      if (i === 0) throw e;
    }
  }
  onProgress?.(1, "Done");
  return hits;
}

interface SearchHit {
  title: string;
  snippet: string;
  url: string;
}

async function googleSearch(q: string, s: PlagiarismSettings): Promise<SearchHit[]> {
  if (!s.apiKey || !s.cx) throw new Error("Google Programmable Search needs an API key and CX.");
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(s.apiKey)}&cx=${encodeURIComponent(s.cx)}&q=${encodeURIComponent(`"${q}"`)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Google CSE error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.items || [])
    .slice(0, 5)
    .map((it: { title: string; snippet?: string; link: string }) => ({
      title: it.title,
      snippet: it.snippet || "",
      url: it.link,
    }));
}

async function bingSearch(q: string, s: PlagiarismSettings): Promise<SearchHit[]> {
  if (!s.apiKey) throw new Error("Bing Search needs an API key.");
  const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(`"${q}"`)}&count=5`;
  const r = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": s.apiKey } });
  if (!r.ok) throw new Error(`Bing error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.webPages?.value || [])
    .slice(0, 5)
    .map((it: { name: string; snippet: string; url: string }) => ({
      title: it.name,
      snippet: it.snippet,
      url: it.url,
    }));
}
