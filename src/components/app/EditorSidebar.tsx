import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Pin,
  PinOff,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type Book,
  type Chapter,
  type BookPage,
  type BookPageKind,
  type ChapterStatus,
} from "@/lib/db";
import { cn } from "@/lib/utils";
import React, { useState } from "react";

interface EditorSidebarProps {
  book: Book;
  chapters: Chapter[];
  frontPages: BookPage[];
  backPages: BookPage[];
  active: { kind: "chapter" | "page"; id: string } | null;
  setActive: (target: { kind: "chapter" | "page"; id: string }) => void;
  addChapter: () => void;
  addPage: (section: "front" | "back", kind: BookPageKind, label: string) => void;
  regenerateToc: (useAi?: boolean) => void;
  totalWords: number;
  totalTarget: number;
}

const FRONT_KINDS: { kind: BookPageKind; label: string }[] = [
  { kind: "title-page", label: "Title page" },
  { kind: "copyright", label: "Copyright" },
  { kind: "dedication", label: "Dedication" },
  { kind: "toc", label: "Table of Contents" },
  { kind: "prologue", label: "Prologue" },
  { kind: "custom", label: "Custom page" },
];

const BACK_KINDS: { kind: BookPageKind; label: string }[] = [
  { kind: "epilogue", label: "Epilogue" },
  { kind: "acknowledgements", label: "Acknowledgements" },
  { kind: "about-author", label: "About the Author" },
  { kind: "back-cover", label: "Back cover blurb" },
  { kind: "custom", label: "Custom page" },
];

