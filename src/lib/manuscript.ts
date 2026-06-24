import {
  db,
  inferRevisionState,
  inferSceneStatus,
  summarizeHtml,
  uid,
  type Book,
  type Chapter,
  type CharacterProfile,
  type ManuscriptNote,
  type ManuscriptNoteScope,
  type RevisionTask,
  type RevisionTaskSeverity,
  type RevisionTaskSource,
  type SceneCard,
} from "./db";

export interface ManuscriptContextBundle {
  characters: CharacterProfile[];
  chapterScenes: SceneCard[];
  scopedNotes: ManuscriptNote[];
  openTasks: RevisionTask[];
  recentChapters: Chapter[];
  activeScene: SceneCard | null;
}

export function createCharacterProfiles(
  bookId: string,
  legacyCharacters: Array<{ name: string; role: string; traits: string }> = [],
  timestamp = Date.now(),
): CharacterProfile[] {
  return legacyCharacters
    .filter((character) => character.name.trim())
    .map((character, index) => ({
      id: uid(),
      bookId,
      name: character.name.trim(),
      role: character.role || `Character ${index + 1}`,
      traits: character.traits || "",
      goals: "",
      conflict: "",
      voice: "",
      aliases: [],
      notes: "",
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
}

export function createSceneCardsFromChapters(
  chapters: Chapter[],
  timestamp = Date.now(),
): SceneCard[] {
  return chapters.map((chapter, index) => ({
    id: uid(),
    bookId: chapter.bookId,
    chapterId: chapter.id,
    order: index * 100,
    title: chapter.title || `Chapter ${chapter.index + 1} scene`,
    pov: "",
    purpose: chapter.synopsis || "",
    summary: chapter.actualSummary || chapter.synopsis || summarizeHtml(chapter.content),
    location: "",
    timelineNote: "",
    status: inferSceneStatus(chapter.status),
    targetWords: chapter.targetWords,
    actualWords: chapter.wordCount,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function createDefaultChapterMeta(chapter: Chapter): Chapter {
  return {
    ...chapter,
    actualSummary: chapter.actualSummary || chapter.synopsis || summarizeHtml(chapter.content),
    revisionState: chapter.revisionState || inferRevisionState(chapter.status),
    lastEditedAt: chapter.lastEditedAt || chapter.updatedAt,
  };
}

export async function seedBookManuscriptData(
  book: Book,
  chapters: Chapter[],
  timestamp = Date.now(),
) {
  const existingProfiles = await db.characterProfiles.where("bookId").equals(book.id).count();
  const existingScenes = await db.sceneCards.where("bookId").equals(book.id).count();

  if (!existingProfiles) {
    const profiles = createCharacterProfiles(book.id, book.characters || [], timestamp);
    if (profiles.length) await db.characterProfiles.bulkAdd(profiles);
  }

  if (!existingScenes) {
    const scenes = createSceneCardsFromChapters(chapters, timestamp);
    if (scenes.length) await db.sceneCards.bulkAdd(scenes);
  }

  const normalizedChapters = chapters.map(createDefaultChapterMeta);
  await db.chapters.bulkPut(normalizedChapters);
}

export async function loadChapterManuscriptContext(
  bookId: string,
  chapter: Chapter,
  activeSceneId?: string,
): Promise<ManuscriptContextBundle> {
  const [characters, chapterScenes, scopedNotes, openTasks, recentChapters] = await Promise.all([
    db.characterProfiles.where("bookId").equals(bookId).sortBy("name"),
    db.sceneCards.where("chapterId").equals(chapter.id).sortBy("order"),
    db.manuscriptNotes
      .where("bookId")
      .equals(bookId)
      .toArray()
      .then((notes) => notes.filter((note) => !note.chapterId || note.chapterId === chapter.id)),
    db.revisionTasks
      .where("bookId")
      .equals(bookId)
      .toArray()
      .then((tasks) =>
        tasks.filter(
          (task) => task.status !== "done" && (!task.chapterId || task.chapterId === chapter.id),
        ),
      ),
    db.chapters
      .where("[bookId+index]")
      .between([bookId, Math.max(0, chapter.index - 2)], [bookId, chapter.index])
      .toArray(),
  ]);

  const activeScene =
    chapterScenes.find((scene) => scene.id === activeSceneId) || chapterScenes[0] || null;

  return { characters, chapterScenes, scopedNotes, openTasks, recentChapters, activeScene };
}

export function buildRevisionTask(
  input: {
    bookId: string;
    title: string;
    details: string;
    severity?: RevisionTaskSeverity;
    source?: RevisionTaskSource;
    chapterId?: string;
    sceneId?: string;
  },
  timestamp = Date.now(),
): RevisionTask {
  return {
    id: uid(),
    bookId: input.bookId,
    chapterId: input.chapterId,
    sceneId: input.sceneId,
    title: input.title,
    details: input.details,
    severity: input.severity || "medium",
    source: input.source || "manual",
    status: "open",
    resolutionNotes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildManuscriptNote(
  input: {
    bookId: string;
    scope: ManuscriptNoteScope;
    title: string;
    content: string;
    chapterId?: string;
    sceneId?: string;
  },
  timestamp = Date.now(),
): ManuscriptNote {
  return {
    id: uid(),
    bookId: input.bookId,
    chapterId: input.chapterId,
    sceneId: input.sceneId,
    scope: input.scope,
    title: input.title,
    content: input.content,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function sceneStatusLabel(status: SceneCard["status"]) {
  return {
    planned: "Planned",
    drafting: "Drafting",
    revising: "Revising",
    done: "Done",
  }[status];
}

export function revisionSeverityWeight(severity: RevisionTaskSeverity) {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

export function sortRevisionTasks(tasks: RevisionTask[]) {
  return [...tasks].sort((left, right) => {
    if (left.status !== right.status) return left.status.localeCompare(right.status);
    return revisionSeverityWeight(right.severity) - revisionSeverityWeight(left.severity);
  });
}
