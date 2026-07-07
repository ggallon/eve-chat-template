"use client";

import { useEffect } from "react";
import {
  CHAT_ROUTE_SYNC_EVENT,
  type ChatRouteSyncDetail,
} from "./agent-chat-events";

export function AgentChatRouteSync({
  activeChat,
  chatId,
}: ChatRouteSyncDetail) {
  useEffect(() => {
    const detail = { activeChat, chatId };
    const target = window as Window & {
      __eveChatRouteSync?: typeof detail;
    };

    target.__eveChatRouteSync = detail;
    window.dispatchEvent(
      new CustomEvent(CHAT_ROUTE_SYNC_EVENT, {
        detail,
      })
    );
  }, [activeChat, chatId]);

  return null;
}
