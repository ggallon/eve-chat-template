"use client";

import type {
  EveAgentStoreSnapshot,
  EveMessageData,
  HandleMessageStreamEvent,
  SessionState,
} from "eve/client";
import { useEveAgent } from "eve/react";
import { ExternalLinkIcon, PlugIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  appendChatEventAction,
  checkSendLimitAction,
  clearChatPendingMessageAction,
  createChatAction,
  markChatPendingMessageAction,
  saveChatSessionStateAction,
  saveChatSnapshotAction,
  skipChatAuthorizationAction,
} from "@/app/actions/chat";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/conversation";
import { AgentMessage } from "@/components/chat/message";
import { Button } from "@/components/ui/button";
import {
  createAuthorizationDeclinedEvents,
  createConnectionClientContext,
  getConnectionAuthorizationDisabledReason,
  getPendingAuthorizations,
  type PendingConnectionAuthorization,
} from "@/lib/chat/connection";
import { isAbortError } from "@/lib/chat/error";
import {
  appendUniqueStreamEvent,
  getLocalEventKey,
  hasOpenChatTurn,
  isChatTurnSettledEvent,
  mergeLocalEvents,
  mergeStreamEventLogs,
  preserveKnownInitialEvents,
  reduceEventsToMessageData,
} from "@/lib/chat/events";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import {
  appendPendingUserMessages,
  createPendingUserMessage,
  hasLatestUserMessage,
} from "@/lib/chat/message";
import {
  advanceSessionWithLocalEvents,
  createInitialSessionState,
  createPersistedClientSession,
  isSnapshotForCurrentSession,
  type PersistedClientSession,
  type StreamSessionOptions,
} from "@/lib/chat/session";
import { namespaceStreamEvent } from "@/lib/chat/stream";
import type { ActiveChat } from "@/lib/chat/types";
import { useChatShell } from "./chat-shell-context";
import { IDLE_CONTROLLER_STATUS } from "./controller";
import { ErrorToast } from "./error-toast";
import type {
  AgentChatController,
  AgentChatControllerStatus,
  DraftHandlers,
} from "./types";

type AgentSnapshot = EveAgentStoreSnapshot<EveMessageData>;

const THINKING_EXIT_DURATION_MS = 180;
const TURN_FINALIZE_SETTLE_DELAY_MS = 250;

