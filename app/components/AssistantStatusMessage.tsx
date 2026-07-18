import { cn } from "~/lib/utils";

interface AssistantStatusMessageProps {
  children: React.ReactNode;
  /** Match ChatMessage outer padding when rendered outside a message row. */
  padded?: boolean;
  className?: string;
}

/** In-progress assistant status — same bubble as replies, with yellow shine text. */
export function AssistantStatusMessage({
  children,
  padded = false,
  className,
}: AssistantStatusMessageProps) {
  const bubble = (
    <div
      className={cn(
        "rounded-lg bg-muted px-3 py-2 text-sm",
        className,
      )}
    >
      <span className="assistant-status-shine">{children}</span>
    </div>
  );

  if (!padded) return bubble;

  return (
    <div className="flex w-full px-4 py-3">
      <div className="min-w-0 max-w-[85%]">{bubble}</div>
    </div>
  );
}