export function EditorSidebar({
  book,
  chapters,
  frontPages,
  backPages,
  active,
  setActive,
  addChapter,
  addPage,
  regenerateToc,
  totalWords,
  totalTarget,
}: EditorSidebarProps) {
  const navigate = useNavigate();
  const [isPinned, setIsPinned] = useState(false);
  const [openFront, setOpenFront] = useState(true);
  const [openBack, setOpenBack] = useState(true);
  const tocPage = frontPages.find((page) => page.kind === "toc");

  const pct = Math.min(100, totalTarget ? (totalWords / totalTarget) * 100 : 0);

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col overflow-hidden border-r bg-sidebar/50 transition-[width] duration-300 ease-in-out glass group/rail lg:flex",
        isPinned ? "w-72" : "w-16 hover:w-72 focus-within:w-72",
      )}
    >
      <div className="p-4 border-b relative">
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors mb-3 group/back"
        >
          <ArrowLeft className="h-3 w-3 group-hover/back:-translate-x-0.5 transition-transform" />
          <span className="hidden group-hover/rail:inline group-focus-within/rail:inline group-[.w-72]/rail:inline">
            Library
          </span>
        </button>

        <div className="flex items-center gap-2">
          <div className="font-serif text-xl leading-tight truncate flex-1 hidden group-hover/rail:block group-focus-within/rail:block group-[.w-72]/rail:block">
            {book.title}
          </div>
          <div className="hidden group-hover/rail:flex group-focus-within/rail:flex group-[.w-72]/rail:flex gap-1">
            <button
              onClick={() => setIsPinned(!isPinned)}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
              title={isPinned ? "Unpin sidebar" : "Pin sidebar"}
            >
              {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
            <Link
              to="/book/$bookId/read"
              params={{ bookId: book.id }}
              title="Read Mode"
              className="p-1.5 rounded hover:bg-secondary text-primary transition-colors"
            >
              <BookMarked className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-3 hidden group-hover/rail:block group-focus-within/rail:block group-[.w-72]/rail:block animate-fade-in-up">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Progress</span>
            <span>
              {totalWords.toLocaleString()} / {totalTarget.toLocaleString()} words
            </span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <SidebarSection
          title="Front matter"
          open={openFront}
          onToggle={() => setOpenFront(!openFront)}
          kinds={FRONT_KINDS}
          onAdd={(k, l) => addPage("front", k, l)}
        >
          <div className="px-2 py-2 mb-2 rounded-md border border-border/40 bg-background/40">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              TOC tools
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={() => regenerateToc(true)}
              >
                <Sparkles className="h-3 w-3 mr-1.5" />
                AI generate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] px-2"
                onClick={() => regenerateToc(false)}
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Refresh
              </Button>
            </div>
            {!tocPage && (
              <p className="text-[10px] text-muted-foreground mt-2">
                No TOC page yet. Generate will create one.
              </p>
            )}
          </div>
          {(frontPages || []).map((p) => (
            <PageRow
              key={p.id}
              page={p}
              active={active?.kind === "page" && active.id === p.id}
              onClick={() => setActive({ kind: "page", id: p.id })}
            />
          ))}
        </SidebarSection>

        <div className="px-3 mt-5 mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" />
            <span className="hidden group-hover/rail:inline group-focus-within/rail:inline group-[.w-72]/rail:inline">
              Chapters
            </span>
          </span>
        </div>

        <div className="space-y-0.5 pb-4">
          {chapters.map((c, i) => {
            const showPart = c.partTitle && (i === 0 || chapters[i - 1].partTitle !== c.partTitle);
            return (
              <div key={c.id}>
                {showPart && (
                  <div className="px-3 pt-6 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 flex items-center gap-2 overflow-hidden">
                    <span className="shrink-0">{c.partTitle}</span>
                    <div className="h-[1px] w-full bg-primary/10" />
                  </div>
                )}
                <button
                  onClick={() => setActive({ kind: "chapter", id: c.id })}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm flex items-start gap-2 group/row transition-all duration-200",
                    active?.kind === "chapter" && active.id === c.id
                      ? "bg-primary/15 text-primary shadow-sm"
                      : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
                  )}
                  title={c.title || `Chapter ${c.index + 1}`}
                >
                  <span className="text-[10px] font-mono opacity-50 w-4 mt-1 shrink-0">
                    {c.index + 1}
                  </span>
                  <div className="flex-1 min-w-0 hidden group-hover/rail:block group-focus-within/rail:block group-[.w-72]/rail:block">
                    <div className="font-serif truncate font-medium">
                      {c.title || "Untitled Chapter"}
                    </div>
                    <div className="text-[9px] opacity-70 mt-0.5">
                      {c.wordCount.toLocaleString()} words - {c.status}
                    </div>
                  </div>
                  <StatusDot status={c.status} />
                </button>
              </div>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start mt-3 h-8 text-xs hover:bg-primary/5 hover:text-primary transition-all hidden group-hover/rail:flex group-focus-within/rail:flex group-[.w-72]/rail:flex"
          onClick={addChapter}
        >
          <Plus className="h-3.5 w-3.5 mr-2" /> Add chapter
        </Button>

        <SidebarSection
          title="Back matter"
          open={openBack}
          onToggle={() => setOpenBack(!openBack)}
          kinds={BACK_KINDS}
          onAdd={(k, l) => addPage("back", k, l)}
          className="mt-6"
        >
          {(backPages || []).map((p) => (
            <PageRow
              key={p.id}
              page={p}
              active={active?.kind === "page" && active.id === p.id}
              onClick={() => setActive({ kind: "page", id: p.id })}
            />
          ))}
        </SidebarSection>
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  open,
  onToggle,
  kinds,
  onAdd,
  children,
  className,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  kinds: { kind: BookPageKind; label: string }[];
  onAdd: (k: BookPageKind, label: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div
      className={cn(
        "hidden group-hover/rail:block group-focus-within/rail:block group-[.w-72]/rail:block",
        className,
      )}
    >
      <button
        onClick={onToggle}
        className="w-full px-3 mt-1 mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5 hover:text-primary transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>{title}</span>
      </button>
      {open && (
        <div className="space-y-0.5">
          {children}
          {adding ? (
            <div className="px-2 py-2 mt-1 bg-secondary/30 rounded-md border border-border/40 animate-fade-in-up">
              <div className="grid grid-cols-1 gap-1">
                {kinds.map((k) => (
                  <button
                    key={k.label}
                    onClick={() => {
                      onAdd(k.kind, k.label);
                      setAdding(false);
                    }}
                    className="w-full text-left text-[11px] px-2 py-1 rounded hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setAdding(false)}
                className="w-full text-center text-[9px] mt-2 py-1 text-muted-foreground hover:text-foreground transition-colors border-t border-border/20 pt-1.5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-[11px] h-7 text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all mt-1"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3 w-3 mr-1.5" /> Add page
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PageRow({
  page,
  active,
  onClick,
  extra,
}: {
  page: BookPage;
  active: boolean;
  onClick: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "w-full text-left px-3 py-1.5 rounded-md text-sm flex items-center gap-2 group/row transition-colors cursor-pointer select-none outline-none focus-visible:ring-1 focus-visible:ring-primary",
        active
          ? "bg-primary/10 text-primary"
          : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="font-serif truncate flex-1">{page.title}</span>
      {extra}
    </div>
  );
}

function StatusDot({ status }: { status: ChapterStatus }) {
  const color =
    status === "final"
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
      : status === "edited"
        ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
        : "bg-muted-foreground/30";
  return <span className={cn("h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 transition-all", color)} />;
}