export function AgentChatSession({
  activeChat,
  chatId,
  emptyComposer,
  onActiveChatUpdated,
  onPendingUserMessageSettled,
  onControllerChange,
  pendingUserMessage,
}: {
  readonly activeChat: ActiveChat | null;
  readonly chatId?: string | null;
  readonly emptyComposer?: ReactNode;
  readonly onActiveChatUpdated?: (activeChat: ActiveChat) => void;
  readonly onPendingUserMessageSettled?: (message?: string) => void;
  readonly onControllerChange: (
    controller: AgentChatController | null,
    status: AgentChatControllerStatus
  ) => void;
  readonly pendingUserMessage?: string | null;
}) {
  const {
    activeChatId: shellActiveChatId,
    enabledConnections,
    requestSignIn,
    setActiveChatId: setShellActiveChatId,
    touchChat,
    viewer,
  } = useChatShell();
  const [activeChatId, setActiveChatId] = useState(
    activeChat?.id ?? chatId ?? null
  );
  const [currentTitle, setCurrentTitle] = useState(
    activeChat?.title ?? "New chat"
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [resumedEvents, setResumedEvents] = useState<
    HandleMessageStreamEvent[]
  >([]);
  const [isResuming, setIsResuming] = useState(false);
  const [isFinalizingTurn, setIsFinalizingTurn] = useState(false);
  const [streamEvents, setStreamEvents] = useState<HandleMessageStreamEvent[]>(
    []
  );
  const [localEvents, setLocalEvents] = useState<HandleMessageStreamEvent[]>(
    []
  );
  const {
    clearMessage: clearLocalPendingUserMessage,
    message: localPendingUserMessage,
    messageRef: localPendingUserMessageRef,
    setMessage: setLocalPendingUserMessage,
  } = usePendingUserMessage();
  const [skippingAuthorizationKey, setSkippingAuthorizationKey] = useState<
    string | null
  >(null);
  const activeChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const eventIndexRef = useRef(activeChat?.events.length ?? 0);
  const eventIndexChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const knownInitialEventsRef = useRef<readonly HandleMessageStreamEvent[]>(
    activeChat?.events ?? []
  );
  const currentTitleRef = useRef(activeChat?.title ?? "New chat");
  const resumeStartedRef = useRef(false);
  const resumedEventsRef = useRef<HandleMessageStreamEvent[]>([]);
  const streamEventsRef = useRef<HandleMessageStreamEvent[]>([]);
  const localEventsRef = useRef<HandleMessageStreamEvent[]>([]);
  const finalizeTimerRef = useRef<number | null>(null);
  const onSessionStartedRef = useRef<
    (session: SessionState) => Promise<void> | void
  >(() => {});
  const persistedSessionRef = useRef<PersistedClientSession | null>(null);
  persistedSessionRef.current ??= createPersistedClientSession({
    initialSession: activeChat?.session,
    onSessionStarted: (session) => onSessionStartedRef.current(session),
  });
  const router = useRouter();

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current === null) {
      return;
    }

    window.clearTimeout(finalizeTimerRef.current);
    finalizeTimerRef.current = null;
  }, []);

  const startFinalizingTurn = useCallback(() => {
    clearFinalizeTimer();
    setIsFinalizingTurn(true);
  }, [clearFinalizeTimer]);

  const stopFinalizingTurn = useCallback(() => {
    clearFinalizeTimer();
    setIsFinalizingTurn(false);
  }, [clearFinalizeTimer]);

  const finishFinalizingTurn = useCallback(() => {
    clearFinalizeTimer();
    finalizeTimerRef.current = window.setTimeout(() => {
      finalizeTimerRef.current = null;
      setIsFinalizingTurn(false);
    }, TURN_FINALIZE_SETTLE_DELAY_MS);
  }, [clearFinalizeTimer]);

  const persistSnapshot = useCallback(
    async (snapshot: AgentSnapshot) => {
      const chatId = activeChatIdRef.current;

      if (!(viewer && chatId)) {
        stopFinalizingTurn();
        return;
      }

      setClientError(null);

      try {
        if (
          !isSnapshotForCurrentSession(
            snapshot.session,
            persistedSessionRef.current?.state
          )
        ) {
          stopFinalizingTurn();
          return;
        }

        const snapshotEvents =
          streamEventsRef.current.length > 0
            ? mergeStreamEventLogs(
                knownInitialEventsRef.current,
                streamEventsRef.current
              )
            : preserveKnownInitialEvents(
                snapshot.events,
                knownInitialEventsRef.current
              );
        const events = mergeLocalEvents(snapshotEvents, localEventsRef.current);

        const session = advanceSessionWithLocalEvents(
          snapshot.session,
          localEventsRef.current
        );

        await saveChatSnapshotAction({
          chatId,
          events,
          session,
        });
        eventIndexRef.current = events.length;
        knownInitialEventsRef.current = events;
        streamEventsRef.current = [];
        setStreamEvents([]);
        touchChat({
          id: chatId,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });
        onActiveChatUpdated?.({
          events,
          id: chatId,
          pendingUserMessage: null,
          session,
          title: currentTitleRef.current,
        });
        onPendingUserMessageSettled?.();
      } catch (error) {
        setClientError(
          error instanceof Error ? error.message : "Failed to save chat."
        );
      } finally {
        finishFinalizingTurn();
      }
    },
    [
      finishFinalizingTurn,
      onActiveChatUpdated,
      onPendingUserMessageSettled,
      stopFinalizingTurn,
      touchChat,
      viewer,
    ]
  );

  const persistStreamEvent = useCallback(
    (event: HandleMessageStreamEvent) => {
      const displayEvent = namespaceStreamEvent(
        event,
        persistedSessionRef.current?.state.sessionId
      );
      const nextStreamEvents = appendUniqueStreamEvent(
        streamEventsRef.current,
        displayEvent
      );

      if (nextStreamEvents !== streamEventsRef.current) {
        streamEventsRef.current = nextStreamEvents;
        setStreamEvents(nextStreamEvents);
      }

      if (displayEvent.type === "authorization.required") {
        stopFinalizingTurn();
      }

      const chatId = activeChatIdRef.current;

      if (!(viewer && chatId)) {
        return;
      }

      const eventIndex = eventIndexRef.current;
      eventIndexRef.current += 1;

      void appendChatEventAction({
        chatId,
        event: displayEvent,
        eventIndex,
      }).catch((error) => {
        setClientError(
          error instanceof Error
            ? error.message
            : "Failed to save stream progress."
        );
      });
    },
    [stopFinalizingTurn, viewer]
  );

  const persistSessionState = useCallback(
    async (session: SessionState) => {
      const chatId = activeChatIdRef.current;

      if (!(viewer && chatId && session.sessionId)) {
        return;
      }

      try {
        await saveChatSessionStateAction({
          chatId,
          session,
        });
      } catch (error) {
        setClientError(
          error instanceof Error
            ? error.message
            : "Failed to save session state."
        );
      }
    },
    [viewer]
  );

  onSessionStartedRef.current = persistSessionState;

  const agent = useEveAgent({
    initialEvents: activeChat?.events ?? [],
    session: persistedSessionRef.current,
    onEvent: persistStreamEvent,
    onFinish: (snapshot) => {
      void persistSnapshot(snapshot);
    },
  });

  const hasResumeOverlay =
    isResuming || (resumedEvents.length > 0 && streamEvents.length === 0);
  const resumedEventLog = useMemo(
    () => [...(activeChat?.events ?? []), ...resumedEvents],
    [activeChat?.events, resumedEvents]
  );
  const agentEventLog = useMemo(
    () => mergeStreamEventLogs(activeChat?.events ?? [], streamEvents),
    [activeChat?.events, streamEvents]
  );
  const baseDisplayEvents = hasResumeOverlay ? resumedEventLog : agentEventLog;
  const displayEvents = useMemo(
    () => mergeLocalEvents(baseDisplayEvents, localEvents),
    [baseDisplayEvents, localEvents]
  );
  const displayData = useMemo(
    () => reduceEventsToMessageData(displayEvents),
    [displayEvents]
  );
  const displayMessages = displayData.messages;
  const displayChatId = chatId ?? activeChatId ?? "new";
  const hasLocalPendingUserMessage = Boolean(localPendingUserMessage);
  const pendingAuthorizations = getPendingAuthorizations(displayEvents);
  const isWaitingForAuthorization = pendingAuthorizations.length > 0;
  const hasOpenTurn = useMemo(
    () => hasOpenChatTurn(displayEvents),
    [displayEvents]
  );
  const isBusy =
    isResuming ||
    hasLocalPendingUserMessage ||
    (!isWaitingForAuthorization &&
      (hasOpenTurn ||
        agent.status === "submitted" ||
        agent.status === "streaming"));
  const isTurnBlocked = isBusy || isFinalizingTurn;
  const pendingMessage = pendingUserMessage
    ? createPendingUserMessage(displayChatId, pendingUserMessage)
    : null;
  const localPendingMessage = localPendingUserMessage
    ? createPendingUserMessage(
        displayChatId,
        localPendingUserMessage,
        "local-pending-user-message"
      )
    : null;
  const disabledReason = isWaitingForAuthorization
    ? getConnectionAuthorizationDisabledReason(pendingAuthorizations)
    : isFinalizingTurn
      ? "Finishing response."
      : undefined;
  const visibleMessages = appendPendingUserMessages(displayMessages, [
    pendingMessage,
    localPendingMessage,
  ]);
  const isEmpty =
    visibleMessages.length === 0 &&
    !isTurnBlocked &&
    !isWaitingForAuthorization;
  const isChatRoute = Boolean(shellActiveChatId || chatId);
  const showThinking =
    !isWaitingForAuthorization &&
    (Boolean(pendingMessage || localPendingMessage) ||
      hasOpenTurn ||
      isTurnBlocked);
  const thinkingPresence = useThinkingPresence(showThinking);
  const displayError = clientError ?? agent.error?.message ?? null;
  const toastError =
    displayError && dismissedError !== displayError ? displayError : null;

  const resetSession = useCallback(() => {
    agent.reset();
    setActiveChatId(null);
    activeChatIdRef.current = null;
    eventIndexRef.current = 0;
    eventIndexChatIdRef.current = null;
    knownInitialEventsRef.current = [];
    setCurrentTitle("New chat");
    currentTitleRef.current = "New chat";
    resumeStartedRef.current = false;
    resumedEventsRef.current = [];
    streamEventsRef.current = [];
    localEventsRef.current = [];
    setResumedEvents([]);
    setStreamEvents([]);
    setLocalEvents([]);
    stopFinalizingTurn();
    clearLocalPendingUserMessage();
    setIsResuming(false);
    setClientError(null);
  }, [agent, clearLocalPendingUserMessage, stopFinalizingTurn]);

  const prepareSend = useCallback(
    async (firstMessage: string) => {
      const limit = await checkSendLimitAction({ message: firstMessage });

      if (!limit.allowed) {
        setClientError(`${limit.message} Retry in ${limit.retryAfter}s.`);
        return false;
      }

      if (!activeChatIdRef.current) {
        const created = await createChatAction({
          pendingUserMessage: firstMessage,
        });

        touchChat(created);
        setActiveChatId(created.id);
        setShellActiveChatId(created.id);
        activeChatIdRef.current = created.id;
        eventIndexChatIdRef.current = created.id;
        eventIndexRef.current = 0;
        knownInitialEventsRef.current = [];
        setCurrentTitle(created.title);
        currentTitleRef.current = created.title;
        router.replace(`/chat/${created.id}`, { scroll: false });
      }

      return true;
    },
    [router, setShellActiveChatId, touchChat]
  );

  const sendMessage = useCallback(
    async (text: string, draftHandlers: DraftHandlers) => {
      const message = text.trim();

      if (!message || isTurnBlocked || localPendingUserMessageRef.current) {
        return;
      }

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        setClientError(lengthError);
        return;
      }

      if (isWaitingForAuthorization) {
        draftHandlers.restoreDraft(message);
        setClientError(
          disabledReason ?? "Connect the requested service before continuing."
        );
        return;
      }

      const showLocalPendingMessage = () => {
        setLocalPendingUserMessage(message);
        draftHandlers.clearDraft();
      };
      const restoreAfterFailedSend = (errorMessage?: string) => {
        clearLocalPendingUserMessage();
        draftHandlers.restoreDraft(message);

        if (errorMessage) {
          setClientError(errorMessage);
        }
      };
      let ready = false;

      setClientError(null);

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      resumedEventsRef.current = [];
      setResumedEvents([]);
      setIsResuming(false);
      showLocalPendingMessage();
      onPendingUserMessageSettled?.(message);

      try {
        ready = await prepareSend(message);
      } catch (error) {
        restoreAfterFailedSend(
          error instanceof Error ? error.message : "Failed to prepare chat."
        );
        return;
      }

      if (!ready) {
        const chatId = activeChatIdRef.current;

        if (chatId) {
          void clearChatPendingMessageAction(chatId);
        }
        restoreAfterFailedSend();
        return;
      }

      const chatId = activeChatIdRef.current;

      if (!chatId) {
        restoreAfterFailedSend("Chat is still getting ready.");
        return;
      }

      try {
        const updated = await markChatPendingMessageAction({
          chatId,
          message,
        });
        touchChat(updated);
      } catch (error) {
        restoreAfterFailedSend(
          error instanceof Error
            ? error.message
            : "Failed to save pending message."
        );
        return;
      }

      try {
        startFinalizingTurn();
        await agent.send({
          clientContext: createConnectionClientContext(enabledConnections),
          message,
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        stopFinalizingTurn();
        void clearChatPendingMessageAction(chatId);
        restoreAfterFailedSend(
          error instanceof Error ? error.message : "Failed to send message."
        );
      }
    },
    [
      agent,
      clearLocalPendingUserMessage,
      disabledReason,
      enabledConnections,
      isTurnBlocked,
      isWaitingForAuthorization,
      prepareSend,
      requestSignIn,
      setLocalPendingUserMessage,
      startFinalizingTurn,
      stopFinalizingTurn,
      onPendingUserMessageSettled,
      touchChat,
      viewer,
    ]
  );

  const handleInputResponses = useCallback(
    async (
      responses: readonly {
        readonly optionId?: string;
        readonly requestId: string;
        readonly text?: string;
      }[]
    ) => {
      if (isTurnBlocked) {
        return;
      }

      if (!viewer) {
        requestSignIn();
        return;
      }

      if (!activeChatIdRef.current) {
        setClientError("Start a chat before responding.");
        return;
      }

      const limit = await checkSendLimitAction();

      if (!limit.allowed) {
        setClientError(`${limit.message} Retry in ${limit.retryAfter}s.`);
        return;
      }

      try {
        startFinalizingTurn();
        await agent.send({ inputResponses: responses });
      } catch (error) {
        stopFinalizingTurn();
        setClientError(
          error instanceof Error ? error.message : "Failed to send response."
        );
      }
    },
    [
      agent,
      isTurnBlocked,
      requestSignIn,
      startFinalizingTurn,
      stopFinalizingTurn,
      viewer,
    ]
  );

  const handleSkipAuthorization = useCallback(
    async (authorization: PendingConnectionAuthorization) => {
      const chatId = activeChatIdRef.current;

      if (!viewer) {
        requestSignIn();
        return;
      }

      if (!chatId) {
        setClientError("Start a chat before skipping authorization.");
        return;
      }

      const events = createAuthorizationDeclinedEvents(authorization);
      const persistedSession = persistedSessionRef.current;

      if (!persistedSession?.state.sessionId) {
        setClientError("Session is not ready to skip authorization.");
        return;
      }

      const previousSession = persistedSession.state;
      const nextSession = createInitialSessionState();

      agent.stop();
      persistedSession.setState(nextSession);

      const nextLocalEvents = mergeLocalEvents(localEventsRef.current, events);

      localEventsRef.current = nextLocalEvents;
      setLocalEvents(nextLocalEvents);
      setSkippingAuthorizationKey(authorization.key);
      setClientError(null);

      try {
        const result = await skipChatAuthorizationAction({
          chatId,
          events,
          session: nextSession,
        });
        const skippedEvents = mergeLocalEvents(displayEvents, events);

        eventIndexRef.current = Math.max(
          eventIndexRef.current,
          result.eventIndex + result.eventCount
        );
        knownInitialEventsRef.current = skippedEvents;
        const nextStreamEvents = events.reduce<HandleMessageStreamEvent[]>(
          (mergedEvents, event) => appendUniqueStreamEvent(mergedEvents, event),
          streamEventsRef.current
        );

        streamEventsRef.current = nextStreamEvents;
        setStreamEvents(nextStreamEvents);
        localEventsRef.current = [];
        setLocalEvents([]);
        touchChat(result.chat);
        onActiveChatUpdated?.({
          events: skippedEvents,
          id: chatId,
          pendingUserMessage: null,
          session: nextSession,
          title: currentTitleRef.current,
        });
        onPendingUserMessageSettled?.();
      } catch (error) {
        if (previousSession) {
          persistedSessionRef.current?.setState(previousSession);
        }

        const eventKeys = new Set(events.map(getLocalEventKey).filter(Boolean));
        const revertedEvents = localEventsRef.current.filter((localEvent) => {
          const key = getLocalEventKey(localEvent);

          return !(key && eventKeys.has(key));
        });

        localEventsRef.current = revertedEvents;
        setLocalEvents(revertedEvents);
        setClientError(
          error instanceof Error
            ? error.message
            : "Failed to skip authorization."
        );
      } finally {
        setSkippingAuthorizationKey(null);
      }
    },
    [
      agent,
      displayEvents,
      onActiveChatUpdated,
      onPendingUserMessageSettled,
      requestSignIn,
      touchChat,
      viewer,
    ]
  );

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    const nextChatId = activeChat?.id ?? chatId ?? null;
    const nextTitle = activeChat?.title ?? "New chat";
    const nextEventIndex = activeChat?.events.length ?? 0;

    setActiveChatId(nextChatId);
    activeChatIdRef.current = nextChatId;
    if (eventIndexChatIdRef.current !== nextChatId) {
      eventIndexChatIdRef.current = nextChatId;
      eventIndexRef.current = nextEventIndex;
      knownInitialEventsRef.current = activeChat?.events ?? [];
      streamEventsRef.current = [];
      localEventsRef.current = [];
      setStreamEvents([]);
      setLocalEvents([]);
      stopFinalizingTurn();
      clearLocalPendingUserMessage();
    } else if (!isTurnBlocked) {
      eventIndexRef.current = Math.max(eventIndexRef.current, nextEventIndex);
      if (activeChat) {
        knownInitialEventsRef.current = activeChat.events;
      }
    }
    setCurrentTitle(nextTitle);
    currentTitleRef.current = nextTitle;
  }, [
    activeChat?.events.length,
    activeChat?.id,
    activeChat?.title,
    chatId,
    clearLocalPendingUserMessage,
    isTurnBlocked,
    stopFinalizingTurn,
  ]);

  useEffect(() => clearFinalizeTimer, [clearFinalizeTimer]);

  useEffect(() => {
    if (
      !(viewer && activeChat?.session?.sessionId) ||
      resumeStartedRef.current ||
      agent.status !== "ready"
    ) {
      return;
    }

    const abortController = new AbortController();
    const existingEvents = activeChat.events;
    const pendingMessageText = pendingUserMessage ?? null;
    const shouldResumeOpenTurn = hasOpenChatTurn(existingEvents);

    if (!(pendingMessageText || shouldResumeOpenTurn)) {
      return;
    }

    const startIndex = existingEvents.length;
    const shouldIgnoreLeadingWaiting =
      pendingMessageText !== null &&
      !hasLatestUserMessage(
        reduceEventsToMessageData(existingEvents).messages,
        pendingMessageText
      );
    const session = createPersistedClientSession({
      initialSession: activeChat.session,
      onSessionStarted: persistSessionState,
    });
    let cancelled = false;
    let completed = false;

    resumeStartedRef.current = true;
    resumedEventsRef.current = [];
    setResumedEvents([]);
    setIsResuming(true);
    setClientError(null);

    void (async () => {
      try {
        const resumeStreamOptions: StreamSessionOptions = {
          ignoreLeadingWaiting: shouldIgnoreLeadingWaiting,
          signal: abortController.signal,
          startIndex,
        };

        for await (const event of session.stream(resumeStreamOptions)) {
          if (cancelled) {
            return;
          }

          const displayEvent = namespaceStreamEvent(
            event,
            activeChat.session?.sessionId
          );
          const nextEvents = [...resumedEventsRef.current, displayEvent];
          resumedEventsRef.current = nextEvents;
          setResumedEvents(nextEvents);

          await appendChatEventAction({
            chatId: activeChat.id,
            event: displayEvent,
            eventIndex: startIndex + nextEvents.length - 1,
          });

          if (isChatTurnSettledEvent(event)) {
            break;
          }
        }

        if (cancelled) {
          return;
        }

        const newEvents = resumedEventsRef.current;
        const allEvents = [...existingEvents, ...newEvents];

        if (!newEvents.some(isChatTurnSettledEvent)) {
          setClientError("Stream disconnected before the response completed.");
          return;
        }

        await saveChatSnapshotAction({
          chatId: activeChat.id,
          events: allEvents,
          session: session.state,
        });
        eventIndexRef.current = allEvents.length;
        knownInitialEventsRef.current = allEvents;
        resumedEventsRef.current = [];
        setResumedEvents([]);
        touchChat({
          id: activeChat.id,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });
        onActiveChatUpdated?.({
          events: allEvents,
          id: activeChat.id,
          pendingUserMessage: null,
          session: session.state,
          title: currentTitleRef.current,
        });

        onPendingUserMessageSettled?.();
        completed = true;
      } catch (error) {
        if (!(cancelled || isAbortError(error))) {
          setClientError(
            error instanceof Error ? error.message : "Failed to resume stream."
          );
        }
      } finally {
        if (!cancelled) {
          setIsResuming(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (!completed) {
        resumeStartedRef.current = false;
      }
      abortController.abort();
    };
  }, [
    activeChat?.events,
    activeChat?.id,
    activeChat?.session,
    agent.status,
    onActiveChatUpdated,
    onPendingUserMessageSettled,
    pendingUserMessage,
    persistSessionState,
    touchChat,
    viewer,
  ]);

  useEffect(() => {
    currentTitleRef.current = currentTitle;
  }, [currentTitle]);

  useEffect(() => {
    setDismissedError(null);
  }, [displayError]);

  useEffect(() => {
    if (
      localPendingUserMessage &&
      hasLatestUserMessage(displayMessages, localPendingUserMessage)
    ) {
      clearLocalPendingUserMessage();
    }
  }, [clearLocalPendingUserMessage, displayMessages, localPendingUserMessage]);

  useEffect(() => {
    onControllerChange(
      {
        reset: resetSession,
        sendMessage,
        stop: agent.stop,
      },
      {
        disabledReason,
        isBusy,
        isDisabled: isWaitingForAuthorization || isFinalizingTurn,
        isEmpty,
      }
    );
  }, [
    agent.stop,
    disabledReason,
    isBusy,
    isFinalizingTurn,
    isEmpty,
    isWaitingForAuthorization,
    onControllerChange,
    resetSession,
    sendMessage,
  ]);

  useEffect(
    () => () => {
      onControllerChange(null, IDLE_CONTROLLER_STATUS);
    },
    [onControllerChange]
  );

  return (
    <>
      {toastError ? (
        <ErrorToast
          message={toastError}
          onDismiss={() => setDismissedError(toastError)}
        />
      ) : null}

      {isEmpty && !activeChatId && !isChatRoute && emptyComposer ? (
        <EmptyChatBody composer={emptyComposer} />
      ) : (
        <>
          {isChatRoute ? <SessionHeader /> : null}
          {isEmpty ? (
            <BlankChatBody />
          ) : (
            <ChatConversation>
              <ChatConversationContent>
                {visibleMessages.map((message, index) => (
                  <AgentMessage
                    canRespond={
                      !(isTurnBlocked || isWaitingForAuthorization) &&
                      Boolean(viewer)
                    }
                    isStreaming={
                      agent.status === "streaming" &&
                      index === visibleMessages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onInputResponses={handleInputResponses}
                  />
                ))}
                {pendingAuthorizations.map((authorization) => (
                  <ConnectionAuthorizationPrompt
                    authorization={authorization}
                    isSkipping={skippingAuthorizationKey === authorization.key}
                    key={authorization.key}
                    onSkip={handleSkipAuthorization}
                  />
                ))}
                {thinkingPresence.shouldRender ? (
                  <ThinkingMessage isVisible={thinkingPresence.isVisible} />
                ) : null}
              </ChatConversationContent>
              <ChatScrollButton />
            </ChatConversation>
          )}
        </>
      )}
    </>
  );
}

function ConnectionAuthorizationPrompt({
  authorization,
  isSkipping,
  onSkip,
}: {
  readonly authorization: PendingConnectionAuthorization;
  readonly isSkipping: boolean;
  readonly onSkip: (
    authorization: PendingConnectionAuthorization
  ) => Promise<void>;
}) {
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
                <Button asChild size="xs" type="button">
                  <a href={authorization.url} rel="noreferrer" target="_blank">
                    Connect
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </Button>
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

function usePendingUserMessage() {
  const [message, setMessageState] = useState<string | null>(null);
  const messageRef = useRef<string | null>(null);

  const setMessage = useCallback((nextMessage: string | null) => {
    messageRef.current = nextMessage;
    setMessageState(nextMessage);
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, [setMessage]);

  return { clearMessage, message, messageRef, setMessage };
}

function useThinkingPresence(active: boolean) {
  const [shouldRender, setShouldRender] = useState(active);
  const [isVisible, setIsVisible] = useState(active);

  useEffect(() => {
    if (active) {
      setShouldRender(true);

      const frame = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    setIsVisible(false);

    const timeout = window.setTimeout(() => {
      setShouldRender(false);
    }, THINKING_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [active]);

  return { isVisible, shouldRender };
}

function ThinkingMessage({ isVisible }: { readonly isVisible: boolean }) {
  return (
    <article
      aria-live={isVisible ? "polite" : "off"}
      className={[
        "flex w-full justify-start overflow-hidden transition-[opacity,transform,max-height] duration-200 ease-out",
        isVisible
          ? "max-h-8 translate-y-0 opacity-100"
          : "max-h-0 -translate-y-1 opacity-0",
      ].join(" ")}
      role="status"
    >
      <div className="px-3 font-medium text-[15px] text-muted-foreground leading-6">
        <span className="shimmer-text">Thinking...</span>
      </div>
    </article>
  );
}

function SessionHeader() {
  return <div className="h-12 shrink-0" />;
}

function BlankChatBody() {
  return <div className="min-h-0 flex-1" />;
}

function EmptyChatBody({ composer }: { readonly composer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-2xl space-y-8 sm:space-y-10 md:space-y-12">
          {composer}
        </div>
      </div>
    </div>
  );
}
