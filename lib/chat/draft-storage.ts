const CHAT_DRAFT_STORAGE_KEY = "eve-chat-draft";

export function readAndClearChatDraft(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const draft = window.sessionStorage.getItem(CHAT_DRAFT_STORAGE_KEY);
    if (draft) {
      window.sessionStorage.removeItem(CHAT_DRAFT_STORAGE_KEY);
    }

    return draft;
  } catch {
    return null;
  }
}

export function writeChatDraft(draft: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(CHAT_DRAFT_STORAGE_KEY, draft);
  } catch {
    // Ignore storage failures; draft persistence is best-effort.
  }
}
