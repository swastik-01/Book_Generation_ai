import {
  FileEdit,
  FileSearch,
  Loader2,
  MessageSquare,
  ScanText,
  Send,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type AppSettings, type SceneCard } from "@/lib/db";
import { providerLabel } from "@/llm/client";
import { cn } from "@/lib/utils";

interface AiPanelProps {
  settings: AppSettings;
  providerOverride: string;
  setProviderOverride: (value: string) => void;
  ready: boolean | undefined;
  busy: string | null;
  onContinue: () => void;
  onBuildSceneBeats: () => void;
  onRewrite: () => void;
  onContinuityPass: () => void;
  onDevelopmentalEdit: () => void;
  onLineEdit: () => void;
  onSummarizeChapter: () => void;
  onCreateRevisionTasks: () => void;
  onChat: () => void;
  rewriteText: string;
  setRewriteText: (value: string) => void;
  rewriteInstr: string;
  setRewriteInstr: (value: string) => void;
  chatMessages: { role: "user" | "assistant"; content: string }[];
  chatInput: string;
  setChatInput: (value: string) => void;
  aiOutput: string;
  canInsert: boolean;
  onInsert: () => void;
  chapterScenes: SceneCard[];
  activeSceneId: string | null;
  setActiveSceneId: (value: string | null) => void;
  onAddScene: () => void;
  onDeleteScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, patch: Partial<SceneCard>) => void;
}

