import { useState } from "react";
import { Loader2, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type AppSettings } from "@/lib/db";
import { streamLLM } from "@/llm/client";
import {
  addReference,
  citationPrompt,
  nextLabel,
  parseCitationResponse,
  type CitationStyle,
} from "@/lib/references";
import { toast } from "sonner";

interface ReferenceDialogProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  bookId: string;
  chapterId: string;
  provider: AppSettings["providers"][keyof AppSettings["providers"]] | undefined;
  onInserted: (refId: string, label: string, kind: "footnote" | "endnote") => void;
}

export function ReferenceDialog({
  open,
  onOpenChange,
  bookId,
  chapterId,
  provider,
  onInserted,
}: ReferenceDialogProps) {
  const [kind, setKind] = useState<"footnote" | "endnote">("footnote");
  const [citation, setCitation] = useState("");
  const [url, setUrl] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [style, setStyle] = useState<CitationStyle>("APA");
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!provider?.enabled) {
      toast.error("Enable an AI provider in the AI Panel to format citations");
      return;
    }
    if (!aiQuery.trim()) return;
    setBusy(true);
    let out = "";
    try {
      await streamLLM(
        provider,
        {
          messages: [{ role: "user", content: citationPrompt(aiQuery, style) }],
        },
        (c) => {
          out += c;
        },
      );
      const parsed = parseCitationResponse(out);
      if (!parsed) {
        toast.error("AI did not return a usable citation. Edit it manually.");
        return;
      }
      setCitation(parsed.citation);
      if (parsed.url) setUrl(parsed.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!citation.trim()) {
      toast.error("Enter or generate a citation first");
      return;
    }
    const label = await nextLabel(bookId);
    const ref = await addReference({
      bookId,
      chapterId,
      citation: citation.trim(),
      url: url.trim() || undefined,
      kind,
      label,
    });
    onInserted(ref.id, ref.label, kind);
    setCitation("");
    setUrl("");
    setAiQuery("");
    toast.success(`Reference [${label}] added`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto glass sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Add Reference</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Reference Type
              </Label>
              <Select value={kind} onValueChange={(v) => setKind(v as "footnote" | "endnote")}>
                <SelectTrigger className="bg-background/50 border-border/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="footnote">Footnote (Chapter bottom)</SelectItem>
                  <SelectItem value="endnote">Endnote (References page)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Citation Style
              </Label>
              <Select value={style} onValueChange={(v) => setStyle(v as CitationStyle)}>
                <SelectTrigger className="bg-background/50 border-border/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APA">APA</SelectItem>
                  <SelectItem value="MLA">MLA</SelectItem>
                  <SelectItem value="Chicago">Chicago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              AI Helper (Paste raw info)
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder="Paste a URL or raw citation text…"
                className="bg-background/50 border-border/40"
              />
              <Button
                size="sm"
                className="w-full sm:w-auto"
                onClick={generate}
                disabled={busy || !aiQuery.trim()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Quote className="h-4 w-4 mr-2" />
                )}
                Format
              </Button>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-border/20">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Formatted Citation
              </Label>
              <Input
                value={citation}
                onChange={(e) => setCitation(e.target.value)}
                placeholder="Smith, J. (2024). The Art of AI..."
                className="bg-background/50 border-border/40 font-serif"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                URL (Optional)
              </Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/source"
                className="bg-background/50 border-border/40"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} className="px-8 shadow-md">
            Insert Reference
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
