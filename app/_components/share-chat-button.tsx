"use client";

import { CheckIcon, UploadIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ChatRouteShareButton() {
  const pathname = usePathname();

  if (!pathname.startsWith("/chat/")) {
    return null;
  }

  return <ShareChatButton />;
}

export function ShareChatButton() {
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);

  const clearCopyResetTimer = useCallback(() => {
    if (copyResetTimerRef.current === null) {
      return;
    }

    window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = null;
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      clearCopyResetTimer();
      setCopied(true);
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopied(false);
      }, 1600);
    } catch {
      setCopied(false);
    }
  }, [clearCopyResetTimer]);

  useEffect(() => clearCopyResetTimer, [clearCopyResetTimer]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-block w-fit">
            <Button
              aria-label={copied ? "Copied chat link" : "Copy chat link"}
              className="text-muted-foreground hover:text-foreground"
              onClick={handleCopyLink}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <UploadIcon className="size-4" />
              )}
            </Button>
          </span>
        }
      />
      <TooltipContent side="bottom">
        {copied ? "Copied" : "Copy link"}
      </TooltipContent>
    </Tooltip>
  );
}
