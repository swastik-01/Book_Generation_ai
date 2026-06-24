import { useState, useEffect } from "react";
import { type Editor } from "@tiptap/react";
import { Loader2, Wand2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { db, uid, type AppSettings, type BookAsset } from "@/lib/db";
import { generateImage, ImageNotSupportedError } from "@/llm/images";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";

interface ImageInsertDialogProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  bookId: string;
  provider: AppSettings["providers"][keyof AppSettings["providers"]] | undefined;
  editor: Editor | null;
  onInsert: (dataUrl: string) => void;
}

export function ImageInsertDialog({
  open,
  onOpenChange,
  bookId,
  provider,
  editor,
  onInsert,
}: ImageInsertDialogProps) {
  const [aiPrompt, setAiPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const gallery = useLiveQuery(
    () => db.bookAssets.where("bookId").equals(bookId).toArray(),
    [bookId, open],
  );

  useEffect(() => {
    if (open && editor) {
      const sel = editor.state.selection;
      const recent = editor.state.doc.textBetween(Math.max(0, sel.from - 600), sel.from, " ");
      if (recent.trim()) {
        setAiPrompt(
          `An evocative editorial illustration. Style: charcoal and watercolor sketch, muted tones, literary mood. Scene: ${recent.trim().slice(-400)}`,
        );
      }
    }
  }, [open, editor]);

  async function uploadFile(f: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      await db.bookAssets.add({
        id: uid(),
        bookId,
        kind: "interior",
        dataUrl,
        createdAt: Date.now(),
      });
      onInsert(dataUrl);
    };
    reader.readAsDataURL(f);
  }

  async function generateAi() {
    if (!provider) {
      toast.error("Select an AI provider in the AI Panel first");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await generateImage(provider, aiPrompt);
      await db.bookAssets.add({
        id: uid(),
        bookId,
        kind: "interior",
        dataUrl,
        prompt: aiPrompt,
        createdAt: Date.now(),
      });
      onInsert(dataUrl);
    } catch (e) {
      if (e instanceof ImageNotSupportedError) toast.error(e.message);
      else toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto glass sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Insert Illustration</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="ai" className="mt-2">
          <TabsList className="grid grid-cols-3 bg-secondary/40">
            <TabsTrigger value="ai">AI Generator</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="py-6 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Image Prompt
              </label>
              <Textarea
                rows={5}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Describe the scene you want to illustrate…"
                className="bg-background/50 border-border/40 font-serif leading-relaxed"
              />
            </div>
            <p className="text-[10px] text-muted-foreground italic bg-secondary/20 p-2 rounded">
              Tip: Include style keywords like "minimalist linework", "moody oil painting", or
              "vintage lithograph" for better results.
            </p>
            <Button
              className="w-full shadow-md"
              onClick={generateAi}
              disabled={busy || !aiPrompt.trim()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Generate with AI
            </Button>
          </TabsContent>

          <TabsContent value="upload" className="py-6 sm:py-8">
            <div className="group relative cursor-pointer rounded-xl border-2 border-dashed border-border/40 p-6 text-center transition-colors hover:border-primary/40 sm:p-10">
              <Input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                }}
              />
              <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-4" />
              <p className="text-sm font-medium">Click to upload or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">PNG, JPG or WebP up to 5MB</p>
            </div>
          </TabsContent>

          <TabsContent value="gallery" className="py-4">
            {(gallery || []).length === 0 ? (
              <div className="py-20 text-center bg-secondary/10 rounded-xl border border-dashed">
                <p className="text-sm text-muted-foreground">Your gallery is empty.</p>
              </div>
            ) : (
              <div className="custom-scrollbar grid max-h-96 grid-cols-2 gap-3 overflow-y-auto pr-2 sm:grid-cols-3">
                {(gallery || []).map((a: BookAsset) => (
                  <button
                    key={a.id}
                    onClick={() => onInsert(a.dataUrl)}
                    className="group relative border rounded-lg overflow-hidden hover:border-primary transition-all shadow-sm hover:shadow-md"
                  >
                    <img
                      src={a.dataUrl}
                      alt=""
                      className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-[10px] bg-background px-2 py-1 rounded shadow-sm font-bold uppercase tracking-widest">
                        Select
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
