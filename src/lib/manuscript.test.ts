import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, type Book, type Chapter, type RevisionTask } from "./db";
import {
  buildRevisionTask,
  createCharacterProfiles,
  createSceneCardsFromChapters,
  seedBookManuscriptData,
  sortRevisionTasks,
} from "./manuscript";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-1",
    title: "Signal in Winter",
    genre: ["Speculative"],
    targetChapters: 10,
    targetWordsPerChapter: 1800,
    characters: [{ name: "Ari", role: "Lead", traits: "patient, analytical" }],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: "chapter-1",
    bookId: "book-1",
    index: 0,
    title: "Signals",
    synopsis: "Ari intercepts a pattern from the frozen relay grid.",
    content: "<p>Ari intercepts a pattern from the frozen relay grid.</p>",
    status: "draft",
    wordCount: 12,
    updatedAt: 100,
    ...overrides,
  };
}

describe.sequential("manuscript helpers", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("creates trimmed character profiles and scene cards from chapters", () => {
    const profiles = createCharacterProfiles("book-1", [
      { name: " Ari ", role: "", traits: "curious" },
      { name: " ", role: "skip", traits: "skip" },
    ]);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe("Ari");
    expect(profiles[0].role).toBe("Character 1");

    const scenes = createSceneCardsFromChapters([makeChapter()]);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].title).toBe("Signals");
    expect(scenes[0].summary).toContain("Ari intercepts a pattern");
  });

  it("seeds manuscript data idempotently and normalizes chapter metadata", async () => {
    const book = makeBook();
    const chapter = makeChapter();

    await db.books.put(book);
    await db.chapters.put(chapter);

    await seedBookManuscriptData(book, [chapter], 1234);
    await seedBookManuscriptData(book, [chapter], 1234);

    const profiles = await db.characterProfiles.where("bookId").equals(book.id).toArray();
    const scenes = await db.sceneCards.where("bookId").equals(book.id).toArray();
    const normalized = await db.chapters.get(chapter.id);

    expect(profiles).toHaveLength(1);
    expect(scenes).toHaveLength(1);
    expect(normalized?.actualSummary).toContain("Ari intercepts a pattern");
    expect(normalized?.revisionState).toBe("drafting");
    expect(normalized?.lastEditedAt).toBe(chapter.updatedAt);
  });

  it("orders revision tasks by status and severity", () => {
    const tasks: RevisionTask[] = [
      buildRevisionTask({
        bookId: "book-1",
        title: "Typos",
        details: "Fix typos",
        severity: "low",
      }),
      buildRevisionTask({
        bookId: "book-1",
        title: "Continuity break",
        details: "Timeline mismatch in chapter 2",
        severity: "high",
      }),
      {
        ...buildRevisionTask({ bookId: "book-1", title: "Resolved", details: "Done task" }),
        status: "done",
      },
    ];

    const sorted = sortRevisionTasks(tasks);
    expect(sorted[0].title).toBe("Continuity break");
    expect(sorted[sorted.length - 1].status).toBe("done");
  });
});
