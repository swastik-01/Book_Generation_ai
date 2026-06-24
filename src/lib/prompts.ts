import type {
  Book,
  Chapter,
  CharacterProfile,
  ManuscriptNote,
  RevisionTask,
  SceneCard,
} from "./db";

export const SYS_NOVELIST =
  "You are an expert novelist, developmental editor, and line editor. Write vivid, immersive prose with strong voice, sensory detail, and natural dialogue. Avoid cliches, repetition, and generic beats. Preserve continuity across the whole manuscript.";

export interface ManuscriptPromptContext {
  characters?: CharacterProfile[];
  scenes?: SceneCard[];
  notes?: ManuscriptNote[];
  revisionTasks?: RevisionTask[];
  recentChapters?: Chapter[];
  activeScene?: SceneCard | null;
}

function renderLegacyCharacters(book: Book) {
  return (book.characters || [])
    .map((character) => `- ${character.name} (${character.role}) - ${character.traits}`)
    .join("\n");
}

function renderCharacterProfiles(characters: CharacterProfile[] = []) {
  return characters
    .map((character) => {
      const extras = [
        character.traits && `Traits: ${character.traits}`,
        character.goals && `Goal: ${character.goals}`,
        character.conflict && `Conflict: ${character.conflict}`,
        character.voice && `Voice: ${character.voice}`,
        character.aliases?.length ? `Aliases: ${character.aliases.join(", ")}` : "",
        character.notes && `Notes: ${character.notes}`,
      ]
        .filter(Boolean)
        .join(" | ");
      return `- ${character.name} (${character.role || "character"})${extras ? ` - ${extras}` : ""}`;
    })
    .join("\n");
}

function renderScenes(scenes: SceneCard[] = []) {
  return scenes
    .map(
      (scene, index) =>
        `${index + 1}. ${scene.title} [${scene.status}]${scene.pov ? ` POV: ${scene.pov}` : ""}${
          scene.location ? ` | Location: ${scene.location}` : ""
        }\n   Summary: ${scene.summary || scene.purpose || "No scene summary yet."}`,
    )
    .join("\n");
}

function renderNotes(notes: ManuscriptNote[] = []) {
  return notes.map((note) => `- [${note.scope}] ${note.title}: ${note.content}`).join("\n");
}

function renderRevisionTasks(tasks: RevisionTask[] = []) {
  return tasks
    .map(
      (task, index) =>
        `${index + 1}. [${task.severity.toUpperCase()}] ${task.title} (${task.status}) - ${task.details}`,
    )
    .join("\n");
}

function renderRecentChapters(chapters: Chapter[] = []) {
  return chapters
    .map(
      (chapter) =>
        `- Chapter ${chapter.index + 1}: ${chapter.title}\n  Summary: ${
          chapter.actualSummary || chapter.synopsis || "No summary yet."
        }`,
    )
    .join("\n");
}

