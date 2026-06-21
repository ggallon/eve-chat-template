import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AgentChatRouteSync } from "@/app/_components/agent-chat-route-sync";
import { SessionChatPage } from "@/app/_components/session-chat-page";
import { isProvisionalChatId } from "@/lib/chat/provisional-chat";
import { getChatForUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";

export default async function ChatPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id: chatId } = await params;

  return (
    <SessionChatPage chatId={chatId} key={chatId}>
      <Suspense fallback={null}>
        <ExistingChat chatId={chatId} />
      </Suspense>
    </SessionChatPage>
  );
}

async function ExistingChat({ chatId }: { readonly chatId: string }) {
  if (isProvisionalChatId(chatId)) {
    return <AgentChatRouteSync activeChat={null} chatId={chatId} />;
  }

  const viewer = await getServerViewer();
  const activeChat = viewer ? await getChatForUser(chatId, viewer.id) : null;

  if (viewer && !activeChat) {
    notFound();
  }

  return <AgentChatRouteSync activeChat={activeChat} chatId={chatId} />;
}
