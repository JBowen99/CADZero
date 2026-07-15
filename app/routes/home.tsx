import { useEffect } from "react";
import type { Route } from "./+types/home";
import { Toolbar } from "~/components/Toolbar";
import { Viewport } from "~/components/Viewport";
import { SidePanel } from "~/components/SidePanel";
import { StatusBar } from "~/components/StatusBar";
import { ChatProvider } from "~/lib/ai-chat";
import { useModelSync } from "~/lib/useModelSync";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { TooltipProvider } from "~/components/ui/tooltip";
import { useConnectionStore } from "~/store/useConnectionStore";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI CAD" },
    { name: "description", content: "AI-native parametric CAD assistant" },
  ];
}

function Workspace() {
  const connect = useConnectionStore((s) => s.connect);
  useModelSync();

  useEffect(() => {
    void connect();
  }, [connect]);

  return (
    <>
      <Toolbar />
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize="70%" minSize="30%">
          <Viewport />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="30%" minSize="20%" maxSize="55%">
          <SidePanel />
        </ResizablePanel>
      </ResizablePanelGroup>
      <StatusBar />
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
