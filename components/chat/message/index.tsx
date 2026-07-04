"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReasoningPart } from "./reasoning-part";
import { AssistantTextPart, UserTextPart } from "./text-part";
import { ToolGroup } from "./tool-group";
import type { OnInputResponses } from "./types";

export type { AgentInputResponse } from "./types";

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: OnInputResponses;
}) {
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1
  );
  const isUser = message.role === "user";

  return (
    <article
      className={cn(
        "group flex w-full min-w-0",
        isUser ? "justify-end" : "justify-start",
        message.metadata?.optimistic ? "opacity-90" : undefined
      )}
    >
      <div
        className={cn(
          "min-w-0",
          isUser
            ? "max-w-[85%] rounded-[18px] border border-border/40 bg-muted/70 px-3 py-1.5 text-[15px] text-foreground leading-6 shadow-sm"
            : "w-full max-w-none text-foreground text-sm leading-relaxed"
        )}
      >
        <AgentMessageParts
          canRespond={canRespond}
          isUser={isUser}
          lastTextIndex={lastTextIndex}
          messageId={message.id}
          onInputResponses={onInputResponses}
          parts={message.parts}
          showCaret={isStreaming && message.role === "assistant"}
        />
      </div>
    </article>
  );
}

function AgentMessageParts({
  canRespond,
  isUser,
  lastTextIndex,
  messageId,
  onInputResponses,
  parts,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly isUser: boolean;
  readonly lastTextIndex: number;
  readonly messageId: string;
  readonly onInputResponses: OnInputResponses;
  readonly parts: readonly EveMessagePart[];
  readonly showCaret: boolean;
}) {
  const elements: ReactNode[] = [];
  let pendingTools: EveDynamicToolPart[] = [];

  const flushTools = (isSettled: boolean) => {
    if (pendingTools.length === 0) {
      return;
    }

    const partsForGroup = pendingTools;

    elements.push(
      <ToolGroup
        canRespond={canRespond}
        isSettled={isSettled}
        key={`tools:${partsForGroup.map((part) => part.toolCallId).join(":")}`}
        onInputResponses={onInputResponses}
        parts={partsForGroup}
      />
    );
    pendingTools = [];
  };

  parts.forEach((part, index) => {
    if (part.type === "dynamic-tool") {
      pendingTools.push(part);
      return;
    }

    flushTools(true);
    const key = partKey(part, index);

    elements.push(
      <AgentMessagePart
        canRespond={canRespond}
        isUser={isUser}
        key={key}
        onInputResponses={onInputResponses}
        part={part}
        showCaret={showCaret && index === lastTextIndex}
        streamKey={`${messageId}:${key}`}
      />
    );
  });

  flushTools(!showCaret);

  return elements;
}

function AgentMessagePart({
  canRespond,
  isUser,
  onInputResponses,
  part,
  showCaret,
  streamKey,
}: {
  readonly canRespond: boolean;
  readonly isUser: boolean;
  readonly onInputResponses: OnInputResponses;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
  readonly streamKey: string;
}) {
  switch (part.type) {
    case "text":
      return isUser ? (
        <UserTextPart text={part.text} />
      ) : (
        <AssistantTextPart
          showCaret={showCaret}
          streamKey={streamKey}
          text={part.text}
        />
      );
    case "reasoning":
      return (
        <ReasoningPart
          isStreaming={part.state === "streaming"}
          text={part.text}
        />
      );
    // case "authorization";
    // case "dynamic-tool":
    // case "step-start":
    default:
      return null;
  }
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
