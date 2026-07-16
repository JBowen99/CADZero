import { useEffect, useRef } from "react";
import type { Route } from "./+types/home";
import { Toolbar } from "~/components/Toolbar";
import { TabBar } from "~/components/TabBar";
import { Viewport } from "~/components/Viewport";
import { SidePanel } from "~/components/SidePanel";
import { WorkspaceSetup } from "~/components/WorkspaceSetup";
import { NamePrompt } from "~/components/NamePrompt";
import { ChatProvider } from "~/lib/ai-chat";
import { useModelSync } from "~/lib/useModelSync";
import { useTabChatSync } from "~/lib/useTabChatSync";
import { useChatPersist } from "~/lib/useChatPersist";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { TooltipProvider } from "~/components/ui/tooltip";
import { useConnectionStore } from "~/store/useConnectionStore";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";
import { useSettingsStore } from "~/store/useSettingsStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "CADZero" },
    { name: "description", content: "AI-native parametric CAD assistant" },
  ];
}

function Workspace() {
  const connect = useConnectionStore((s) => s.connect);
  useModelSync();
  useTabChatSync();
  useChatPersist();

  const initWs = useWorkspaceStore((s) => s.init);
  const wsInitialized = useWorkspaceStore((s) => s.initialized);
  const configured = useWorkspaceStore((s) => s.configured);
  const parts = useWorkspaceStore((s) => s.parts);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const lastOpenDocIds = useSettingsStore((s) => s.lastOpenDocIds);
  const setOpenDocOrder = useSettingsStore((s) => s.setOpenDocOrder);
  const openDocs = useDocumentsStore((s) => s.openDocs);
  const activeClientId = useDocumentsStore((s) => s.activeClientId);
  const reopenedRef = useRef(false);

  useEffect(() => {
    void connect();
  }, [connect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void useDocumentsStore.getState().saveActiveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    void useSettingsStore.getState().load();
    void initWs();
  }, [initWs]);

  useEffect(() => {
    if (reopenedRef.current) return;
    if (!wsInitialized || !configured || !settingsLoaded) return;
    reopenedRef.current = true;
    const ids = lastOpenDocIds.filter((id) => parts.some((p) => p.id === id));
    if (ids.length === 0) {
      useDocumentsStore.getState().newTab();
      return;
    }
    const docs = useDocumentsStore.getState();
    void (async () => {
      await docs.openPart(ids[0]);
      for (const id of ids.slice(1)) {
        await docs.openPart(id, { background: true });
      }
    })();
  }, [wsInitialized, configured, settingsLoaded, lastOpenDocIds, parts]);

  useEffect(() => {
    if (!reopenedRef.current) return;
    const ordered = [
      ...openDocs.filter((d) => d.clientId === activeClientId),
      ...openDocs.filter((d) => d.clientId !== activeClientId),
    ]
      .map((d) => d.partId)
      .filter((id): id is string => id !== null);
    setOpenDocOrder(ordered);
  }, [openDocs, activeClientId, setOpenDocOrder]);

  return (
    <>
      <Toolbar />
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize="70%" minSize="30%">
          <div className="flex h-full w-full min-w-0 flex-col">
            <TabBar />
            <div className="min-h-0 flex-1">
              <Viewport />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="30%" minSize="20%" maxSize="55%">
          <SidePanel />
        </ResizablePanel>
      </ResizablePanelGroup>
      {wsInitialized && !configured && <WorkspaceSetup />}
      <NamePrompt />
    </>
  );
}

export default function Home() {
  return (
    <ChatProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
          <Workspace />
        </div>
      </TooltipProvider>
    </ChatProvider>
  );
}
