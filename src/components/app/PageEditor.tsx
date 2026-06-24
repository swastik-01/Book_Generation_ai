import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";

interface PageEditorProps {
  pageId: string;
  bookId: string;
  onDelete: () => void;
}

export function PageEditor({ pageId, onDelete }: PageEditorProps) {
  const page = useLiveQuery(() => db.bookPages.get(pageId), [pageId]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (page) setTitle(page.title);
  }, [page]);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Placeholder.configure({ placeholder: "Write this page..." }),
        Image.configure({ inline: false, allowBase64: true }),
      ],
      content: page?.content || "",
      onUpdate: ({ editor: activeEditor }) => {
        void db.bookPages.update(pageId, {
          content: activeEditor.getHTML(),
          updatedAt: Date.now(),
        });
      },
    },
    [pageId],
  );

  useEffect(() => {
    if (!editor || !page) return;
    const nextContent = page.content || "";
    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, { emitUpdate: false });
    }
  }, [editor, page]);

  if (!page) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 animate-fade-in-up sm:px-10 sm:py-10">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold bg-secondary/30 px-2 py-1 rounded">
          {page.section === "front" ? "Front Matter" : "Back Matter"} - {page.kind}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => db.bookPages.update(pageId, { title, updatedAt: Date.now() })}
        className="mb-8 h-auto border-0 bg-transparent px-0 py-1 font-serif text-4xl tracking-tight shadow-none focus-visible:ring-0 sm:text-5xl"
      />
      <div className="prose-container">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
