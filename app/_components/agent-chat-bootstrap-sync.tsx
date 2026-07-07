"use client";

import { useEffect } from "react";
import {
  CHAT_BOOTSTRAP_SYNC_EVENT,
  type ChatBootstrapSyncDetail,
} from "./agent-chat-events";

export function AgentChatBootstrapSync({
  chats,
  nextCursor,
  viewer,
}: ChatBootstrapSyncDetail) {
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
