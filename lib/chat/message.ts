import type { EveMessage, EveMessageData } from "eve/client";
import type { ChatListItem } from "./types";

export function createPendingUserMessage(
  chatId: string,
  text: string,
  idSuffix = "pending-user-message"
): EveMessage {
  return {
    id: `${chatId}:${idSuffix}`,
    metadata: {
      optimistic: true,
      status: "submitted",
    },
    parts: [
      {
        state: "done",
        text,
        type: "text",
      },
    ],
    role: "user",
  };
}
export function getMessageText(message: EveMessageData["messages"][number]) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text || null;
}

export function hasLatestUserMessage(
  messages: readonly EveMessageData["messages"][number][],
  text: string
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role !== "user") {
      continue;
    }

    return getMessageText(message) === text.trim();
  }

  return false;
}

export function appendPendingUserMessages(
  messages: readonly EveMessageData["messages"][number][],
  pendingMessages: readonly (EveMessage | null)[]
) {
  let nextMessages = messages;

  for (const pendingMessage of pendingMessages) {
    const pendingText = pendingMessage ? getMessageText(pendingMessage) : null;

    if (
      !(pendingMessage && pendingText) ||
      hasLatestUserMessage(nextMessages, pendingText)
    ) {
      continue;
    }

    nextMessages = [...nextMessages, pendingMessage];
  }

  return nextMessages;
}

export function mergeChatHistory(
  incoming: readonly ChatListItem[],
  current: readonly ChatListItem[]
) {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const freshIncoming = incoming.filter((item) => !currentIds.has(item.id));

  return [
    ...freshIncoming,
    ...current.map((item) => incomingById.get(item.id) ?? item),
  ];
}
