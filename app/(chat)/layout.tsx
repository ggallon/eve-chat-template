import { Suspense, type ReactNode } from "react";
import { AgentChatBootstrapSync } from "@/app/_components/agent-chat-bootstrap-sync";
import { AgentChatShell } from "@/app/_components/agent-chat-shell";
import { listChatsPageByUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";

export default function ChatLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <AgentChatShell initialChats={[]} initialNextCursor={null} viewer={null}>
      {children}
      <div className="hidden" aria-hidden>
        <Suspense fallback={null}>
          <ResolvedChatBootstrap />
        </Suspense>
      </div>
    </AgentChatShell>
  );
}

async function ResolvedChatBootstrap() {
  const viewer = await getServerViewer();
  const initialChatsPage = viewer
    ? await listChatsPageByUser(viewer.id)
    : { items: [], nextCursor: null };

  return (
    <AgentChatBootstrapSync
      chats={initialChatsPage.items}
      nextCursor={initialChatsPage.nextCursor}
      viewer={viewer}
    />
  );
}
