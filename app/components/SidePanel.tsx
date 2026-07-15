import { useState } from "react";
import { Code2, MessageSquare } from "lucide-react";
import { ChatPanel } from "~/components/ChatPanel";
import { CodeView } from "~/components/CodeView";
import { cn } from "~/lib/utils";

type SideTab = "chat" | "code";

export function SidePanel() {
  const [tab, setTab] = useState<SideTab>("chat");

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-l bg-background">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <TabButton
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          icon={<MessageSquare className="size-3.5" />}
          label="Chat"
        />
        <TabButton
          active={tab === "code"}
          onClick={() => setTab("code")}
          icon={<Code2 className="size-3.5" />}
          label="Code"
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === "chat" ? <ChatPanel /> : <CodeView />}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
