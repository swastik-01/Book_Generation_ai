import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, type Book, type Chapter } from "../db";
import { loadBundle } from "./common";
import { renderHtmlExport } from "./html";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-export",
    title: "Harbor Trial",
    genre: ["Historical"],
    targetChapters: 8,
    targetWordsPerChapter: 2000,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: "chapter-export",
    bookId: "book-export",
    index: 0,
    title: "Opening",
    synopsis: "An unexpected arrival shifts the harbor trial.",
    content: "<p>An unexpected arrival shifts the harbor trial.</p>",
    status: "draft",
    wordCount: 11,
    updatedAt: 100,
    ...overrides,
  };
}

describe.sequential("renderHtmlExport", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("renders export content without leaking manuscript-only notes or tasks", async () => {
    const book = makeBook();
    const chapter = makeChapter();
    const privateMarker = "INTERNAL-ONLY-REVISION-NOTE";

    await db.books.put(book);
    await db.chapters.put(chapter);
    await db.bookPages.put({
      id: "front-1",
      bookId: book.id,
      kind: "title-page",
      section: "front",
      index: 0,
      title: "Title",
      content: "<p>Front matter</p>",
      updatedAt: 1,
    });
    await db.references.put({
      id: "ref-1",
      bookId: book.id,
      chapterId: chapter.id,
      label: "1",
      citation: "Dock records, 1887",
      kind: "footnote",
      createdAt: 1,
    });
    await db.manuscriptNotes.put({
      id: "note-1",
      bookId: book.id,
      scope: "revision",
      title: privateMarker,
      content: "Should never appear in export",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.revisionTasks.put({
      id: "task-1",
      bookId: book.id,
      title: privateMarker,
      details: "Should never appear in export",
      severity: "high",
      source: "manual",
      status: "open",
      createdAt: 1,
      updatedAt: 1,
    });

    const bundle = await loadBundle(book.id);
    const html = renderHtmlExport(bundle, "complete");

    expect(html).toContain("Chapter 1: Opening");
    expect(html).toContain("Dock records, 1887");
    expect(html).not.toContain(privateMarker);
  });
});
