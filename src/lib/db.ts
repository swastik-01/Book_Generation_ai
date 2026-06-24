import Dexie, { Table } from "dexie";

export type ChapterStatus = "draft" | "edited" | "final";
export type RevisionState = "drafting" | "review" | "revising" | "polished";
export type SceneStatus = "planned" | "drafting" | "revising" | "done";
export type ManuscriptNoteScope = "research" | "continuity" | "editorial" | "revision";
export type RevisionTaskSeverity = "low" | "medium" | "high";
export type RevisionTaskStatus = "open" | "in_progress" | "done";
export type RevisionTaskSource =
  | "manual"
  | "ai-critique"
  | "continuity-pass"
  | "developmental-edit"
  | "line-edit";

export interface Book {
  id: string;
  title: string;
  authorName?: string;
  genre: string[];
  subgenre?: string;
  tone?: string;
  audience?: string;
  pov?: string;
  tense?: string;
  premise?: string;
  arc?: string;
  targetChapters: number;
  targetWordsPerChapter: number;
  characters?: { name: string; role: string; traits: string }[];
  setting?: string;
  coverDataUrl?: string;
  /** Optional override of the auto-built brief shown in the wizard's Review step. */
  customBrief?: string;
  voiceGuide?: string;
  styleGuide?: string;
  themes?: string[];
  compTitles?: string[];
  researchConstraints?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Chapter {
  id: string;
  bookId: string;
  index: number;
  partTitle?: string; // e.g. "Part I: The Setup"
  title: string;
  synopsis?: string;
  content: string; // HTML
  status: ChapterStatus;
  wordCount: number;
  /** Per-chapter word target. Falls back to book.targetWordsPerChapter. */
  targetWords?: number;
  actualSummary?: string;
  revisionState?: RevisionState;
  lastEditedAt?: number;
  updatedAt: number;
}

export interface CharacterProfile {
  id: string;
  bookId: string;
  name: string;
  role: string;
  traits: string;
  goals?: string;
  conflict?: string;
  voice?: string;
  aliases?: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SceneCard {
  id: string;
  bookId: string;
  chapterId?: string;
  order: number;
  title: string;
  pov?: string;
  purpose?: string;
  summary?: string;
  location?: string;
  timelineNote?: string;
  status: SceneStatus;
  targetWords?: number;
  actualWords?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ManuscriptNote {
  id: string;
  bookId: string;
  chapterId?: string;
  sceneId?: string;
  scope: ManuscriptNoteScope;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface RevisionTask {
  id: string;
  bookId: string;
  chapterId?: string;
  sceneId?: string;
  title: string;
  details: string;
  severity: RevisionTaskSeverity;
  source: RevisionTaskSource;
  status: RevisionTaskStatus;
  resolutionNotes?: string;
  createdAt: number;
  updatedAt: number;
}

export type BookAssetKind = "front" | "back" | "spine" | "interior";
export interface BookAsset {
  id: string;
  bookId: string;
  kind: BookAssetKind;
  dataUrl: string;
  prompt?: string;
  createdAt: number;
}

export type BookPageKind =
  | "title-page"
  | "copyright"
  | "dedication"
  | "toc"
  | "prologue"
  | "epilogue"
  | "acknowledgements"
  | "about-author"
  | "back-cover"
  | "custom";

export interface BookPage {
  id: string;
  bookId: string;
  kind: BookPageKind;
  /** "front" pages render before chapters, "back" pages after. */
  section: "front" | "back";
  index: number;
  title: string;
  content: string; // HTML
  updatedAt: number;
}

export interface BookTemplate {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  draft: Partial<Omit<Book, "id" | "createdAt" | "updatedAt">>;
  createdAt: number;
}

export interface Reference {
  id: string;
  bookId: string;
  chapterId?: string;
  /** The display label/marker in text, e.g. "1" */
  label: string;
  /** Formatted citation text */
  citation: string;
  url?: string;
  /** "footnote" renders inline at chapter bottom; "endnote" collected into back matter */
  kind: "footnote" | "endnote";
  createdAt: number;
}

export type ProviderId = "openai" | "anthropic" | "google" | "azure" | "ollama" | "lmstudio";

export interface ProviderConfig {
  id: ProviderId;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Image generation model (OpenAI/Google) */
  imageModel?: string;
  /** Azure image deployment name */
  imageDeployment?: string;
  // Azure
  endpoint?: string;
  deployment?: string;
  apiVersion?: string;
}

export type PlagiarismEngine = "google" | "bing" | "local";
export interface PlagiarismSettings {
  engine: PlagiarismEngine;
  apiKey?: string;
  cx?: string; // Google Custom Search engine ID
}

export interface AppSettings {
  id: "settings";
  defaultProvider: ProviderId;
  providers: Record<ProviderId, ProviderConfig>;
  authorName?: string;
  plagiarism?: PlagiarismSettings;
}

export interface Version5UpgradeInput {
  books: Book[];
  chapters: Chapter[];
  existingProfiles: CharacterProfile[];
  existingScenes: SceneCard[];
  now?: number;
  uidFactory?: () => string;
}

export interface Version5UpgradePayload {
  books: Book[];
  chapters: Chapter[];
  characterProfiles: CharacterProfile[];
  sceneCards: SceneCard[];
}

function profileKey(bookId: string, name: string) {
  return `${bookId}:${name.trim().toLowerCase()}`;
}

export function buildVersion5UpgradePayload({
  books,
  chapters,
  existingProfiles,
  existingScenes,
  now = Date.now(),
  uidFactory = createUid,
}: Version5UpgradeInput): Version5UpgradePayload {
  const profileKeys = new Set(
    existingProfiles.map((profile) => profileKey(profile.bookId, profile.name)),
  );
  const sceneChapterIds = new Set(
    existingScenes.map((scene) => scene.chapterId).filter(Boolean) as string[],
  );

  const profilePuts: CharacterProfile[] = [];
  const scenePuts: SceneCard[] = [];
  const chapterPuts: Chapter[] = [];
  const bookPuts: Book[] = [];

  for (const book of books) {
    bookPuts.push({
      ...book,
      themes: book.themes ?? [],
      compTitles: book.compTitles ?? [],
    });

    for (const legacyCharacter of book.characters || []) {
      const name = legacyCharacter.name?.trim() || "";
      if (!name) continue;
      const key = profileKey(book.id, name);
      if (profileKeys.has(key)) continue;
      profileKeys.add(key);
      profilePuts.push({
        id: uidFactory(),
        bookId: book.id,
        name,
        role: legacyCharacter.role || "",
        traits: legacyCharacter.traits || "",
        goals: "",
        conflict: "",
        voice: "",
        aliases: [],
        notes: "",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  for (const chapter of chapters) {
    const chapterSummary =
      chapter.actualSummary ?? chapter.synopsis ?? summarizeHtml(chapter.content);
    chapterPuts.push({
      ...chapter,
      actualSummary: chapterSummary,
      revisionState: chapter.revisionState ?? inferRevisionState(chapter.status),
      lastEditedAt: chapter.lastEditedAt ?? chapter.updatedAt,
    });

    if (sceneChapterIds.has(chapter.id)) continue;
    sceneChapterIds.add(chapter.id);
    scenePuts.push({
      id: uidFactory(),
      bookId: chapter.bookId,
      chapterId: chapter.id,
      order: chapter.index * 100,
      title: chapter.title || `Chapter ${chapter.index + 1} scene`,
      pov: "",
      purpose: chapter.synopsis || "",
      summary: chapterSummary,
      location: "",
      timelineNote: "",
      status: inferSceneStatus(chapter.status),
      targetWords: chapter.targetWords,
      actualWords: chapter.wordCount,
      createdAt: chapter.updatedAt || now,
      updatedAt: chapter.updatedAt || now,
    });
  }

  return {
    books: bookPuts,
    chapters: chapterPuts,
    characterProfiles: profilePuts,
    sceneCards: scenePuts,
  };
}

class QuillDB extends Dexie {
  books!: Table<Book, string>;
  chapters!: Table<Chapter, string>;
  settings!: Table<AppSettings, string>;
  bookAssets!: Table<BookAsset, string>;
  bookPages!: Table<BookPage, string>;
  templates!: Table<BookTemplate, string>;
  references!: Table<Reference, string>;
  characterProfiles!: Table<CharacterProfile, string>;
  sceneCards!: Table<SceneCard, string>;
  manuscriptNotes!: Table<ManuscriptNote, string>;
  revisionTasks!: Table<RevisionTask, string>;

  constructor() {
    super("quill-writer");
    this.version(1).stores({
      books: "id, updatedAt, title",
      chapters: "id, bookId, index, [bookId+index]",
      settings: "id",
    });
    this.version(2).stores({
      books: "id, updatedAt, title",
      chapters: "id, bookId, index, [bookId+index]",
      settings: "id",
      bookAssets: "id, bookId, kind, [bookId+kind]",
      bookPages: "id, bookId, section, index, [bookId+section+index]",
      templates: "id, name, builtin",
    });
    this.version(3).stores({
      books: "id, updatedAt, title",
      chapters: "id, bookId, index, [bookId+index]",
      settings: "id",
      bookAssets: "id, bookId, kind, [bookId+kind]",
      bookPages: "id, bookId, section, index, [bookId+section+index]",
      templates: "id, name, builtin",
      references: "id, bookId, chapterId, [bookId+kind]",
    });
    this.version(4).stores({
      books: "id, updatedAt, title",
      chapters: "id, bookId, index, partTitle, [bookId+index]",
      settings: "id",
      bookAssets: "id, bookId, kind, [bookId+kind]",
      bookPages: "id, bookId, section, index, [bookId+section+index]",
      templates: "id, name, builtin",
      references: "id, bookId, chapterId, [bookId+kind]",
    });
    this.version(5)
      .stores({
        books: "id, updatedAt, title",
        chapters: "id, bookId, index, partTitle, revisionState, [bookId+index]",
        settings: "id",
        bookAssets: "id, bookId, kind, [bookId+kind]",
        bookPages: "id, bookId, section, index, [bookId+section+index]",
        templates: "id, name, builtin",
        references: "id, bookId, chapterId, [bookId+kind]",
        characterProfiles: "id, bookId, name, [bookId+name]",
        sceneCards: "id, bookId, chapterId, order, [bookId+order], [chapterId+order]",
        manuscriptNotes: "id, bookId, chapterId, sceneId, scope, [bookId+scope]",
        revisionTasks: "id, bookId, chapterId, sceneId, status, severity, [bookId+status]",
      })
      .upgrade(async (tx) => {
        const booksTable = tx.table("books");
        const chaptersTable = tx.table("chapters");
        const characterProfilesTable = tx.table("characterProfiles");
        const sceneCardsTable = tx.table("sceneCards");

        const books = (await booksTable.toArray()) as Book[];
        const chapters = (await chaptersTable.toArray()) as Chapter[];
        const existingProfiles = (await characterProfilesTable.toArray()) as CharacterProfile[];
        const existingScenes = (await sceneCardsTable.toArray()) as SceneCard[];

        const migrated = buildVersion5UpgradePayload({
          books,
          chapters,
          existingProfiles,
          existingScenes,
        });

        if (migrated.books.length) await booksTable.bulkPut(migrated.books);
        if (migrated.chapters.length) await chaptersTable.bulkPut(migrated.chapters);
        if (migrated.characterProfiles.length)
          await characterProfilesTable.bulkPut(migrated.characterProfiles);
        if (migrated.sceneCards.length) await sceneCardsTable.bulkPut(migrated.sceneCards);
      });
  }
}

export const db = new QuillDB();

function createUid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const uid = () => createUid();

export const wordCount = (html: string) => {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(" ").length;
};

export function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarizeHtml(html: string, maxLength = 220) {
  const text = stripHtml(html);
  if (!text) return "";
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const safeCut = truncated.lastIndexOf(" ");
  return `${(safeCut > 80 ? truncated.slice(0, safeCut) : truncated).trim()}...`;
}

export function inferRevisionState(status: ChapterStatus): RevisionState {
  if (status === "final") return "polished";
  if (status === "edited") return "revising";
  return "drafting";
}

export function inferSceneStatus(status: ChapterStatus): SceneStatus {
  if (status === "final") return "done";
  if (status === "edited") return "revising";
  return "drafting";
}

const defaultProviders: Record<ProviderId, ProviderConfig> = {
  openai: { id: "openai", enabled: false, model: "gpt-4o-mini", imageModel: "gpt-image-1" },
  anthropic: { id: "anthropic", enabled: false, model: "claude-3-5-sonnet-latest" },
  google: {
    id: "google",
    enabled: false,
    model: "gemini-2.5-flash",
    imageModel: "imagen-3.0-generate-002",
  },
  azure: {
    id: "azure",
    enabled: false,
    endpoint: "",
    deployment: "",
    apiVersion: "2024-08-01-preview",
  },
  ollama: { id: "ollama", enabled: false, baseUrl: "http://localhost:11434", model: "llama3.1" },
  lmstudio: {
    id: "lmstudio",
    enabled: false,
    baseUrl: "http://localhost:1234/v1",
    model: "local-model",
  },
};

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get("settings");
  if (existing) {
    // merge in any newly-added providers
    const merged: AppSettings = {
      ...existing,
      providers: { ...defaultProviders, ...existing.providers },
    };
    return merged;
  }
  const fresh: AppSettings = {
    id: "settings",
    defaultProvider: "openai",
    providers: defaultProviders,
  };
  await db.settings.put(fresh);
  return fresh;
}

export async function saveSettings(s: AppSettings) {
  await db.settings.put(s);
}
