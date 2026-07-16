import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Boxes,
  Download,
  Eraser,
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
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
import type { BackendName, ExportFormat } from "~/types";
import { useChatActions, useChatHasMessages } from "~/lib/ai-chat";
import { useModelStore } from "~/store/useModelStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";
import { PartsBrowser } from "~/components/PartsBrowser";
import { WorkspaceSetup } from "~/components/WorkspaceSetup";

const EXPORT_FORMATS: ExportFormat[] = ["stl", "obj", "3mf"];

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
    <button
      type="button"
      onClick={startEdit}
      className="group flex h-7 max-w-[180px] items-center gap-1.5 rounded-md px-2 text-xs font-medium hover:bg-accent"
      title="Rename part"
    >
      <span className="truncate">{displayName}</span>
      <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
    </button>
  );
}

export function Toolbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const backend = useModelStore((s) => s.backend);
  const setBackend = useModelStore((s) => s.setBackend);
  const exportModel = useModelStore((s) => s.exportModel);
  const isExporting = useModelStore((s) => s.isExporting);
  const mesh = useModelStore((s) => s.mesh);
  const setMessages = useChatActions().setMessages;
  const hasMessages = useChatHasMessages();
  const newTab = useDocumentsStore((s) => s.newTab);
  const checkpoint = useDocumentsStore((s) => s.checkpoint);
  const saveActiveNow = useDocumentsStore((s) => s.saveActiveNow);
  const activeMeta = useDocumentsStore((s) => s.activeMeta);
  const root = useWorkspaceStore((s) => s.root);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  const clear = () => setMessages([]);

  const handleCheckpoint = async () => {
    const label = window
      .prompt("Checkpoint name (labels the current version):")
      ?.trim();
    if (!label) return;
    await checkpoint(label);
    toast.success(`Checkpointed “${label}”`);
  };

  const handleBackendChange = (value: string) => {
    setBackend(value as BackendName);
    toast.info(
      `Switched to ${value === "openscad" ? "OpenSCAD" : "Build123D"} backend`,
    );
  };

  const handleExport = async (format: ExportFormat) => {
    if (!mesh) {
      toast.error("Nothing to export yet — create a model first.");
      return;
    }
    const result = await exportModel(format);
    toast.success(
      `Exported ${result.filename} (${result.sizeBytes.toLocaleString()} bytes)`,
      { description: "Backend not connected — this is a dummy export." },
    );
  };

  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  const handleNew = () => {
    newTab();
  };

  const handleSave = async () => {
    await saveActiveNow();
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
      <div className="flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Boxes className="size-4" />
        </span>
        <span className="tracking-tight">AI CAD</span>
        <Badge variant="secondary" className="hidden sm:inline">
          MVP
        </Badge>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="File menu">
            <FilePlus2 className="size-4" />
          </Button>
        </DropdownMenuTrigger>
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

      <PartNameControl />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSave()}
            aria-label="Save"
          >
            <Save className="size-4" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save (name + write to disk)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void handleCheckpoint()}
            disabled={!activeMeta?.headRevId}
            aria-label="Checkpoint current version"
          >
            <Bookmark className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Checkpoint current version</TooltipContent>
      </Tooltip>

      <div className="ml-4 hidden items-center gap-2 text-xs text-muted-foreground md:flex">
        <span>Backend</span>
        <Select value={backend} onValueChange={handleBackendChange}>
          <SelectTrigger className="h-7 w-[150px] text-xs" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openscad">OpenSCAD</SelectItem>
            <SelectItem value="build123d">Build123D</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
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
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isExporting}>
              <Download className="size-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clear}
              disabled={!hasMessages}
              aria-label="Clear conversation"
            >
              <Eraser className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear conversation</TooltipContent>
        </Tooltip>
      </div>

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
