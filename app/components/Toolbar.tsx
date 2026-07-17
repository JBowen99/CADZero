import { useEffect, useRef, useState } from "react";
import {
  ArrowUpFromLine,
  Box,
  Boxes,
  FilePlus2,
  FolderOpen,
  Moon,
  Pencil,
  Save,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { ExportFormat } from "~/types";
import { useModelStore } from "~/store/useModelStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";
import { PartsBrowser } from "~/components/PartsBrowser";
import { WorkspaceSetup } from "~/components/WorkspaceSetup";
import { WindowControls } from "~/components/WindowControls";

const EXPORT_FORMATS: ExportFormat[] = ["stl", "obj", "3mf"];
const BUILD123D_ONLY_FORMATS: ExportFormat[] = ["step"];

function PartNameControl() {
  const activeMeta = useDocumentsStore((s) => s.activeMeta);
  const pendingName = useDocumentsStore(
    (s) =>
      s.openDocs.find((d) => d.clientId === s.activeClientId)?.pendingName ??
      null,
  );
  const rename = useDocumentsStore((s) => s.rename);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditing(false);
  }, [activeMeta?.id]);

  const displayName = activeMeta?.name ?? pendingName ?? "New part";

  const startEdit = () => {
    setDraft(activeMeta?.name ?? pendingName ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== displayName) {
      await rename(trimmed);
    }
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        className="h-7 w-44 text-xs"
      />
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={startEdit}
          className="group flex h-7 max-w-[180px] items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-accent"
        >
          <span className="truncate">{displayName}</span>
          <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Rename part</TooltipContent>
    </Tooltip>
  );
}

export function Toolbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const language = useModelStore((s) => s.language);
  const exportModel = useModelStore((s) => s.exportModel);
  const isExporting = useModelStore((s) => s.isExporting);
  const setNewPartDialogOpen = useDocumentsStore((s) => s.setNewPartDialogOpen);
  const saveActiveNow = useDocumentsStore((s) => s.saveActiveNow);
  const activeId = useDocumentsStore((s) => s.activeId);
  const previewingRevId = useDocumentsStore((s) => s.previewingRevId);
  const activeMeta = useDocumentsStore((s) => s.activeMeta);
  const root = useWorkspaceStore((s) => s.root);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (!activeId) {
      toast.error("Build or save the part first — nothing to export yet.");
      return;
    }
    try {
      const result = await exportModel(format, {
        partId: activeId,
        revId: previewingRevId ?? undefined,
        name: activeMeta?.name ?? null,
      });
      toast.success(
        `Exported ${result.filename} (${result.sizeBytes.toLocaleString()} bytes)`,
      );
    } catch (e) {
      toast.error("Export failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  const handleNew = () => {
    setNewPartDialogOpen(true);
  };

  const handleSave = async () => {
    await saveActiveNow();
  };

  return (
    <header className="app-drag flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <span className="font-semibold tracking-tight">
        CAD<span className="text-primary">Zero</span>
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle theme</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="File menu">
                <FilePlus2 className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>New file</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>File</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleNew()}>
            <FilePlus2 className="size-4" />
            New part
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setBrowserOpen(true)}>
            <FolderOpen className="size-4" />
            Open parts…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSetupOpen(true)}>
            <Boxes className="size-4" />
            Change workspace…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void handleSave()}
            aria-label="Save"
          >
            <Save className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save (name + write to disk)</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isExporting}
                aria-label="Export model"
              >
                <ArrowUpFromLine className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Export model</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Export model</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {EXPORT_FORMATS.map((format) => (
            <DropdownMenuItem
              key={format}
              onSelect={() => handleExport(format)}
              className="capitalize"
            >
              .{format}
            </DropdownMenuItem>
          ))}
          {language === "build123d" && (
            <>
              <DropdownMenuSeparator />
              {BUILD123D_ONLY_FORMATS.map((format) => (
                <DropdownMenuItem
                  key={format}
                  onSelect={() => handleExport(format)}
                  className="capitalize"
                >
                  .{format}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    B-rep
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PartNameControl />

      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-7 items-center gap-1.5 rounded-md border bg-background/60 px-2 text-xs font-medium">
              {language === "build123d" ? (
                <Boxes className="size-3.5 text-primary" />
              ) : (
                <Box className="size-3.5 text-primary" />
              )}
              <span>{language === "build123d" ? "Build123D" : "OpenSCAD"}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Backend is locked at part creation
          </TooltipContent>
        </Tooltip>
      </div>

      <WindowControls />

      <PartsBrowser open={browserOpen} onOpenChange={setBrowserOpen} />
      <WorkspaceSetup
        open={setupOpen}
        onOpenChange={setSetupOpen}
        dismissible
        currentRoot={root}
      />
    </header>
  );
}
