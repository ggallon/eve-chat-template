"use client";

import { useEffect } from "react";
import type { ActiveChat } from "@/lib/chat/types";
import { CHAT_ROUTE_SYNC_EVENT } from "./agent-chat-events";

export function AgentChatRouteSync({
  activeChat,
  chatId,
}: {
  readonly activeChat: ActiveChat | null;
  readonly chatId: string | null;
}) {
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
