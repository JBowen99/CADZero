import { Download, Eraser, Moon, Sun, Boxes } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
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
import { useChatContext } from "~/lib/ai-chat";
import { useModelStore } from "~/store/useModelStore";

const EXPORT_FORMATS: ExportFormat[] = ["stl", "obj", "3mf"];

export function Toolbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const backend = useModelStore((s) => s.backend);
  const setBackend = useModelStore((s) => s.setBackend);
  const exportModel = useModelStore((s) => s.exportModel);
  const isExporting = useModelStore((s) => s.isExporting);
  const mesh = useModelStore((s) => s.mesh);
  const { messages, setMessages } = useChatContext();
  const hasMessages = messages.length > 0;
  const clear = () => setMessages([]);

  const handleBackendChange = (value: string) => {
    setBackend(value as BackendName);
    toast.info(`Switched to ${value === "openscad" ? "OpenSCAD" : "Build123D"} backend`);
  };

  const handleExport = async (format: ExportFormat) => {
    if (!mesh) {
      toast.error("Nothing to export yet — create a model first.");
      return;
    }
    const result = await exportModel(format);
    toast.success(`Exported ${result.filename} (${result.sizeBytes.toLocaleString()} bytes)`, {
      description: "Backend not connected — this is a dummy export.",
    });
  };

  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

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
    </header>
  );
}
