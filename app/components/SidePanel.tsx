import { useState } from "react";
import { Code2, History, MessageSquare } from "lucide-react";
import { ChatPanel } from "~/components/ChatPanel";
import { CodeView } from "~/components/CodeView";
import { HistoryPanel } from "~/components/HistoryPanel";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { cn } from "~/lib/utils";

type SideTab = "chat" | "code" | "history";

export function SidePanel() {
  const [tab, setTab] = useState<SideTab>("chat");
  const codeDirty = useDocumentsStore(
    (s) =>
      s.openDocs.find((d) => d.clientId === s.activeClientId)?.codeDirty ??
      false,
  );

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-l bg-background">
      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
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
          dirty={codeDirty}
        />
        <TabButton
          active={tab === "history"}
          onClick={() => setTab("history")}
          icon={<History className="size-3.5" />}
          label="History"
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === "chat" ? (
          <ChatPanel />
        ) : tab === "code" ? (
          <CodeView />
        ) : (
          <HistoryPanel />
        )}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  dirty,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  dirty?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
      {dirty && (
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
      )}
    </button>
  );
}

