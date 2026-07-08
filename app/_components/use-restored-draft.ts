"use client";

import { useEffect } from "react";

import { readAndClearChatDraft } from "@/lib/chat/draft-storage";
import type { Viewer } from "@/lib/chat/types";

/**
 * Restores a chat draft that was stashed in sessionStorage — e.g. right
 * before a sign-in redirect, or after a failed chat-creation attempt — once
 * a viewer is available, then clears it so it isn't restored twice.
 */
export function useRestoredDraft(
  viewer: Viewer | null,
  setDraft: (draft: string) => void
) {
  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = readAndClearChatDraft();

    if (restoredDraft) {
      setDraft(restoredDraft);
    }
  }, [viewer, setDraft]);
}
