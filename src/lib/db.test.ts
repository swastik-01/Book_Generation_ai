import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Book, Chapter, CharacterProfile, SceneCard } from "./db";
import { buildVersion5UpgradePayload } from "./db";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: "book-1",
    title: "The Lantern Files",
    genre: ["Thriller"],
    targetChapters: 12,
    targetWordsPerChapter: 2200,
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
    title: "Arrival",
    synopsis: "A courier reaches the mountain city with forbidden records.",
    content: "<p>A courier reaches the mountain city with forbidden records.</p>",
    status: "draft",
    wordCount: 14,
    updatedAt: 100,
    ...overrides,
  };
}

describe("buildVersion5UpgradePayload", () => {
  it("normalizes legacy books and chapters while seeding manuscript entities", () => {
    const book = makeBook({
      characters: [
        { name: "Mara", role: "Lead", traits: "obsessive, precise" },
        { name: "Ilan", role: "Rival", traits: "charming, dangerous" },
      ],
      themes: undefined,
      compTitles: undefined,
    });
    const chapter = makeChapter();

    let counter = 0;
    const payload = buildVersion5UpgradePayload({
      books: [book],
      chapters: [chapter],
      existingProfiles: [],
      existingScenes: [],
      now: 500,
      uidFactory: () => `uid-${++counter}`,
    });

    expect(payload.books).toHaveLength(1);
    expect(payload.books[0].themes).toEqual([]);
    expect(payload.books[0].compTitles).toEqual([]);

    expect(payload.chapters).toHaveLength(1);
    expect(payload.chapters[0].actualSummary).toContain("courier reaches the mountain city");
    expect(payload.chapters[0].revisionState).toBe("drafting");
    expect(payload.chapters[0].lastEditedAt).toBe(100);

    expect(payload.characterProfiles).toHaveLength(2);
    expect(payload.characterProfiles.map((profile) => profile.name)).toEqual(["Mara", "Ilan"]);

    expect(payload.sceneCards).toHaveLength(1);
    expect(payload.sceneCards[0].chapterId).toBe(chapter.id);
    expect(payload.sceneCards[0].summary).toBe(payload.chapters[0].actualSummary);
    expect(payload.sceneCards[0].status).toBe("drafting");
  });

  it("avoids duplicate profile and scene records when they already exist", () => {
    const book = makeBook({
      characters: [
        { name: "Mara", role: "Lead", traits: "obsessive, precise" },
        { name: " ", role: "Ignore", traits: "Ignore" },
      ],
    });
    const chapter = makeChapter();

    const existingProfiles: CharacterProfile[] = [
      {
        id: "profile-1",
        bookId: book.id,
        name: "mara",
        role: "Lead",
        traits: "obsessive, precise",
        goals: "",
        conflict: "",
        voice: "",
        aliases: [],
        notes: "",
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const existingScenes: SceneCard[] = [
      {
        id: "scene-1",
        bookId: book.id,
        chapterId: chapter.id,
        order: 0,
        title: "Existing",
        status: "planned",
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    const payload = buildVersion5UpgradePayload({
      books: [book],
      chapters: [chapter],
      existingProfiles,
      existingScenes,
      now: 500,
      uidFactory: () => "unused",
    });

    expect(payload.characterProfiles).toHaveLength(0);
    expect(payload.sceneCards).toHaveLength(0);
  });
});
