"use client";

import { useEffect, useRef, useState } from "react";

const STREAM_TEXT_TICK_MS = 60;
const STREAM_TEXT_CACHE_LIMIT = 40;
const streamingTextCache = new Map<string, string>();

export function useStreamingText(
  text: string,
  isStreaming: boolean,
  streamKey: string
) {
  const [visibleText, setVisibleText] = useState(() =>
    getInitialStreamingText(text, isStreaming, streamKey)
  );
  const visibleTextRef = useRef(visibleText);

  useEffect(() => {
    visibleTextRef.current = visibleText;
  }, [visibleText]);

  useEffect(() => {
    const current = visibleTextRef.current;

    if (!isStreaming && (current === text || !text.startsWith(current))) {
      if (current !== text) {
        visibleTextRef.current = text;
        rememberStreamingText(streamKey, text);
        setVisibleText(text);
      }

      return;
    }

    const catchUp = !isStreaming;
    let interval: number | undefined;

    const advance = () => {
      const next = nextStreamingText(visibleTextRef.current, text, catchUp);

      if (next !== visibleTextRef.current) {
        visibleTextRef.current = next;
        rememberStreamingText(streamKey, next);
        setVisibleText(next);
      }

      if (catchUp && next === text && interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
    };

    advance();

    if (catchUp && visibleTextRef.current === text) {
      return;
    }

    interval = window.setInterval(advance, STREAM_TEXT_TICK_MS);

    return () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [isStreaming, streamKey, text]);

  useEffect(() => {
    if (!isStreaming && visibleText === text) {
      streamingTextCache.delete(streamKey);
    }
  }, [isStreaming, streamKey, text, visibleText]);

  return visibleText;
}

function getInitialStreamingText(
  text: string,
  isStreaming: boolean,
  streamKey: string
) {
  const cachedText = streamingTextCache.get(streamKey);

  if (cachedText && text.startsWith(cachedText)) {
    return cachedText;
  }

  return isStreaming ? "" : text;
}

function rememberStreamingText(streamKey: string, text: string) {
  if (!text) {
    return;
  }

  streamingTextCache.delete(streamKey);
  streamingTextCache.set(streamKey, text);

  if (streamingTextCache.size <= STREAM_TEXT_CACHE_LIMIT) {
    return;
  }

  const oldestKey = streamingTextCache.keys().next().value;

  if (oldestKey) {
    streamingTextCache.delete(oldestKey);
  }
}

function getStep(catchUp: boolean, remaining: number) {
  if (catchUp) {
    if (remaining > 160) {
      return 18;
    }
    if (remaining > 80) {
      return 12;
    }
    if (remaining > 32) {
      return 7;
    }
    if (remaining > 12) {
      return 4;
    }
    return 2;
  }

  if (remaining > 160) {
    return 6;
  }
  if (remaining > 80) {
    return 5;
  }
  if (remaining > 32) {
    return 3;
  }
  if (remaining > 12) {
    return 2;
  }
  return 1;
}

function nextStreamingText(current: string, target: string, catchUp = false) {
  if (current === target) {
    return current;
  }

  if (!target.startsWith(current)) {
    return target;
  }

  const remaining = target.length - current.length;
  const step = getStep(catchUp, remaining);

  return target.slice(0, current.length + Math.min(remaining, step));
}
