import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Shell } from "@/components/app/Shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  db,
  getSettings,
  uid,
  type AppSettings,
  type BookAsset,
  type BookAssetKind,
} from "@/lib/db";
import { providerLabel } from "@/llm/client";
import {
  generateImage,
  ImageNotSupportedError,
  svgToPngDataUrl,
  IMAGE_CAPABLE_PROVIDERS,
} from "@/llm/images";
import { renderCoverSvg, COVER_LAYOUTS, COVER_PALETTES, type CoverFace } from "@/lib/cover-designs";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Wand2,
  Download,
  Trash2,
  Upload,
} from "lucide-react";

export const Route = createFileRoute("/cover-studio")({
  component: () => (
    <Shell>
      <CoverStudio />
    </Shell>
  ),
});

function CoverStudio() {
  const books = useLiveQuery(() => db.books.orderBy("updatedAt").reverse().toArray(), []);
  const [bookId, setBookId] = useState<string | null>(null);
  useEffect(() => {
    if (!bookId && books?.length) setBookId(books[0].id);
  }, [books, bookId]);

  if (!books) return <div className="p-10">Loading…</div>;
  if (!books.length) {
    return (
      <div className="px-8 py-10 max-w-3xl mx-auto">
        <h1 className="font-serif text-5xl">Cover Studio</h1>
        <Card className="mt-8 p-16 text-center border-dashed">
          <ImageIcon className="h-12 w-12 mx-auto text-primary/40" />
          <p className="mt-4 font-serif text-xl">Create a book first</p>
          <p className="text-sm text-muted-foreground mt-2">
            Generate or import a book and you'll be able to design its cover here.
          </p>
        </Card>
      </div>
    );
  }

  const book = books.find((b) => b.id === bookId) || books[0];

  return (
    <div className="px-8 py-10 max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-5xl">Cover Studio</h1>
          <p className="text-muted-foreground mt-2">
            Design front, back, and spine covers — by hand or with AI.
          </p>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Book</Label>
          <Select value={book.id} onValueChange={setBookId}>
            <SelectTrigger className="w-72 mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {books.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="front" className="mt-8">
        <TabsList>
          <TabsTrigger value="front">Front cover</TabsTrigger>
          <TabsTrigger value="back">Back cover</TabsTrigger>
          <TabsTrigger value="spine">Spine</TabsTrigger>
        </TabsList>
        <TabsContent value="front">
          <FaceEditor key={`f-${book.id}`} bookId={book.id} face="front" book={book} />
        </TabsContent>
        <TabsContent value="back">
          <FaceEditor key={`b-${book.id}`} bookId={book.id} face="back" book={book} />
        </TabsContent>
        <TabsContent value="spine">
          <FaceEditor key={`s-${book.id}`} bookId={book.id} face="spine" book={book} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FaceEditor({
  bookId,
  face,
  book,
}: {
  bookId: string;
  face: CoverFace;
  book: {
    id: string;
    title: string;
    genre: string[];
    premise?: string;
    coverDataUrl?: string;
    authorName?: string;
  };
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    getSettings().then(setSettings);
  }, []);
  const [tab, setTab] = useState<"designer" | "ai">("designer");

  // Designer fields
  const [layout, setLayout] = useState<string>(COVER_LAYOUTS[0].id);
  const [palette, setPalette] = useState<string>(COVER_PALETTES[0].id);
  const [customPalette, setCustomPalette] = useState({
    bg: "#3a2a1f",
    accent: "#c9b99a",
    ink: "#faf8f5",
  });
  const useCustom = palette === "__custom";
  const [title, setTitle] = useState(book.title || "");
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState(book.authorName || settings?.authorName || "");
  const [blurb, setBlurb] = useState(book.premise || "");
  useEffect(() => {
    setAuthor(book.authorName || settings?.authorName || "");
  }, [settings, book.authorName]);
  useEffect(() => {
    setTitle(book.title || "");
    setBlurb(book.premise || "");
  }, [book.id, book.title, book.premise]);

  async function saveAuthor(name: string) {
    setAuthor(name);
    await db.books.update(bookId, { authorName: name, updatedAt: Date.now() });
  }

  const palCfg = useCustom
    ? { id: "__custom", name: "Custom", ...customPalette }
    : COVER_PALETTES.find((p) => p.id === palette) || COVER_PALETTES[0];
  const svg = useMemo(
    () =>
      renderCoverSvg({
        face,
        layout,
        title,
        subtitle,
        author,
        blurb,
        bg: palCfg.bg,
        accent: palCfg.accent,
        ink: palCfg.ink,
      }),
    [face, layout, title, subtitle, author, blurb, palCfg],
  );
  const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  // AI fields
  const [aiPrompt, setAiPrompt] = useState(
    `Book cover art for "${book.title}". Genre: ${book.genre?.join(", ") || "literary"}. ${book.premise || ""}. Atmospheric, painterly, award-winning, suitable for a hardcover.`,
  );
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProvider, setAiProvider] = useState<"openai" | "google">("openai");
  useEffect(() => {
    if (!settings) return;
    if (settings.defaultProvider === "google") setAiProvider("google");
    else if (settings.defaultProvider === "openai") setAiProvider("openai");
  }, [settings]);

  const assets = useLiveQuery(
    () => db.bookAssets.where("[bookId+kind]").equals([bookId, face]).toArray(),
    [bookId, face],
  );

  async function saveDesigner() {
    try {
      const w = face === "spine" ? 240 : 1200;
      const h = 1800;
      const dataUrl = await svgToPngDataUrl(svg, w, h);
      await saveAsset(
        bookId,
        face,
        dataUrl,
        `Designer · ${COVER_LAYOUTS.find((l) => l.id === layout)?.name}`,
      );
      if (face === "front")
        await db.books.update(bookId, { coverDataUrl: dataUrl, updatedAt: Date.now() });
      toast.success("Saved cover");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function generateAi() {
    if (!settings) return;
    const provider = settings.providers[aiProvider];
    if (!provider?.enabled) {
      toast.error(`${providerLabel[aiProvider]} is not enabled. Configure it in Settings.`);
      return;
    }
    setAiBusy(true);
    try {
      const size = face === "spine" ? "1024x1792" : face === "back" ? "1024x1792" : "1024x1792";
      const dataUrl = await generateImage(provider, aiPrompt, { size: size as "1024x1792" });
      await saveAsset(bookId, face, dataUrl, aiPrompt);
      if (face === "front")
        await db.books.update(bookId, { coverDataUrl: dataUrl, updatedAt: Date.now() });
      toast.success("Cover generated");
    } catch (e) {
      if (e instanceof ImageNotSupportedError) toast.error(e.message);
      else toast.error((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function uploadCover(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      await saveAsset(bookId, face, dataUrl, "Uploaded");
      if (face === "front")
        await db.books.update(bookId, { coverDataUrl: dataUrl, updatedAt: Date.now() });
      toast.success("Image uploaded");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mt-6">
      <Card className="p-6 flex items-center justify-center bg-secondary/30 min-h-[600px]">
        <img
          src={svgDataUrl}
          alt="cover preview"
          className={face === "spine" ? "h-[600px]" : "max-h-[600px] max-w-full"}
        />
      </Card>

      <div className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "designer" | "ai")}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="designer">Designer</TabsTrigger>
            <TabsTrigger value="ai">AI image</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>
          <TabsContent value="designer" className="space-y-3">
            <div>
              <Label>Layout</Label>
              <Select value={layout} onValueChange={setLayout}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COVER_LAYOUTS.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Palette</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5 max-h-64 overflow-y-auto pr-1">
                {COVER_PALETTES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPalette(p.id)}
                    className={`rounded-md border-2 p-2 transition ${palette === p.id ? "border-primary" : "border-border hover:border-accent"}`}
                    title={p.name}
                  >
                    <div
                      className="h-10 rounded"
                      style={{ background: `linear-gradient(135deg, ${p.bg}, ${p.accent})` }}
                    />
                    <div className="text-[10px] mt-1 text-muted-foreground truncate">{p.name}</div>
                  </button>
                ))}
                <button
                  onClick={() => setPalette("__custom")}
                  className={`rounded-md border-2 border-dashed p-2 transition ${useCustom ? "border-primary" : "border-border hover:border-accent"}`}
                  title="Custom"
                >
                  <div
                    className="h-10 rounded"
                    style={{
                      background: `linear-gradient(135deg, ${customPalette.bg}, ${customPalette.accent})`,
                    }}
                  />
                  <div className="text-[10px] mt-1 text-muted-foreground truncate">Custom</div>
                </button>
              </div>
              {useCustom && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {(["bg", "accent", "ink"] as const).map((k) => (
                    <div key={k}>
                      <Label className="text-[10px] capitalize">
                        {k === "bg" ? "Background" : k === "ink" ? "Text" : "Accent"}
                      </Label>
                      <input
                        type="color"
                        value={customPalette[k]}
                        onChange={(e) =>
                          setCustomPalette({ ...customPalette, [k]: e.target.value })
                        }
                        className="w-full h-9 rounded border"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            {face === "front" && (
              <div>
                <Label>Subtitle</Label>
                <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
              </div>
            )}
            <div>
              <Label>Author</Label>
              <Input
                value={author}
                onChange={(e) => saveAuthor(e.target.value)}
                placeholder="Your name (saved with this book)"
              />
            </div>
            {face === "back" && (
              <div>
                <Label>Back cover blurb</Label>
                <Textarea rows={6} value={blurb} onChange={(e) => setBlurb(e.target.value)} />
              </div>
            )}
            <Button className="w-full" onClick={saveDesigner}>
              <Download className="h-4 w-4 mr-2" /> Save as PNG
            </Button>
          </TabsContent>
          <TabsContent value="ai" className="space-y-3">
            <div>
              <Label>Provider</Label>
              <Select
                value={aiProvider}
                onValueChange={(v) => setAiProvider(v as "openai" | "google")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI · gpt-image-1</SelectItem>
                  <SelectItem value="google">Google · Imagen 3</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Anthropic, Azure, and local providers don't support image generation — use Designer
                mode for those.
              </p>
            </div>
            <div>
              <Label>Prompt</Label>
              <Textarea rows={6} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
            </div>
            <Button className="w-full" disabled={aiBusy} onClick={generateAi}>
              {aiBusy ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Generate image
            </Button>
          </TabsContent>
          <TabsContent value="upload" className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Upload your own artwork — it becomes the {face} cover for this book. Recommended:
              1200×1800 PNG or JPG.
            </p>
            <label className="block border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:border-primary transition">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
              <div className="mt-2 text-sm">Click to choose an image</div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadCover(f);
                }}
              />
            </label>
          </TabsContent>
        </Tabs>

        {assets && assets.length > 0 && (
          <Card className="p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Saved {face} covers
            </div>
            <div className="grid grid-cols-3 gap-2">
              {assets.map((a) => (
                <div key={a.id} className="relative group">
                  <img
                    src={a.dataUrl}
                    className="w-full aspect-[2/3] object-cover rounded border"
                    alt=""
                  />
                  <button
                    onClick={async () => {
                      if (face === "front")
                        await db.books.update(bookId, {
                          coverDataUrl: a.dataUrl,
                          updatedAt: Date.now(),
                        });
                      toast.success(face === "front" ? "Set as book cover" : "Active");
                    }}
                    className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition rounded text-[10px] text-background opacity-0 group-hover:opacity-100"
                  >
                    {face === "front" ? "Use as cover" : "Use"}
                  </button>
                  <button
                    onClick={() => db.bookAssets.delete(a.id)}
                    className="absolute top-1 right-1 bg-background/80 rounded p-0.5 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

async function saveAsset(bookId: string, kind: BookAssetKind, dataUrl: string, prompt?: string) {
  const asset: BookAsset = {
    id: uid(),
    bookId,
    kind,
    dataUrl,
    prompt,
    createdAt: Date.now(),
  };
  await db.bookAssets.add(asset);
}
