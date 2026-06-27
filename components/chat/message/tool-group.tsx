"use client";

import type { EveDynamicToolPart } from "eve/react";
import { ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  InputRequestActions,
  ToolNameLabel,
  ToolPayload,
  ToolStatusIcon,
} from "./tool-parts";
import {
  describeToolAction,
  getSettledToolStatus,
  getToolGroupStatus,
  getToolStatus,
  hasToolDetails,
  needsInputResponse,
  summarizeToolGroup,
  toolStatusLabel,
} from "./tool-status";
import type { OnInputResponses } from "./types";

export function ToolGroup({
  canRespond,
  isSettled,
  onInputResponses,
  parts,
}: {
  readonly canRespond: boolean;
  readonly isSettled: boolean;
  readonly onInputResponses: OnInputResponses;
  readonly parts: readonly EveDynamicToolPart[];
}) {
  const shouldOpen = parts.some(needsInputResponse);
  const [open, setOpen] = useState(shouldOpen);
  const status = getSettledToolStatus(
    getToolGroupStatus(parts),
    isSettled && !shouldOpen
  );
  const label = summarizeToolGroup(parts, status);
  const canExpand =
    parts.length > 1 ? parts.some(hasToolDetails) : hasToolDetails(parts[0]!);

  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
    }
  }, [shouldOpen]);

  return (
    <Collapsible
      className="my-2 px-3"
      onOpenChange={canExpand ? setOpen : undefined}
      open={canExpand ? open : false}
    >
      <CollapsibleTrigger
        className={cn(
          "group flex max-w-full items-center gap-2 py-0.5 text-left text-muted-foreground text-sm leading-6 transition-colors",
          canExpand ? "cursor-pointer hover:text-foreground" : "cursor-default"
        )}
        disabled={!canExpand}
      >
        <ToolStatusIcon status={status} />
        <span className="truncate">{label}</span>
        <span className="sr-only">{toolStatusLabel(status)}</span>
        {canExpand ? (
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 self-center transition-all",
              open
                ? "rotate-90 opacity-100"
                : "opacity-0 group-hover:opacity-100"
            )}
          />
        ) : null}
      </CollapsibleTrigger>
      {canExpand ? (
        <CollapsibleContent className="ml-2 border-border/40 border-l pt-0.5 pb-1 pl-3">
          {parts.length === 1 ? (
            <ToolDetails
              canRespond={canRespond}
              onInputResponses={onInputResponses}
              part={parts[0]!}
            />
          ) : (
            parts.map((part) => (
              <ToolCallItem
                canRespond={canRespond}
                isSettled={isSettled}
                key={part.toolCallId}
                onInputResponses={onInputResponses}
                part={part}
              />
            ))
          )}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function ToolCallItem({
  canRespond,
  isSettled,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly isSettled: boolean;
  readonly onInputResponses: OnInputResponses;
  readonly part: EveDynamicToolPart;
}) {
  const shouldOpen = needsInputResponse(part);
  const [open, setOpen] = useState(shouldOpen);
  const status = getSettledToolStatus(
    getToolStatus(part),
    isSettled && !shouldOpen
  );
  const canExpand = hasToolDetails(part);

  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
    }
  }, [shouldOpen]);

  const button = (
    <button
      className={cn(
        "flex w-full items-center gap-2 py-0.5 text-left text-muted-foreground text-sm leading-6 transition-colors",
        canExpand ? "cursor-pointer hover:text-foreground" : "cursor-default"
      )}
      type="button"
    >
      <ToolStatusIcon status={status} />
      <ToolNameLabel part={part} />
      <span className="truncate text-foreground/80">
        {describeToolAction(part, status)}
      </span>
      {canExpand ? (
        <ChevronRightIcon
          className={cn(
            "ml-auto size-3 shrink-0 self-center transition-transform",
            open ? "rotate-90" : ""
          )}
        />
      ) : null}
    </button>
  );

  if (!canExpand) {
    return <div className="py-0.5">{button}</div>;
  }

  return (
    <Collapsible className="py-0.5" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-5">
        <ToolDetails
          canRespond={canRespond}
          onInputResponses={onInputResponses}
          part={part}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolDetails({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: OnInputResponses;
  readonly part: EveDynamicToolPart;
}) {
  const hasOutput =
    part.state === "output-available" || part.state === "output-error";

  return (
    <div className="space-y-1.5">
      <InputRequestActions
        canRespond={canRespond}
        onInputResponses={onInputResponses}
        part={part}
      />
      <ToolPayload label="input" value={part.input} />
      {hasOutput ? (
        <ToolPayload
          label={part.state === "output-error" ? "error" : "result"}
          tone={part.state === "output-error" ? "destructive" : "default"}
          value={part.state === "output-error" ? part.errorText : part.output}
        />
      ) : null}
    </div>
  );
}
