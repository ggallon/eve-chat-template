"use client";

import type { EveDynamicToolPart } from "eve/react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/ui/cn";
import { formatPayload } from "./format";
import {
  formatToolName,
  resolveToolName,
  type ToolStatus,
} from "./tool-status";
import type { OnInputResponses } from "./types";

export function ToolStatusIcon({ status }: { readonly status: ToolStatus }) {
  const className = "size-3 shrink-0";

  if (status === "running") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center self-center">
        <Loader2Icon className={cn(className, "animate-spin")} />
      </span>
    );
  }

  if (status === "error" || status === "denied") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center self-center">
        <XIcon className={cn(className, "text-destructive")} />
      </span>
    );
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center self-center">
      <CheckIcon className={cn(className, "text-emerald-500")} />
    </span>
  );
}

export function ToolNameLabel({ part }: { readonly part: EveDynamicToolPart }) {
  return (
    <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {formatToolName(resolveToolName(part))}
    </span>
  );
}

export function ToolPayload({
  label,
  tone = "default",
  value,
}: {
  readonly label: string;
  readonly tone?: "default" | "destructive";
  readonly value: unknown;
}) {
  if (value === undefined) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <pre
        className={cn(
          "max-h-56 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px] text-muted-foreground leading-5",
          tone === "destructive"
            ? "bg-destructive/10 text-destructive"
            : undefined
        )}
      >
        {formatPayload(value)}
      </pre>
    </div>
  );
}

export function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: OnInputResponses;
  readonly part: EveDynamicToolPart;
}) {
  const [freeformText, setFreeformText] = useState("");
  const inputRequest = part.toolMetadata?.eve?.inputRequest;

  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId
  );

  if (inputResponse) {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
        <span className="text-muted-foreground">Responded: </span>
        <span className="font-medium">
          {selectedOption?.label ??
            inputResponse.text ??
            inputResponse.optionId}
        </span>
      </div>
    );
  }

  const sendTextResponse = () => {
    const text = freeformText.trim();
    if (!text) {
      return;
    }
    void onInputResponses([{ requestId: inputRequest.requestId, text }]);
    setFreeformText("");
  };

  return (
    <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>
      {inputRequest.options?.length ? (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              size="sm"
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {inputRequest.allowFreeform || inputRequest.display === "text" ? (
        <div className="flex gap-2">
          <Input
            disabled={!canRespond}
            onChange={(event) => setFreeformText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                sendTextResponse();
              }
            }}
            placeholder="Type a response"
            value={freeformText}
          />
          <Button
            disabled={!canRespond || freeformText.trim().length === 0}
            onClick={sendTextResponse}
            type="button"
          >
            Reply
          </Button>
        </div>
      ) : null}
    </div>
  );
}
