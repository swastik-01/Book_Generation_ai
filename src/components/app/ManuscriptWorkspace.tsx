import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Lightbulb,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  db,
  uid,
  type Book,
  type Chapter,
  type ManuscriptNote,
  type ManuscriptNoteScope,
  type RevisionTask,
  type RevisionTaskStatus,
  type SceneCard,
} from "@/lib/db";
import {
  buildManuscriptNote,
  buildRevisionTask,
  sceneStatusLabel,
  sortRevisionTasks,
} from "@/lib/manuscript";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type WorkspaceTab = "outline" | "characters" | "research" | "revision";

interface ManuscriptWorkspaceProps {
  tab: WorkspaceTab;
  book: Book;
  bookId: string;
  chapters: Chapter[];
  onOpenChapter: (chapterId: string) => void;
}

export function ManuscriptWorkspace({
  tab,
  book,
  bookId,
  chapters,
  onOpenChapter,
}: ManuscriptWorkspaceProps) {
  const characters = useLiveQuery(
    () => db.characterProfiles.where("bookId").equals(bookId).sortBy("name"),
    [bookId],
  );
  const scenes = useLiveQuery(
    () => db.sceneCards.where("bookId").equals(bookId).sortBy("order"),
    [bookId],
  );
  const notes = useLiveQuery(
    () => db.manuscriptNotes.where("bookId").equals(bookId).toArray(),
    [bookId],
  );
  const tasks = useLiveQuery(
    () => db.revisionTasks.where("bookId").equals(bookId).toArray(),
    [bookId],
  );
  const references = useLiveQuery(
    () => db.references.where("bookId").equals(bookId).toArray(),
    [bookId],
  );

  if (!characters || !scenes || !notes || !tasks || !references) {
    return (
      <div className="h-full grid place-items-center text-muted-foreground">
        Loading manuscript workspace...
      </div>
    );
  }

  if (tab === "outline") {
    return (
      <OutlineWorkspace
        book={book}
        chapters={chapters}
        scenes={scenes}
        onOpenChapter={onOpenChapter}
      />
    );
  }

  if (tab === "characters") {
    return <CharacterWorkspace bookId={bookId} />;
  }

  if (tab === "research") {
    return <ResearchWorkspace bookId={bookId} notes={notes} referenceCount={references.length} />;
  }

  return (
    <RevisionWorkspace
      bookId={bookId}
      tasks={tasks}
      chapters={chapters}
      onOpenChapter={onOpenChapter}
    />
  );
}