export function bookBible(book: Book, context: ManuscriptPromptContext = {}): string {
  const characterBlock =
    context.characters && context.characters.length
      ? renderCharacterProfiles(context.characters)
      : renderLegacyCharacters(book);

  return [
    `Title: ${book.title}`,
    book.genre?.length ? `Genre: ${book.genre.join(", ")}` : "",
    book.subgenre ? `Subgenre: ${book.subgenre}` : "",
    book.tone ? `Tone: ${book.tone}` : "",
    book.audience ? `Audience: ${book.audience}` : "",
    book.pov ? `POV: ${book.pov}` : "",
    book.tense ? `Tense: ${book.tense}` : "",
    book.premise ? `Premise: ${book.premise}` : "",
    book.arc ? `Narrative arc: ${book.arc}` : "",
    book.setting ? `Setting: ${book.setting}` : "",
    book.voiceGuide ? `Voice guide: ${book.voiceGuide}` : "",
    book.styleGuide ? `Style guide: ${book.styleGuide}` : "",
    book.themes?.length ? `Themes: ${book.themes.join(", ")}` : "",
    book.compTitles?.length ? `Comparable titles: ${book.compTitles.join(", ")}` : "",
    book.researchConstraints ? `Research constraints: ${book.researchConstraints}` : "",
    characterBlock ? `Characters:\n${characterBlock}` : "",
    context.scenes?.length ? `Active chapter scenes:\n${renderScenes(context.scenes)}` : "",
    context.activeScene ? `Primary scene focus: ${context.activeScene.title}` : "",
    context.recentChapters?.length
      ? `Recent chapter summaries:\n${renderRecentChapters(context.recentChapters)}`
      : "",
    context.notes?.length ? `Relevant manuscript notes:\n${renderNotes(context.notes)}` : "",
    context.revisionTasks?.length
      ? `Open revision tasks:\n${renderRevisionTasks(context.revisionTasks)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function outlinePrompt(book: Book) {
  return `Create an outline for the following book in EXACTLY ${book.targetChapters} chapters.

${bookBible(book)}

Return ONLY a JSON array, no commentary, no markdown fences. Each item:
{"title":"Chapter title","synopsis":"2-4 sentence chapter synopsis","targetWords":2500}

The array must have exactly ${book.targetChapters} items in order.`;
}

export function chapterPrompt(
  book: Book,
  chapter: Chapter,
  prevSummaries: string[],
  context: ManuscriptPromptContext = {},
) {
  const prev = prevSummaries.length
    ? `Previously in the book:\n${prevSummaries.map((summary, index) => `Chapter ${index + 1}: ${summary}`).join("\n")}`
    : "This is the opening chapter.";
  const target = chapter.targetWords ?? book.targetWordsPerChapter;
  const brief = book.customBrief || bookBible(book, context);
  return `Write Chapter ${chapter.index + 1}: "${chapter.title}" of the following book.

${brief}

${prev}

This chapter's synopsis: ${chapter.synopsis || "(none)"}
Current chapter summary: ${chapter.actualSummary || chapter.synopsis || "No summary yet."}

Target length: about ${target} words.
Write rich, publishable prose. Use scene breaks (---) when appropriate. Do NOT include the chapter title or "Chapter N" header - just the prose. Do not add commentary or notes.`;
}

export function rewritePrompt(
  text: string,
  instruction: string,
  book?: Book,
  context: ManuscriptPromptContext = {},
) {
  return `${book ? `${bookBible(book, context)}\n\n` : ""}Rewrite the following passage according to this instruction: "${instruction}".
Return ONLY the rewritten passage, no commentary.

PASSAGE:
${text}`;
}

export function continuePrompt(
  book: Book,
  chapter: Chapter,
  recent: string,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

You are continuing Chapter ${chapter.index + 1}: "${chapter.title}".

IMPORTANT RULES:
- Continue from EXACTLY where the existing prose ends. Do NOT rewrite, summarize, or restart.
- Do NOT repeat the last sentence or paraphrase what is already there.
- Match the established voice, tense, POV, character names, and tone EXACTLY.
- Stay strictly inside this chapter's plot beats unless the existing prose clearly demands movement.
- Write 2-3 paragraphs of new prose that pick up the next moment in time.
- Return ONLY the new prose. No headings, no commentary, no quotation of prior text.

Existing prose so far (the LAST line is where you must continue):
"""
${recent.slice(-3000)}
"""`;
}

export function critiquePrompt(
  book: Book,
  chapter: Chapter,
  content: string,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

Give a structured developmental critique of Chapter ${chapter.index + 1}: "${chapter.title}".
Return ONLY JSON with this shape:
{"summary":"short editorial overview","findings":[{"title":"issue name","details":"specific explanation","severity":"low|medium|high"}]}

Focus on pacing, structure, character voice, clarity, continuity, sensory detail, and show-vs-tell issues.

CHAPTER TEXT:
${content.slice(0, 9000)}`;
}

export function sceneBeatPrompt(
  book: Book,
  chapter: Chapter,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

Create scene beats for Chapter ${chapter.index + 1}: "${chapter.title}".
Return ONLY a JSON array. Each item:
{"title":"scene title","summary":"1-3 sentence beat summary","purpose":"why this scene exists","pov":"POV character","location":"scene location","timelineNote":"time relation","targetWords":900}

Use the chapter synopsis and manuscript context to produce a practical scene plan.`;
}

export function continuityPassPrompt(
  book: Book,
  chapter: Chapter,
  content: string,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

Run a continuity pass on Chapter ${chapter.index + 1}: "${chapter.title}".
Return ONLY JSON with this shape:
{"summary":"one paragraph","findings":[{"title":"continuity issue","details":"what conflicts and why","severity":"low|medium|high"}]}

Check facts, timeline, character motivation, POV consistency, and references to prior events.

CHAPTER TEXT:
${content.slice(0, 9000)}`;
}

export function developmentalEditPrompt(
  book: Book,
  chapter: Chapter,
  content: string,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

Give a developmental edit for Chapter ${chapter.index + 1}: "${chapter.title}".
Return ONLY JSON with this shape:
{"summary":"short editorial diagnosis","findings":[{"title":"edit target","details":"specific developmental recommendation","severity":"low|medium|high"}]}

Focus on scene progression, chapter arc, tension, narrative focus, and payoff.

CHAPTER TEXT:
${content.slice(0, 9000)}`;
}

export function lineEditPrompt(
  book: Book,
  chapter: Chapter,
  content: string,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

Perform a line edit on Chapter ${chapter.index + 1}: "${chapter.title}".
Return ONLY JSON with this shape:
{"summary":"short line-edit overview","findings":[{"title":"line issue","details":"specific line-level guidance","severity":"low|medium|high"}]}

Focus on diction, rhythm, repetition, clarity, overwritten passages, weak verbs, and awkward transitions.

CHAPTER TEXT:
${content.slice(0, 9000)}`;
}

export function chapterSummaryPrompt(
  book: Book,
  chapter: Chapter,
  content: string,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

Summarize Chapter ${chapter.index + 1}: "${chapter.title}" for the author's manuscript dashboard.
Return ONLY plain text, 3-5 sentences, covering what happens, who changes, and what should be remembered later.

CHAPTER TEXT:
${content.slice(0, 9000)}`;
}

export function revisionTasksPrompt(
  book: Book,
  chapter: Chapter,
  content: string,
  context: ManuscriptPromptContext = {},
) {
  return `${bookBible(book, context)}

Create revision tasks for Chapter ${chapter.index + 1}: "${chapter.title}".
Return ONLY a JSON array. Each item:
{"title":"task title","details":"what to revise and why","severity":"low|medium|high"}

The tasks should be concrete enough for a professional author to execute.

CHAPTER TEXT:
${content.slice(0, 9000)}`;
}
