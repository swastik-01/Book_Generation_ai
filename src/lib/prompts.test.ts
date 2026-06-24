import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Book, Chapter } from "./db";
import { bookBible, chapterPrompt, revisionTasksPrompt } from "./prompts";

const book: Book = {
  id: "book-1",
  title: "Harbor of Echoes",
  genre: ["Mystery"],
  subgenre: "Gothic",
  tone: "Suspenseful",
  audience: "Adult",
  pov: "Third person limited",
  tense: "Past",
  premise: "An archivist uncovers sealed logs tied to a vanished shipyard district.",
  arc: "Three-Act",
  setting: "Rainbound port city",
  voiceGuide: "Lyrical but precise",
  styleGuide: "Concrete sensory detail; avoid filler",
  themes: ["Memory", "Trust"],
  compTitles: ["The Ninth House", "Mexican Gothic"],
  researchConstraints: "Use maritime terminology accurately",
  targetChapters: 14,
  targetWordsPerChapter: 2400,
  createdAt: 1,
  updatedAt: 1,
};

const chapter: Chapter = {
  id: "chapter-3",
  bookId: "book-1",
  index: 2,
  title: "Ledger Room",
  synopsis: "The archivist tracks forged signatures to a hidden registry.",
  actualSummary: "The forged signatures point to a ledger hidden under flood gates.",
  content: "<p>The archivist tracks forged signatures to a hidden registry.</p>",
  status: "draft",
  wordCount: 1320,
  updatedAt: 100,
};

describe("manuscript prompt builders", () => {
  it("composes book bible from structured manuscript context", () => {
    const prompt = bookBible(book, {
      characters: [
        {
          id: "char-1",
          bookId: "book-1",
          name: "Nera",
          role: "Archivist",
          traits: "meticulous",
          goals: "Protect the records",
          conflict: "Haunted by a false report",
          voice: "Precise, restrained",
          aliases: ["N"],
          notes: "Avoids harbor district at night",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      scenes: [
        {
          id: "scene-1",
          bookId: "book-1",
          chapterId: chapter.id,
          order: 100,
          title: "Floodgate Archive",
          pov: "Nera",
          location: "East floodgate",
          summary: "Nera discovers the hidden ledger drawer.",
          status: "planned",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      notes: [
        {
          id: "note-1",
          bookId: "book-1",
          scope: "research",
          title: "Harbor records",
          content: "Cross-check shipping manifests by lunar tide index.",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      revisionTasks: [
        {
          id: "task-1",
          bookId: "book-1",
          title: "Clarify motive",
          details: "Explain why the forgery targets this year.",
          severity: "high",
          source: "developmental-edit",
          status: "open",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      recentChapters: [chapter],
      activeScene: {
        id: "scene-1",
        bookId: "book-1",
        chapterId: chapter.id,
        order: 100,
        title: "Floodgate Archive",
        status: "planned",
        createdAt: 1,
        updatedAt: 1,
      },
    });

    expect(prompt).toContain("Voice guide: Lyrical but precise");
    expect(prompt).toContain("Characters:");
    expect(prompt).toContain("Nera (Archivist)");
    expect(prompt).toContain("Active chapter scenes:");
    expect(prompt).toContain("Relevant manuscript notes:");
    expect(prompt).toContain("Open revision tasks:");
    expect(prompt).toContain("Primary scene focus: Floodgate Archive");
  });

  it("includes chapter and manuscript context in writing and revision prompts", () => {
    const writePrompt = chapterPrompt(book, chapter, ["A betrayal fractures the city council."]);
    expect(writePrompt).toContain('Write Chapter 3: "Ledger Room"');
    expect(writePrompt).toContain("Previously in the book:");
    expect(writePrompt).toContain("Current chapter summary:");

    const tasksPrompt = revisionTasksPrompt(book, chapter, "Sample chapter text");
    expect(tasksPrompt).toContain("Create revision tasks for Chapter 3");
    expect(tasksPrompt).toContain("Return ONLY a JSON array.");
  });
});
