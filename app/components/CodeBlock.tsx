import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md border bg-muted/40",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {language ?? "code"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="text-emerald-500" />
          ) : (
            <Copy className="text-muted-foreground" />
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
