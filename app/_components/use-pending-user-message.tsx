"use client";

import { useCallback, useRef, useState } from "react";

export function usePendingUserMessage() {
  const messageRef = useRef<string | null>(null);
  const [message, setMessageState] = useState<string | null>(null);

  const setMessage = useCallback((nextMessage: string | null) => {
    messageRef.current = nextMessage;
    setMessageState(nextMessage);
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, [setMessage]);

  return { clearMessage, message, messageRef, setMessage };
}
