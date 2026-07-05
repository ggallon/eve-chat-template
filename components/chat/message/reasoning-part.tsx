"use client";

import { ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/chat/markdown";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/ui/cn";

export function ReasoningPart({
  isStreaming,
  text,
}: {
  readonly isStreaming: boolean;
  readonly text: string;
}) {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    }
  }, [isStreaming]);

  return (
    <Collapsible className="my-3 w-full" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
        <span className={isStreaming ? "shimmer-text" : undefined}>
          {isStreaming ? "Thinking..." : "Reasoning"}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 transition-transform",
            open ? "rotate-180" : ""
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 border-border border-l pl-4 text-muted-foreground">
        <Markdown>{text}</Markdown>
      </CollapsibleContent>
    </Collapsible>
  );
}