function OutlineWorkspace({
  book,
  chapters,
  scenes,
  onOpenChapter,
}: {
  book: Book;
  chapters: Chapter[];
  scenes: SceneCard[];
  onOpenChapter: (chapterId: string) => void;
}) {
  const [dragSceneId, setDragSceneId] = useState<string | null>(null);
  const chapterSceneMap = useMemo(() => {
    const map = new Map<string, SceneCard[]>();
    for (const scene of scenes) {
      const key = scene.chapterId || "unassigned";
      const list = map.get(key) || [];
      list.push(scene);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((left, right) => left.order - right.order);
    }
    return map;
  }, [scenes]);

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Manuscript Vision"
            value={book.voiceGuide || "Add a voice guide"}
            icon={Lightbulb}
          />
          <SummaryCard
            title="Style Rules"
            value={book.styleGuide || "Add style guidance"}
            icon={ClipboardList}
          />
          <SummaryCard
            title="Themes"
            value={book.themes?.length ? book.themes.join(", ") : "No themes yet"}
            icon={FolderKanban}
          />
          <SummaryCard
            title="Research Constraints"
            value={book.researchConstraints || "No research constraints"}
            icon={AlertCircle}
          />
        </div>

        {chapters.map((chapter) => {
          const chapterScenes = chapterSceneMap.get(chapter.id) || [];
          const chapterWords = chapterScenes.reduce(
            (total, scene) => total + (scene.actualWords || 0),
            0,
          );
          return (
            <Card key={chapter.id} className="p-5 border-border/60">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <button
                    onClick={() => onOpenChapter(chapter.id)}
                    className="font-serif text-2xl text-left hover:text-primary transition-colors"
                  >
                    Chapter {chapter.index + 1}: {chapter.title || "Untitled Chapter"}
                  </button>
                  <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                    {chapter.actualSummary || chapter.synopsis || "No chapter summary yet."}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{chapterWords.toLocaleString()} scene words</div>
                  <div>{chapterScenes.length} scenes</div>
                </div>
              </div>

              <div
                className="mt-4 grid gap-3 lg:grid-cols-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (!dragSceneId) return;
                  void moveScene(dragSceneId, chapter.id, chapterScenes.length, scenes);
                  setDragSceneId(null);
                }}
              >
                {chapterScenes.map((scene, index) => (
                  <div
                    key={scene.id}
                    draggable
                    onDragStart={() => setDragSceneId(scene.id)}
                    onDragEnd={() => setDragSceneId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!dragSceneId) return;
                      void moveScene(dragSceneId, chapter.id, index, scenes);
                      setDragSceneId(null);
                    }}
                    className={cn(
                      "rounded-xl border border-border/60 bg-background/60 p-4 transition-colors",
                      dragSceneId === scene.id && "border-primary/60 bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{scene.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {sceneStatusLabel(scene.status)}
                          {scene.pov ? ` · POV: ${scene.pov}` : ""}
                          {scene.location ? ` · ${scene.location}` : ""}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => void db.sceneCards.delete(scene.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">
                      {scene.summary || scene.purpose || "No scene summary yet."}
                    </p>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Target {scene.targetWords?.toLocaleString() || 0} · Actual{" "}
                      {scene.actualWords?.toLocaleString() || 0}
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => void addScene(chapter)}
                  className="rounded-xl border border-dashed border-border/70 p-4 text-left text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <Plus className="h-4 w-4 mb-2" />
                  Add scene to Chapter {chapter.index + 1}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CharacterWorkspace({ bookId }: { bookId: string }) {
  const characters = useLiveQuery(
    () => db.characterProfiles.where("bookId").equals(bookId).sortBy("name"),
    [bookId],
  );

  if (!characters) return null;

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-3xl">Character Studio</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Keep role, goals, conflict, and voice notes in one place for manuscript-aware AI
              passes.
            </p>
          </div>
          <Button onClick={() => void addCharacter(bookId)}>
            <Plus className="h-4 w-4 mr-2" /> Add character
          </Button>
        </div>

        {characters.map((character) => (
          <Card key={character.id} className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" />
                <Input
                  value={character.name}
                  onChange={(event) =>
                    void db.characterProfiles.update(character.id, {
                      name: event.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                  className="font-serif text-xl border-0 px-0 shadow-none focus-visible:ring-0"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => void db.characterProfiles.delete(character.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Role">
                <Input
                  value={character.role}
                  onChange={(event) =>
                    void db.characterProfiles.update(character.id, {
                      role: event.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                />
              </Field>
              <Field label="Aliases">
                <Input
                  value={(character.aliases || []).join(", ")}
                  onChange={(event) =>
                    void db.characterProfiles.update(character.id, {
                      aliases: splitCommaList(event.target.value),
                      updatedAt: Date.now(),
                    })
                  }
                  placeholder="Pen name, nickname, title"
                />
              </Field>
              <Field label="Traits">
                <Textarea
                  rows={2}
                  value={character.traits}
                  onChange={(event) =>
                    void db.characterProfiles.update(character.id, {
                      traits: event.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                />
              </Field>
              <Field label="Voice">
                <Textarea
                  rows={2}
                  value={character.voice || ""}
                  onChange={(event) =>
                    void db.characterProfiles.update(character.id, {
                      voice: event.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                />
              </Field>
              <Field label="Goal">
                <Textarea
                  rows={2}
                  value={character.goals || ""}
                  onChange={(event) =>
                    void db.characterProfiles.update(character.id, {
                      goals: event.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                />
              </Field>
              <Field label="Conflict">
                <Textarea
                  rows={2}
                  value={character.conflict || ""}
                  onChange={(event) =>
                    void db.characterProfiles.update(character.id, {
                      conflict: event.target.value,
                      updatedAt: Date.now(),
                    })
                  }
                />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea
                rows={3}
                value={character.notes || ""}
                onChange={(event) =>
                  void db.characterProfiles.update(character.id, {
                    notes: event.target.value,
                    updatedAt: Date.now(),
                  })
                }
              />
            </Field>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ResearchWorkspace({
  bookId,
  notes,
  referenceCount,
}: {
  bookId: string;
  notes: ManuscriptNote[];
  referenceCount: number;
}) {
  const [scope, setScope] = useState<ManuscriptNoteScope>("research");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const groupedNotes = useMemo(() => {
    return {
      research: notes.filter((note) => note.scope === "research"),
      continuity: notes.filter((note) => note.scope === "continuity"),
      editorial: notes.filter((note) => note.scope === "editorial"),
      revision: notes.filter((note) => note.scope === "revision"),
    };
  }, [notes]);

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="Research Notes"
            value={`${groupedNotes.research.length} notes`}
            icon={FolderKanban}
          />
          <SummaryCard
            title="Continuity Notes"
            value={`${groupedNotes.continuity.length} notes`}
            icon={AlertCircle}
          />
          <SummaryCard
            title="References"
            value={`${referenceCount} citations`}
            icon={ClipboardList}
          />
        </div>

        <Card className="p-5 space-y-4">
          <div>
            <h2 className="font-serif text-2xl">Add manuscript note</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Capture research, continuity constraints, and revision guidance at the manuscript
              level.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <Field label="Scope">
              <Select
                value={scope}
                onValueChange={(value) => setScope(value as ManuscriptNoteScope)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="research">Research</SelectItem>
                  <SelectItem value="continuity">Continuity</SelectItem>
                  <SelectItem value="editorial">Editorial</SelectItem>
                  <SelectItem value="revision">Revision</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
          </div>
          <Field label="Content">
            <Textarea
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </Field>
          <Button
            onClick={async () => {
              if (!title.trim() || !content.trim()) return;
              await db.manuscriptNotes.add(
                buildManuscriptNote({
                  bookId,
                  scope,
                  title: title.trim(),
                  content: content.trim(),
                }),
              );
              setTitle("");
              setContent("");
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Save note
          </Button>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {(["research", "continuity", "editorial", "revision"] as ManuscriptNoteScope[]).map(
            (noteScope) => (
              <Card key={noteScope} className="p-5 space-y-3">
                <h3 className="font-serif text-xl capitalize">{noteScope}</h3>
                {(groupedNotes[noteScope] || []).length ? (
                  groupedNotes[noteScope].map((note) => (
                    <div key={note.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{note.title}</div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => void db.manuscriptNotes.delete(note.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                        {note.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No {noteScope} notes yet.</p>
                )}
              </Card>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function RevisionWorkspace({
  bookId,
  tasks,
  chapters,
  onOpenChapter,
}: {
  bookId: string;
  tasks: RevisionTask[];
  chapters: Chapter[];
  onOpenChapter: (chapterId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [chapterId, setChapterId] = useState<string>("none");

  const sortedTasks = useMemo(() => sortRevisionTasks(tasks), [tasks]);

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="Open Tasks"
            value={`${tasks.filter((task) => task.status === "open").length}`}
            icon={ClipboardList}
          />
          <SummaryCard
            title="In Progress"
            value={`${tasks.filter((task) => task.status === "in_progress").length}`}
            icon={AlertCircle}
          />
          <SummaryCard
            title="Done"
            value={`${tasks.filter((task) => task.status === "done").length}`}
            icon={CheckCircle2}
          />
        </div>

        <Card className="p-5 space-y-4">
          <h2 className="font-serif text-2xl">Add revision task</h2>
          <div className="grid gap-4 md:grid-cols-[1fr_180px_220px]">
            <Field label="Task title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Severity">
              <Select
                value={severity}
                onValueChange={(value) => setSeverity(value as typeof severity)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Linked chapter">
              <Select value={chapterId} onValueChange={setChapterId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Whole manuscript</SelectItem>
                  {chapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      Chapter {chapter.index + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Details">
            <Textarea
              rows={3}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
            />
          </Field>
          <Button
            onClick={async () => {
              if (!title.trim() || !details.trim()) return;
              await db.revisionTasks.add(
                buildRevisionTask({
                  bookId,
                  chapterId: chapterId === "none" ? undefined : chapterId,
                  title: title.trim(),
                  details: details.trim(),
                  severity,
                }),
              );
              setTitle("");
              setDetails("");
              setSeverity("medium");
              setChapterId("none");
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Save task
          </Button>
        </Card>

        <div className="space-y-3">
          {sortedTasks.map((task) => {
            const chapter = chapters.find((entry) => entry.id === task.chapterId);
            return (
              <Card key={task.id} className="p-4 border-border/60">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{task.title}</span>
                      <span className={severityClass(task.severity)}>{task.severity}</span>
                      <span className="text-xs text-muted-foreground">
                        {task.status.replace("_", " ")}
                      </span>
                      {chapter && (
                        <button
                          onClick={() => onOpenChapter(chapter.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          Chapter {chapter.index + 1}
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                      {task.details}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={task.status}
                      onValueChange={(value) =>
                        void db.revisionTasks.update(task.id, {
                          status: value as RevisionTaskStatus,
                          updatedAt: Date.now(),
                        })
                      }
                    >
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => void db.revisionTasks.delete(task.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
          {!sortedTasks.length && (
            <Card className="p-6 text-sm text-muted-foreground">
              No revision tasks yet. Generate them from chapter analysis or add them manually here.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: typeof FolderKanban;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs uppercase tracking-wider">{title}</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed">{value}</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

async function addScene(chapter: Chapter) {
  const existing = await db.sceneCards.where("chapterId").equals(chapter.id).sortBy("order");
  const lastOrder = existing[existing.length - 1]?.order ?? chapter.index * 100;
  await db.sceneCards.add({
    id: uid(),
    bookId: chapter.bookId,
    chapterId: chapter.id,
    order: lastOrder + 100,
    title: `Scene ${existing.length + 1}`,
    pov: "",
    purpose: chapter.synopsis || "",
    summary: "",
    location: "",
    timelineNote: "",
    status: "planned",
    targetWords: Math.max(
      300,
      Math.round((chapter.targetWords || 1200) / Math.max(existing.length + 1, 1)),
    ),
    actualWords: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function addCharacter(bookId: string) {
  await db.characterProfiles.add({
    id: uid(),
    bookId,
    name: "New character",
    role: "",
    traits: "",
    goals: "",
    conflict: "",
    voice: "",
    aliases: [],
    notes: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function moveScene(
  sceneId: string,
  targetChapterId: string,
  targetIndex: number,
  scenes: SceneCard[],
) {
  const moving = scenes.find((scene) => scene.id === sceneId);
  if (!moving) return;

  const targetScenes = scenes
    .filter((scene) => scene.chapterId === targetChapterId && scene.id !== sceneId)
    .sort((left, right) => left.order - right.order);

  const reordered = [...targetScenes];
  reordered.splice(targetIndex, 0, { ...moving, chapterId: targetChapterId });

  await Promise.all(
    reordered.map((scene, index) =>
      db.sceneCards.update(scene.id, {
        chapterId: targetChapterId,
        order: index * 100,
        updatedAt: Date.now(),
      }),
    ),
  );
}

function splitCommaList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function severityClass(severity: string) {
  if (severity === "high")
    return "rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive";
  if (severity === "medium")
    return "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700";
  return "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700";
}
