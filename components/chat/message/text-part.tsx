"use client";

import { Markdown } from "@/components/chat/markdown";
import { useStreamingText } from "./use-streaming-text";

export function UserTextPart({ text }: { readonly text: string }) {
  return <div className="whitespace-pre-wrap break-words">{text}</div>;
}

export function AssistantTextPart({
  showCaret,
  streamKey,
  text,
}: {
  readonly showCaret: boolean;
  readonly streamKey: string;
  readonly text: string;
}) {
  const smoothedText = useStreamingText(text, showCaret, streamKey);
  const isRevealActive =
    smoothedText.length > 0 && (showCaret || smoothedText !== text);
  const showVisibleCaret = showCaret && smoothedText.length > 0;

  return (
    <Markdown
      animated={isRevealActive ? { duration: 0, stagger: 0 } : undefined}
      caret={showVisibleCaret ? "block" : undefined}
      isAnimating={isRevealActive}
    >
      {smoothedText}
    </Markdown>
  );
}
