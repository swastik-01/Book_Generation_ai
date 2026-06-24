import { Link, useLocation } from "@tanstack/react-router";
import {
  BookOpen,
  Home,
  Settings,
  Sparkles,
  Image as ImageIcon,
  FileText,
  ShieldCheck,
  Download,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const nav = [
  { to: "/", label: "Library", icon: Home },
  { to: "/new", label: "New Book", icon: Sparkles },
  { to: "/templates", label: "Templates", icon: FileText },
  { to: "/cover-studio", label: "Cover Studio", icon: ImageIcon },
  { to: "/plagiarism", label: "Plagiarism", icon: ShieldCheck },
  { to: "/export", label: "Export", icon: Download },
  { to: "/settings/ai", label: "AI Providers", icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const isBookView = loc.pathname.startsWith("/book/");

  return (
    <div className="min-h-screen flex bg-background selection:bg-primary/20">
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col border-r transition-all duration-300 ease-in-out",
          isBookView ? "w-[72px]" : "w-64",
          "bg-sidebar/40 backdrop-blur-xl",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center border-b border-border/40",
            isBookView ? "h-[72px]" : "h-20 p-6",
          )}
        >
          <Link to="/" className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            {!isBookView && (
              <div className="flex flex-col">
                <span className="font-serif text-2xl tracking-tighter font-bold">Quill</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold -mt-1">
                  Atelier
                </span>
              </div>
            )}
          </Link>
        </div>

        <nav className={cn("flex-1 py-6 space-y-2", isBookView ? "px-3" : "px-4")}>
          {nav.map((n) => {
            const Icon = n.icon;
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                title={n.label}
                className={cn(
                  "flex items-center transition-all duration-200 rounded-xl group",
                  isBookView ? "justify-center h-12 w-12" : "gap-3 px-4 py-3",
                  active
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0 transition-transform group-hover:scale-110",
                    active ? "scale-105" : "",
                  )}
                />
                {!isBookView && <span className="font-medium tracking-tight">{n.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className={cn("mt-auto border-t border-border/40", isBookView ? "p-3" : "p-6")}>
          {!isBookView && (
            <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/10">
              <p className="text-[11px] leading-relaxed text-muted-foreground font-medium italic">
                Local-first manuscript studio. Your words stay private.
              </p>
            </div>
          )}
          <div
            className={cn("flex items-center", isBookView ? "justify-center" : "justify-between")}
          >
            {!isBookView && (
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Appearance
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
        <div className="md:hidden glass sticky top-0 z-50 flex h-14 items-center justify-between gap-3 border-b border-border/40 px-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="truncate font-serif text-lg font-bold tracking-tight">Quill</span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0 bg-background/40"
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="flex w-[min(22rem,calc(100vw-2rem))] flex-col p-0"
              >
                <SheetHeader className="border-b border-border/40 p-5 text-left">
                  <SheetTitle className="flex items-center gap-2 font-serif text-2xl">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Quill
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 p-3">
                  {nav.map((n) => {
                    const Icon = n.icon;
                    const active =
                      loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
                    return (
                      <SheetClose key={n.to} asChild>
                        <Link
                          to={n.to}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span>{n.label}</span>
                        </Link>
                      </SheetClose>
                    );
                  })}
                </nav>
                <div className="mt-auto border-t border-border/40 p-5 text-xs leading-relaxed text-muted-foreground">
                  Local-first manuscript studio. Your words stay private.
                </div>
              </SheetContent>
            </Sheet>
            <div className="shrink-0">
              <ThemeToggle />
            </div>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
