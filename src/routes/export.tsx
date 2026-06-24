import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Shell } from "@/components/app/Shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/db";
import type { ExportOptions } from "@/lib/export/common";
import { exportPdf } from "@/lib/export/pdf";
import { exportDocx } from "@/lib/export/docx";
import { exportEpub } from "@/lib/export/epub";
import { exportHtml } from "@/lib/export/html";
import { toast } from "sonner";
import { Download, Loader2, BookText, FileType, FileImage, FileCode } from "lucide-react";

export const Route = createFileRoute("/export")({
  component: () => (
    <Shell>
      <ExportPage />
    </Shell>
  ),
});

type Format = "pdf" | "docx" | "epub" | "html";

function ExportPage() {
  const books = useLiveQuery(() => db.books.orderBy("updatedAt").reverse().toArray(), []);
  const [bookId, setBookId] = useState<string | null>(null);
  const [scope, setScope] = useState<ExportOptions["scope"]>("complete");
  const [trim, setTrim] = useState<NonNullable<ExportOptions["trim"]>>("6x9");
  const [busy, setBusy] = useState<Format | null>(null);
  const [progress, setProgress] = useState({ pct: 0, msg: "" });

  useEffect(() => {
    if (!bookId && books?.length) setBookId(books[0].id);
  }, [books, bookId]);

  async function run(fmt: Format) {
    if (!bookId) return;
    setBusy(fmt);
    setProgress({ pct: 0, msg: "" });
    const opts: ExportOptions = {
      scope,
      trim,
      onProgress: (pct, msg) => setProgress({ pct, msg }),
    };
    try {
      if (fmt === "pdf") await exportPdf(bookId, opts);
      else if (fmt === "docx") await exportDocx(bookId, opts);
      else if (fmt === "epub") await exportEpub(bookId, opts);
      else await exportHtml(bookId, opts);
      toast.success(`Exported ${fmt.toUpperCase()}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!books) return <div className="p-10">Loading…</div>;

  return (
    <div className="px-8 py-10 max-w-5xl mx-auto">
      <h1 className="font-serif text-5xl flex items-center gap-3">
        <Download className="h-9 w-9 text-primary" /> Export
      </h1>
      <p className="text-muted-foreground mt-2 max-w-2xl">
        Download your book as a PDF, DOCX, EPUB, or single-file HTML. Everything renders in your
        browser — no upload.
      </p>

      <Card className="mt-8 p-6 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label>Book</Label>
            <Select value={bookId || ""} onValueChange={setBookId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a book" />
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
          <div>
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as ExportOptions["scope"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="complete">
                  Complete book (cover + front + chapters + back)
                </SelectItem>
                <SelectItem value="manuscript">Manuscript only (chapters)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>PDF trim</Label>
            <Select value={trim} onValueChange={(v) => setTrim(v as typeof trim)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6x9">6 × 9 in (trade paperback)</SelectItem>
                <SelectItem value="5x8">5 × 8 in (mass-market)</SelectItem>
                <SelectItem value="A5">A5</SelectItem>
                <SelectItem value="Letter">US Letter</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {busy && (
          <div>
            <div className="h-1 bg-secondary rounded overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round(progress.pct * 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{progress.msg}</p>
          </div>
        )}
      </Card>

      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FormatCard
          icon={FileType}
          title="PDF"
          desc="Print-ready trim sizes with cover and back matter."
          onClick={() => run("pdf")}
          busy={busy === "pdf"}
          disabled={!bookId || !!busy}
        />
        <FormatCard
          icon={FileImage}
          title="DOCX"
          desc="Editable Word manuscript with footnotes."
          onClick={() => run("docx")}
          busy={busy === "docx"}
          disabled={!bookId || !!busy}
        />
        <FormatCard
          icon={BookText}
          title="EPUB 3"
          desc="Reflowable e-book with embedded cover and TOC."
          onClick={() => run("epub")}
          busy={busy === "epub"}
          disabled={!bookId || !!busy}
        />
        <FormatCard
          icon={FileCode}
          title="HTML"
          desc="Single self-contained HTML file for previews."
          onClick={() => run("html")}
          busy={busy === "html"}
          disabled={!bookId || !!busy}
        />
      </div>
    </div>
  );
}

function FormatCard({
  icon: Icon,
  title,
  desc,
  onClick,
  busy,
  disabled,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <Card className="p-5 flex flex-col">
      <Icon className="h-6 w-6 text-primary mb-3" />
      <div className="font-serif text-xl">{title}</div>
      <p className="text-xs text-muted-foreground mt-1 flex-1">{desc}</p>
      <Button className="w-full mt-4" onClick={onClick} disabled={disabled}>
        {busy ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Export {title}
      </Button>
    </Card>
  );
}
