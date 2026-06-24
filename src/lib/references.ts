import { db, uid, type Reference } from "./db";

export async function nextLabel(bookId: string): Promise<string> {
  const all = await db.references.where("bookId").equals(bookId).toArray();
  const max = all.reduce((m, r) => {
    const n = Number(r.label);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return String(max + 1);
}

export async function addReference(
  input: Omit<Reference, "id" | "createdAt" | "label"> & { label?: string },
): Promise<Reference> {
  const label = input.label ?? (await nextLabel(input.bookId));
  const ref: Reference = {
    id: uid(),
    createdAt: Date.now(),
    label,
    bookId: input.bookId,
    chapterId: input.chapterId,
    citation: input.citation,
    url: input.url,
    kind: input.kind,
  };
  await db.references.add(ref);
  return ref;
}

export async function deleteReference(id: string) {
  await db.references.delete(id);
}

export async function listForBook(bookId: string): Promise<Reference[]> {
  return db.references.where("bookId").equals(bookId).toArray();
}

export type CitationStyle = "APA" | "MLA" | "Chicago";

export function citationPrompt(query: string, style: CitationStyle): string {
  return `Format the following source as a ${style}-style bibliography entry.
Return ONLY a single JSON object, no markdown fences, no commentary:
{"citation": "the formatted citation as one line", "url": "best-guess primary URL or empty string", "title": "source title or empty", "author": "author or empty", "year": "year or empty"}

Source:
${query}`;
}

export interface ParsedCitation {
  citation: string;
  url?: string;
  title?: string;
  author?: string;
  year?: string;
}

export function parseCitationResponse(raw: string): ParsedCitation | null {
  if (!raw) return null;
  const cleaned = raw.replace(/```json\s*|```/g, "").trim();
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  let obj = tryParse(cleaned) as Record<string, unknown> | null;
  if (!obj) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) obj = tryParse(m[0]) as Record<string, unknown> | null;
  }
  if (!obj || typeof obj !== "object") {
    // Fall back to treating the raw text as the citation itself.
    const t = cleaned.replace(/^["']|["']$/g, "").trim();
    return t ? { citation: t } : null;
  }
  const citation = String(obj.citation || "").trim();
  if (!citation) return null;
  const url = String(obj.url || "").trim();
  return {
    citation,
    url: url || undefined,
    title: String(obj.title || "").trim() || undefined,
    author: String(obj.author || "").trim() || undefined,
    year: String(obj.year || "").trim() || undefined,
  };
}
