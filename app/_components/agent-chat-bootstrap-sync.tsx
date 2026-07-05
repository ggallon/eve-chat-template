"use client";

import { useEffect } from "react";
import type { ChatListItem, Viewer } from "@/lib/chat/types";
import { CHAT_BOOTSTRAP_SYNC_EVENT } from "./agent-chat-events";

export function AgentChatBootstrapSync({
  chats,
  nextCursor,
  viewer,
}: {
  readonly chats: readonly ChatListItem[];
  readonly nextCursor: string | null;
  readonly viewer: Viewer | null;
}) {
  useEffect(() => {
    const detail = { chats, nextCursor, viewer };
    const target = window as Window & {
      __eveChatBootstrapSync?: typeof detail;
    };

    target.__eveChatBootstrapSync = detail;
    window.dispatchEvent(
      new CustomEvent(CHAT_BOOTSTRAP_SYNC_EVENT, {
        detail,
      })
    );
  }, [chats, nextCursor, viewer]);

  return null;
}
