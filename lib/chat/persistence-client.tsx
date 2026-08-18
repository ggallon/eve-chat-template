"use client";

import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import {
  appendChatEventsAction,
  checkSendLimitAction,
  clearChatPendingMessageAction,
  createChatAction,
  deleteChatAction,
  prepareChatSendAction,
  saveChatSessionStateAction,
  saveChatSnapshotAction,
} from "@/app/actions/chat";
import {
  clearLocalChatPendingMessage,
  deleteLocalChat,
  getLocalChat,
  listLocalChats,
} from "@/lib/chat/local-store";
import type { StorageMode } from "@/lib/chat/types";

export function listClientChats(storageMode: StorageMode) {
  return storageMode === "browser" ? listLocalChats() : [];
}

export async function getClientChat(storageMode: StorageMode, chatId: string) {
  if (storageMode === "browser") {
    return getLocalChat(chatId);
  }

  const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "Chat not found."
        : "Failed to load chat history."
    );
  }

  const data = (await response.json()) as {
    readonly chat: ReturnType<typeof getLocalChat>;
  };

  return data.chat;
}

export async function createClientChat(input?: {
  readonly pendingUserMessage?: string;
}) {
  return createChatAction(input);
}

export async function deleteClientChat(
  storageMode: StorageMode,
  chatId: string
) {
  if (storageMode === "browser") {
    deleteLocalChat(chatId);
    return;
  }

  await deleteChatAction(chatId);
}

export async function checkClientSendLimit(input?: {
  readonly message?: string;
}) {
  return checkSendLimitAction(input);
}

export async function prepareClientChatSend(input: {
  readonly chatId?: string;
  readonly message: string;
}) {
  return prepareChatSendAction(input);
}

export async function clearClientChatPendingMessage(
  storageMode: StorageMode,
  chatId: string
) {
  if (storageMode === "browser") {
    clearLocalChatPendingMessage(chatId);
    return;
  }

  await clearChatPendingMessageAction(chatId);
}

export async function appendClientChatEvents(input: {
  readonly chatId: string;
  readonly events: readonly {
    readonly event: MessageStreamEvent;
    readonly eventIndex: number;
  }[];
}) {
  await appendChatEventsAction(input);
}

export async function saveClientChatSession(input: {
  readonly chatId: string;
  readonly session: ClientSessionState;
}) {
  await saveChatSessionStateAction(input);
}

export async function saveClientChatSnapshot(input: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState;
}) {
  await saveChatSnapshotAction(input);
}
