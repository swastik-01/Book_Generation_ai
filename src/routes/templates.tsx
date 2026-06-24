import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileText, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "@/components/app/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db, getSettings, uid, type BookTemplate } from "@/lib/db";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import { callLLM } from "@/llm/client";
import { SYS_NOVELIST } from "@/lib/prompts";

export const Route = createFileRoute("/templates")({
  component: () => (
    <Shell>
      <TemplatesPage />
    </Shell>
  ),
});

function TemplatesPage() {
  const navigate = useNavigate();
  const customTemplates = useLiveQuery(() => db.templates.toArray(), []);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);

  function applyTemplate(template: BookTemplate | (typeof BUILTIN_TEMPLATES)[number]) {
    try {
      window.sessionStorage.setItem("quill.draftSeed", JSON.stringify(template.draft));
    } catch {
      /* ignore */
    }
    navigate({ to: "/new" });
  }

  async function generateTemplate() {
    if (!idea.trim()) {
      toast.error("Describe the kind of book first");
      return;
    }
    setBusy(true);
    try {
      const settings = await getSettings();
      const provider = settings.providers[settings.defaultProvider];
      if (!provider?.enabled) {
        throw new Error("No AI provider is enabled. Configure one in Settings.");
      }

      const result = await callLLM(provider, {
        messages: [
          { role: "system", content: SYS_NOVELIST },
          {
            role: "user",
            content: `Build a starter template for a book idea. Return ONLY a JSON object (no markdown):
{
  "name":"short template name",
  "description":"one sentence summary of the template",
  "draft":{
    "title":"suggested title",
    "genre":["one or more genres"],
    "subgenre":"subgenre or vibe",
    "tone":"tone descriptors",
    "audience":"target audience",
    "pov":"First person | Third person limited | etc",
    "tense":"Past | Present",
    "arc":"Three-Act | Hero's Journey | Save the Cat | Five-Act | Custom",
    "targetChapters":14,
    "targetWordsPerChapter":3000,
    "premise":"two-three sentence premise",
    "setting":"setting notes",
    "voiceGuide":"voice promises",
    "styleGuide":"sentence and craft rules",
    "themes":["theme one","theme two"],
    "compTitles":["comp one","comp two"],
    "researchConstraints":"optional research rules",
    "characters":[{"name":"","role":"","traits":""}]
  }
}

Book idea: ${idea}`,
          },
        ],
      });

      const parsed = safeJson(result.text) as Partial<BookTemplate> | null;
      if (!parsed?.draft || !parsed.name) {
        throw new Error("AI did not return a valid template");
      }

      const template: BookTemplate = {
        id: uid(),
        name: parsed.name,
        description: parsed.description || "",
        builtin: false,
        draft: parsed.draft,
        createdAt: Date.now(),
      };
      await db.templates.add(template);
      setIdea("");
      toast.success(`Saved template "${template.name}"`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-8 py-10 max-w-6xl mx-auto">
      <h1 className="font-serif text-5xl">Templates</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">
        Genre starter packs that pre-fill the wizard with premise, characters, arc, manuscript
        voice, and chapter targets. Pick one and refine it your way.
      </p>

      <Card className="p-5 mt-8 bg-secondary/40 border-primary/20">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-xl">Generate a custom template</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Describe the kind of book you want and AI will draft a reusable starter.
        </p>
        <div className="flex gap-2">
          <Input
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            placeholder="Example: a noir set in a city built inside a glacier"
          />
          <Button onClick={generateTemplate} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
      </Card>

      <h2 className="font-serif text-2xl mt-10 mb-4">Built-in starter packs</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BUILTIN_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            name={template.name}
            description={template.description}
            chapters={template.draft.targetChapters || 0}
            wordsPerChapter={template.draft.targetWordsPerChapter || 0}
            onUse={() => applyTemplate({ ...template, createdAt: 0 } as BookTemplate)}
          />
        ))}
      </div>

      {customTemplates && customTemplates.length > 0 && (
        <>
          <h2 className="font-serif text-2xl mt-10 mb-4">Your saved templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                name={template.name}
                description={template.description}
                chapters={template.draft.targetChapters || 0}
                wordsPerChapter={template.draft.targetWordsPerChapter || 0}
                onUse={() => applyTemplate(template)}
                onDelete={() => void db.templates.delete(template.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TemplateCard({
  name,
  description,
  chapters,
  wordsPerChapter,
  onUse,
  onDelete,
}: {
  name: string;
  description: string;
  chapters: number;
  wordsPerChapter: number;
  onUse: () => void;
  onDelete?: () => void;
}) {
  return (
    <Card className="p-5 hover:border-primary/40 transition flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-xl">{name}</h3>
        </div>
        {onDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2 -mt-1" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-2 flex-1">{description}</p>
      <div className="text-[11px] text-muted-foreground mt-3">
        {chapters} ch · ~{wordsPerChapter.toLocaleString()} words / chapter
      </div>
      <Button className="mt-3 w-full" variant="outline" onClick={onUse}>
        Use this template
      </Button>
    </Card>
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* ignore */
  }
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* ignore */
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}