export function AiPanel({
  settings,
  providerOverride,
  setProviderOverride,
  ready,
  busy,
  onContinue,
  onBuildSceneBeats,
  onRewrite,
  onContinuityPass,
  onDevelopmentalEdit,
  onLineEdit,
  onSummarizeChapter,
  onCreateRevisionTasks,
  onChat,
  rewriteText,
  setRewriteText,
  rewriteInstr,
  setRewriteInstr,
  chatMessages,
  chatInput,
  setChatInput,
  aiOutput,
  canInsert,
  onInsert,
  chapterScenes,
  activeSceneId,
  setActiveSceneId,
  onAddScene,
  onDeleteScene,
  onUpdateScene,
}: AiPanelProps) {
  const activeScene =
    chapterScenes.find((scene) => scene.id === activeSceneId) || chapterScenes[0] || null;

  return (
    <aside className="w-[24rem] shrink-0 border-l bg-sidebar/30 glass flex flex-col">
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Sparkles className={cn("h-3.5 w-3.5 text-primary", busy && "animate-pulse")} />
          AI Studio
        </div>
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Active Provider
          </Label>
          <Select value={providerOverride} onValueChange={setProviderOverride}>
            <SelectTrigger className="w-full h-9 text-xs bg-background/50 border-border/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(settings.providers) as Array<keyof typeof settings.providers>).map(
                (provider) => (
                  <SelectItem key={provider} value={provider}>
                    {providerLabel[provider]}
                    {settings.providers[provider].enabled ? "" : " (Disabled)"}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        {!ready && (
          <p className="text-[10px] text-destructive font-medium bg-destructive/10 px-2 py-1 rounded">
            This provider is not enabled. Check Settings.
          </p>
        )}
      </div>

      <Tabs defaultValue="write" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-4 mb-2 grid grid-cols-4 bg-secondary/30 p-1 rounded-lg">
          <TabsTrigger value="write" className="text-[10px] py-1.5">
            <Wand2 className="h-3 w-3 mr-1" />
            Write
          </TabsTrigger>
          <TabsTrigger value="rewrite" className="text-[10px] py-1.5">
            <FileEdit className="h-3 w-3 mr-1" />
            Rewrite
          </TabsTrigger>
          <TabsTrigger value="analysis" className="text-[10px] py-1.5">
            <ScanText className="h-3 w-3 mr-1" />
            Analyze
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-[10px] py-1.5">
            <MessageSquare className="h-3 w-3 mr-1" />
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="write" className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 mt-0">
          <Button className="w-full shadow-sm" disabled={!ready || !!busy} onClick={onContinue}>
            {busy === "continue" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Continue writing
          </Button>
          <Button
            className="w-full"
            variant="outline"
            disabled={!ready || !!busy}
            onClick={onBuildSceneBeats}
          >
            {busy === "scene-beats" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Build scene beats
          </Button>
          <div className="rounded-lg border border-primary/10 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
            Continue writing uses the chapter, scenes, manuscript notes, and open revision tasks.
            Scene beats can replace a thin chapter plan with a practical scene list.
          </div>

          <Card className="p-3 space-y-3 border-border/50 bg-background/40">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Scene context
                </div>
                <div className="font-serif text-lg">Chapter workspace</div>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAddScene}>
                + Add
              </Button>
            </div>

            <div className="space-y-2">
              {chapterScenes.map((scene) => (
                <button
                  key={scene.id}
                  onClick={() => setActiveSceneId(scene.id)}
                  className={cn(
                    "w-full rounded-lg border p-2.5 text-left transition-colors",
                    activeScene?.id === scene.id
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/50 hover:border-primary/30",
                  )}
                >
                  <div className="font-medium text-sm">{scene.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 capitalize">
                    {scene.status}
                  </div>
                </button>
              ))}
              {!chapterScenes.length && (
                <p className="text-xs text-muted-foreground">
                  No scenes yet. Use Build scene beats or add one manually.
                </p>
              )}
            </div>

            {activeScene && (
              <div className="rounded-lg border border-border/50 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={activeScene.title}
                    onChange={(event) =>
                      onUpdateScene(activeScene.id, {
                        title: event.target.value,
                      })
                    }
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => onDeleteScene(activeScene.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={activeScene.status}
                    onValueChange={(value) =>
                      onUpdateScene(activeScene.id, {
                        status: value as SceneCard["status"],
                      })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="drafting">Drafting</SelectItem>
                      <SelectItem value="revising">Revising</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={activeScene.targetWords || 0}
                    onChange={(event) =>
                      onUpdateScene(activeScene.id, {
                        targetWords: Math.max(100, Number(event.target.value) || 0),
                      })
                    }
                    className="h-8 text-xs"
                    placeholder="Target words"
                  />
                </div>

                <Input
                  value={activeScene.pov || ""}
                  onChange={(event) => onUpdateScene(activeScene.id, { pov: event.target.value })}
                  className="h-8 text-xs"
                  placeholder="POV"
                />
                <Input
                  value={activeScene.location || ""}
                  onChange={(event) =>
                    onUpdateScene(activeScene.id, { location: event.target.value })
                  }
                  className="h-8 text-xs"
                  placeholder="Location"
                />
                <Textarea
                  rows={2}
                  value={activeScene.purpose || ""}
                  onChange={(event) =>
                    onUpdateScene(activeScene.id, { purpose: event.target.value })
                  }
                  className="text-xs"
                  placeholder="Purpose"
                />
                <Textarea
                  rows={3}
                  value={activeScene.summary || ""}
                  onChange={(event) =>
                    onUpdateScene(activeScene.id, { summary: event.target.value })
                  }
                  className="text-xs"
                  placeholder="Summary"
                />
                <Textarea
                  rows={2}
                  value={activeScene.timelineNote || ""}
                  onChange={(event) =>
                    onUpdateScene(activeScene.id, { timelineNote: event.target.value })
                  }
                  className="text-xs"
                  placeholder="Timeline note"
                />
              </div>
            )}
          </Card>

          <AiOutput output={aiOutput} canInsert={canInsert} onInsert={onInsert} />
        </TabsContent>

        <TabsContent value="rewrite" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 mt-0">
          <Textarea
            rows={6}
            placeholder="Select text in the editor or paste a passage here to rewrite..."
            value={rewriteText}
            onChange={(event) => setRewriteText(event.target.value)}
            className="text-xs bg-background/50 border-border/40 resize-none font-serif"
          />
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Instruction
            </Label>
            <Input
              value={rewriteInstr}
              onChange={(event) => setRewriteInstr(event.target.value)}
              placeholder="Example: tighten the rhythm and sharpen the imagery"
              className="h-8 text-xs bg-background/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {["Paraphrase", "Tighten", "Make vivid", "Simplify", "Fix grammar", "Add dialogue"].map(
              (preset) => (
                <Button
                  key={preset}
                  size="sm"
                  variant="outline"
                  className="text-[10px] h-7 bg-background/30"
                  onClick={() => setRewriteInstr(preset)}
                >
                  {preset}
                </Button>
              ),
            )}
          </div>
          <Button className="w-full mt-2 shadow-sm" disabled={!ready || !!busy} onClick={onRewrite}>
            {busy === "rewrite" ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileEdit className="h-4 w-4 mr-2" />
            )}
            Rewrite passage
          </Button>
          <AiOutput output={aiOutput} canInsert={canInsert} onInsert={onInsert} />
        </TabsContent>

        <TabsContent value="analysis" className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 mt-0">
          <div className="grid gap-2">
            <ActionButton
              busy={busy === "continuity"}
              disabled={!ready || !!busy}
              icon={FileSearch}
              label="Continuity pass"
              onClick={onContinuityPass}
            />
            <ActionButton
              busy={busy === "developmental"}
              disabled={!ready || !!busy}
              icon={ScanText}
              label="Developmental edit"
              onClick={onDevelopmentalEdit}
            />
            <ActionButton
              busy={busy === "line-edit"}
              disabled={!ready || !!busy}
              icon={FileEdit}
              label="Line edit"
              onClick={onLineEdit}
            />
            <ActionButton
              busy={busy === "summarize"}
              disabled={!ready || !!busy}
              icon={Sparkles}
              label="Summarize chapter"
              onClick={onSummarizeChapter}
            />
            <ActionButton
              busy={busy === "revision-tasks"}
              disabled={!ready || !!busy}
              icon={ScanText}
              label="Create revision tasks"
              onClick={onCreateRevisionTasks}
            />
          </div>
          <div className="rounded-lg border border-accent/20 bg-accent/10 p-3 text-[11px] text-muted-foreground leading-relaxed">
            Analysis actions are manuscript-aware and can create structured revision tasks for the
            chapter rail and manuscript revision board.
          </div>
          <AiOutput output={aiOutput} canInsert={false} onInsert={onInsert} />
        </TabsContent>

        <TabsContent value="chat" className="flex-1 flex flex-col px-4 pb-4 mt-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1 custom-scrollbar">
            {chatMessages.length === 0 && (
              <div className="text-center py-12 px-4">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-xs text-muted-foreground">
                  Ask about character logic, plot continuity, scene transitions, or research
                  discipline.
                </p>
              </div>
            )}
            {chatMessages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "text-sm rounded-2xl p-3.5 shadow-sm border animate-fade-in-up",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground ml-8 border-primary/20"
                    : "bg-secondary/80 backdrop-blur-sm mr-8 border-border/40",
                )}
              >
                <div
                  className={cn(
                    "text-[9px] uppercase tracking-widest font-bold mb-1.5 opacity-70",
                    message.role === "user" ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {message.role}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
                  {message.content ||
                    (busy === "chat" && index === chatMessages.length - 1 ? "Thinking..." : "")}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-3 border-t bg-transparent">
            <Input
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onChat();
                }
              }}
              placeholder="Ask about this chapter..."
              className="bg-background/50 border-border/40 text-sm h-10 rounded-xl"
            />
            <Button
              size="icon"
              onClick={onChat}
              disabled={!ready || busy === "chat"}
              className="rounded-xl h-10 w-10 shrink-0 shadow-sm"
            >
              {busy === "chat" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function ActionButton({
  busy,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  icon: typeof Sparkles;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" className="justify-start" disabled={disabled} onClick={onClick}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Icon className="h-4 w-4 mr-2" />}
      {label}
    </Button>
  );
}

function AiOutput({
  output,
  canInsert,
  onInsert,
}: {
  output: string;
  canInsert: boolean;
  onInsert: () => void;
}) {
  if (!output) return null;
  return (
    <Card className="overflow-hidden border-primary/20 bg-primary/5 animate-fade-in-up">
      <div className="px-3 py-1.5 bg-primary/10 border-b border-primary/10 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
          AI Result
        </span>
        {canInsert && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] text-primary hover:text-primary hover:bg-primary/10"
            onClick={onInsert}
          >
            Insert
          </Button>
        )}
      </div>
      <div className="p-3 text-sm whitespace-pre-wrap font-serif leading-relaxed max-h-80 overflow-y-auto text-foreground/90">
        {output}
      </div>
    </Card>
  );
}
