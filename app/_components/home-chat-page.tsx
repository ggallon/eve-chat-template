"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/chat/composer";
import { TemplateFooterLinks } from "@/components/chat/template-footer-links";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import {
  createProvisionalChatId,
  writePendingChatMessage,
} from "@/lib/chat/provisional-chat";
import { useChatShell } from "./chat-shell-context";
import { ComposerFooterControls } from "./composer-footer-controls";
import { IDLE_CONTROLLER_STATUS } from "./controller";
import { ErrorToast } from "./error-toast";

export function HomeChatPage() {
  const { requestSignIn, setActiveChatId, viewer } = useChatShell();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const toastError =
    clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    setActiveChatId(null);
  }, [setActiveChatId]);

  useEffect(() => {
    if (pathname === "/") {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

    if (restoredDraft) {
      setDraft(restoredDraft);
      window.sessionStorage.removeItem("eve-chat-draft");
    }
  }, [viewer]);

  useEffect(() => {
    setDismissedError(null);
  }, [clientError]);

  const handleSubmit = useCallback(
    (text: string) => {
      const message = text.trim();

      if (!message || submittingRef.current) {
        return;
      }

      setClientError(null);

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        setClientError(lengthError);
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setDraft("");

      const provisionalChatId = createProvisionalChatId();
      const didStoreMessage = writePendingChatMessage(
        provisionalChatId,
        message
      );

      if (!didStoreMessage) {
        submittingRef.current = false;
        setSubmitting(false);
        setDraft(message);
        setClientError("Failed to start chat.");
        return;
      }

      setActiveChatId(provisionalChatId);
      router.push(`/chat/${provisionalChatId}`, { scroll: false });
    },
    [requestSignIn, router, setActiveChatId, submitting, viewer]
  );

  const composerDisabledReason = getHomeComposerDisabledReason({
    submitting,
  });

  if (pathname !== "/") {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8">
      {toastError ? (
        <ErrorToast
          message={toastError}
          onDismiss={() => setDismissedError(toastError)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col justify-between px-4 pt-8 pb-4 sm:px-6 sm:pb-6">
        <div className="flex min-h-0 flex-1 items-center justify-center pb-20 sm:pb-[12vh]">
          <div className="w-full max-w-2xl space-y-5 sm:space-y-7 md:space-y-8">
            <ChatComposer
              autoFocus
              disabledReason={composerDisabledReason}
              footerStart={<ComposerFooterControls />}
              isBusy={IDLE_CONTROLLER_STATUS.isBusy}
              isPreparing={submitting}
              onChange={setDraft}
              onStop={() => {}}
              onSubmit={handleSubmit}
              placeholder="Ask anything..."
              value={draft}
            />
          </div>
        </div>
        <TemplateFooterLinks />
      </div>
    </div>
  );
}

function getHomeComposerDisabledReason({
  submitting,
}: {
  readonly submitting: boolean;
}) {
  if (submitting) {
    return "Preparing chat.";
  }
}
