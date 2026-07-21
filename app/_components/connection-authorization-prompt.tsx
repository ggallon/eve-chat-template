"use client";

import { ExternalLinkIcon, PlugIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PendingConnectionAuthorization } from "@/lib/chat/connection";

interface ConnectionAuthorizationPrompt {
  readonly authorization: PendingConnectionAuthorization;
  readonly isSkipping: boolean;
  readonly onSkip: (
    authorization: PendingConnectionAuthorization
  ) => Promise<void>;
}

export function ConnectionAuthorizationPrompt({
  authorization,
  isSkipping,
  onSkip,
}: ConnectionAuthorizationPrompt) {
  return (
    <article aria-live="polite" className="flex w-full justify-start px-3">
      <div className="w-full max-w-md rounded-lg border border-border/70 bg-muted/20 p-3 text-sm shadow-sm">
        <div className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <PlugIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">
              Connect {authorization.displayName}
            </p>
            <p className="mt-1 text-muted-foreground">
              {authorization.description}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              {authorization.url ? (
                <a
                  className={buttonVariants({
                    variant: "default",
                    size: "xs",
                  })}
                  href={authorization.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Connect
                  <ExternalLinkIcon className="size-3" />
                </a>
              ) : null}
              <Button
                disabled={isSkipping}
                onClick={() => {
                  void onSkip(authorization);
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                {isSkipping ? "Skipping..." : "Skip"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
