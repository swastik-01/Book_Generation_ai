import { db, type Book, type Chapter, type BookPage, type Reference } from "@/lib/db";

export interface BookBundle {
  book: Book;
  chapters: Chapter[];
  frontPages: BookPage[];
  backPages: BookPage[];
  references: Reference[];
}

export async function loadBundle(bookId: string): Promise<BookBundle> {
  const book = await db.books.get(bookId);
  if (!book) throw new Error("Book not found");
  const [chapters, pages, references] = await Promise.all([
    db.chapters.where("bookId").equals(bookId).sortBy("index"),
    db.bookPages.where("bookId").equals(bookId).toArray(),
    db.references.where("bookId").equals(bookId).toArray(),
  ]);
  const frontPages = pages.filter((p) => p.section === "front").sort((a, b) => a.index - b.index);
  const backPages = pages.filter((p) => p.section === "back").sort((a, b) => a.index - b.index);
  return { book, chapters, frontPages, backPages, references };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToParagraphs(html: string): string[] {
  const text = htmlToText(html);
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export function safeFilename(s: string): string {
  return (
    (s || "book")
      .replace(/[^a-z0-9\-_. ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "book"
  );
}

export function escapeXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface ExportOptions {
  scope: "complete" | "manuscript";
  /** PDF trim size */
  trim?: "6x9" | "5x8" | "A5" | "Letter";
  onProgress?: (pct: number, msg: string) => void;
}
