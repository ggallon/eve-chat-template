"use client";

import { track } from "@vercel/analytics";
import type {
  ClientSessionState,
  EveAgentStoreSnapshot,
  EveMessageData,
  MessageStreamEvent,
} from "eve/client";
import { Client } from "eve/client";
import { useEveAgent } from "eve/react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { clearChatPendingMessageAction } from "@/app/actions/chat";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/conversation";
import { AgentMessage } from "@/components/chat/message";
import { isAbortError } from "@/lib/chat/error";
import {
  appendUniqueStreamEvent,
  areSameStreamEvent,
  isChatTurnSettledEvent,
  mergeStreamEventLogs,
  reduceEventsToMessageData,
} from "@/lib/chat/events";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import {
  appendPendingUserMessages,
  createPendingUserMessage,
  hasLatestUserMessage,
} from "@/lib/chat/message";
import {
  appendClientChatEvents,
  checkClientSendLimit,
  prepareClientChatSend,
  saveClientChatSession,
  saveClientChatSnapshot,
} from "@/lib/chat/persistence-client";
import type { ActiveChat } from "@/lib/chat/types";
import { useChatShell } from "./chat-shell-context";
import { IDLE_AGENT_CHAT_CONTROLLER_STATUS } from "./controller";
import { ErrorToast } from "./error-toast";
import { ThinkingMessage, useThinkingPresence } from "./thinking";
import type {
  AgentChatController,
  AgentChatControllerStatus,
  DraftHandlers,
} from "./types";
import { usePendingUserMessage } from "./use-pending-user-message";

type AgentSnapshot = EveAgentStoreSnapshot<EveMessageData>;

type PendingPersistedEvent = {
  readonly event: MessageStreamEvent;
  readonly eventIndex: number;
};

type TurnTiming = {
  firstEventAt?: number;
  preflightFinishedAt?: number;
  readonly startedAt: number;
};

const THINKING_EXIT_DURATION_MS = 180;
const STREAM_EVENT_BATCH_DELAY_MS = 500;

function getOpenChatTurnId(events: readonly MessageStreamEvent[]) {
  let turnId: string | undefined;

  for (const event of events) {
    if (event.type === "turn.started") {
      turnId = event.data.turnId;
    } else if (isChatTurnSettledEvent(event)) {
      turnId = undefined;
    }
  }

  return turnId;
}

interface AgentChatSession {
  readonly activeChat: ActiveChat | null;
  readonly chatId?: string | null;
  readonly emptyComposer?: ReactNode;
  readonly onActiveChatUpdated?: (activeChat: ActiveChat) => void;
  readonly onControllerChange: (
    controller: AgentChatController | null,
    status: AgentChatControllerStatus
  ) => void;
  readonly onPendingUserMessageSettled?: (message?: string) => void;
  readonly pendingUserMessage?: string | null;
}

export function AgentChatSession({
  activeChat,
  chatId,
  emptyComposer,
  onActiveChatUpdated,
  onPendingUserMessageSettled,
  onControllerChange,
  pendingUserMessage,
}: AgentChatSession) {
  const {
    activeChatId: shellActiveChatId,
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
  const [resumedEvents, setResumedEvents] = useState<MessageStreamEvent[]>([]);
  const [isResuming, setIsResuming] = useState(false);
  const [isFinalizingTurn, setIsFinalizingTurn] = useState(false);
  const [isCancellationRequested, setIsCancellationRequested] = useState(false);
  const {
    clearMessage: clearLocalPendingUserMessage,
    message: localPendingUserMessage,
    messageRef: localPendingUserMessageRef,
    setMessage: setLocalPendingUserMessage,
  } = usePendingUserMessage();
  const activeChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const eventIndexRef = useRef(activeChat?.events.length ?? 0);
  const eventIndexChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const knownInitialEventsRef = useRef<readonly MessageStreamEvent[]>(
    activeChat?.events ?? []
  );
  const currentTitleRef = useRef(activeChat?.title ?? "New chat");
  const resumeStartedRef = useRef(false);
  const resumedEventsRef = useRef<MessageStreamEvent[]>([]);
  const currentSessionRef = useRef<ClientSessionState | undefined>(
    activeChat?.session
  );
  const pendingEventBatchRef = useRef<PendingPersistedEvent[]>([]);
  const persistEventTimerRef = useRef<number | null>(null);
  const turnTimingRef = useRef<TurnTiming | null>(null);
  const eveClientRef = useRef<Client | null>(null);
  const currentTurnIdRef = useRef<string | undefined>(undefined);
  const cancellationRequestedRef = useRef(false);
  const cancellationSentTurnIdRef = useRef<string | undefined>(undefined);
  const failedSendRecoveryRef = useRef<(() => void) | null>(null);
  eveClientRef.current ??= new Client({ host: "" });
  const router = useRouter();

  const clearCancellationState = useCallback(() => {
    cancellationRequestedRef.current = false;
    cancellationSentTurnIdRef.current = undefined;
    setIsCancellationRequested(false);
  }, []);

  const clearTurnState = useCallback(() => {
    currentTurnIdRef.current = undefined;
    clearCancellationState();
  }, [clearCancellationState]);

  const cancelTurn = useCallback(
    (turnId: string) => {
      const sessionId = currentSessionRef.current?.sessionId;

      if (!sessionId || cancellationSentTurnIdRef.current === turnId) {
        return;
      }

      cancellationSentTurnIdRef.current = turnId;

      void eveClientRef.current?.sessions
        .attach(sessionId)
        .cancel({ turnId })
        .catch((error: unknown) => {
          clearCancellationState();
          setClientError(
            error instanceof Error
              ? error.message
              : "Failed to stop the response."
          );
        });
    },
    [clearCancellationState]
  );

  const requestCancellation = useCallback(() => {
    if (cancellationRequestedRef.current) {
      return;
    }

    cancellationRequestedRef.current = true;
    setIsCancellationRequested(true);
    setClientError(null);

    if (currentTurnIdRef.current) {
      cancelTurn(currentTurnIdRef.current);
    }
  }, [cancelTurn]);

  const startFinalizingTurn = useCallback(() => {
    setIsFinalizingTurn(true);
  }, []);

  const stopFinalizingTurn = useCallback(() => {
    setIsFinalizingTurn(false);
  }, []);

  const persistSnapshot = useCallback(
    async (snapshot: AgentSnapshot) => {
      const persistSnapshotChatId = activeChatIdRef.current;
      const timing = turnTimingRef.current;

      if (timing) {
        const finishedAt = performance.now();
        track("Chat response timing", {
          firstEventMs: timing.firstEventAt
            ? Math.round(timing.firstEventAt - timing.startedAt)
            : null,
          preflightMs: timing.preflightFinishedAt
            ? Math.round(timing.preflightFinishedAt - timing.startedAt)
            : null,
          totalMs: Math.round(finishedAt - timing.startedAt),
        });
        turnTimingRef.current = null;
      }

      if (!(viewer && persistSnapshotChatId)) {
        stopFinalizingTurn();
        return;
      }

      if (!snapshot.session) {
        const recoverFailedSend = failedSendRecoveryRef.current;
        failedSendRecoveryRef.current = null;
        recoverFailedSend?.();
        void clearChatPendingMessageAction(persistSnapshotChatId).catch(
          () => {}
        );
        stopFinalizingTurn();
        return;
      }

      setClientError(null);

      try {
        if (persistEventTimerRef.current !== null) {
          window.clearTimeout(persistEventTimerRef.current);
          persistEventTimerRef.current = null;
        }
        pendingEventBatchRef.current = [];

        const events = mergeStreamEventLogs(
          knownInitialEventsRef.current,
          snapshot.events
        );
        const session = snapshot.session;

        await saveClientChatSnapshot({
          chatId: persistSnapshotChatId,
          events,
          session,
        });
        eventIndexRef.current = events.length;
        knownInitialEventsRef.current = events;
        touchChat({
          id: persistSnapshotChatId,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });
        onActiveChatUpdated?.({
          events,
          id: persistSnapshotChatId,
          pendingUserMessage: null,
          session,
          title: currentTitleRef.current,
        });
        onPendingUserMessageSettled?.();
        failedSendRecoveryRef.current = null;
        clearTurnState();
      } catch (error) {
        setClientError(
          error instanceof Error ? error.message : "Failed to save chat."
        );
      } finally {
        stopFinalizingTurn();
      }
    },
    [
      clearTurnState,
      onActiveChatUpdated,
      onPendingUserMessageSettled,
      stopFinalizingTurn,
      touchChat,
      viewer,
    ]
  );

  const flushEventBatch = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    const batch = pendingEventBatchRef.current;

    if (!(viewer && chatId) || batch.length === 0) {
      return;
    }

    pendingEventBatchRef.current = [];

    try {
      await appendClientChatEvents({ chatId, events: batch });
    } catch (error) {
      pendingEventBatchRef.current = [
        ...batch,
        ...pendingEventBatchRef.current,
      ];
      setClientError(
        error instanceof Error
          ? error.message
          : "Failed to save stream progress."
      );
    }
  }, [viewer]);

  const persistStreamEvent = useCallback(
    (event: MessageStreamEvent) => {
      if (event.type === "turn.started") {
        currentTurnIdRef.current = event.data.turnId;

        if (cancellationRequestedRef.current) {
          cancelTurn(event.data.turnId);
        }
      } else if (event.type === "message.received") {
        failedSendRecoveryRef.current = null;
      } else if (isChatTurnSettledEvent(event)) {
        clearTurnState();
      }
      const persistStreamEventChatId = activeChatIdRef.current;

      if (!(viewer && persistStreamEventChatId)) {
        return;
      }

      if (turnTimingRef.current && !turnTimingRef.current.firstEventAt) {
        turnTimingRef.current.firstEventAt = performance.now();
      }

      const eventIndex = eventIndexRef.current;
      eventIndexRef.current += 1;
      pendingEventBatchRef.current.push({ event, eventIndex });

      if (persistEventTimerRef.current === null) {
        persistEventTimerRef.current = window.setTimeout(() => {
          persistEventTimerRef.current = null;
          void flushEventBatch();
        }, STREAM_EVENT_BATCH_DELAY_MS);
      }
    },
    [cancelTurn, clearTurnState, flushEventBatch, viewer]
  );

  const persistSessionState = useCallback(
    async (session: ClientSessionState) => {
      const persistSessionStateChatId = activeChatIdRef.current;

      if (!(viewer && persistSessionStateChatId && session.sessionId)) {
        return;
      }

      try {
        await saveClientChatSession({
          chatId: persistSessionStateChatId,
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

  const agent = useEveAgent({
    initialEvents: activeChat?.events ?? [],
    initialSession: activeChat?.session,
    onEvent: persistStreamEvent,
    onFinish: (snapshot) => {
      startFinalizingTurn();
      void persistSnapshot(snapshot);
    },
    onSessionChange: (session) => {
      currentSessionRef.current = session;

      if (session) {
        void persistSessionState(session);
      }
    },
  });

  const hasResumeOverlay = isResuming || resumedEvents.length > 0;
  const resumedEventLog = useMemo(
    () => mergeStreamEventLogs(activeChat?.events ?? [], resumedEvents),
    [activeChat?.events, resumedEvents]
  );
  const agentEventLog = useMemo(
    () => mergeStreamEventLogs(activeChat?.events ?? [], agent.events),
    [activeChat?.events, agent.events]
  );
  const displayEvents = hasResumeOverlay ? resumedEventLog : agentEventLog;
  const hasEventsOutsideAgent = useMemo(
    () =>
      (activeChat?.events ?? []).some(
        (event) =>
          !agent.events.some((agentEvent) =>
            areSameStreamEvent(agentEvent, event)
          )
      ),
    [activeChat?.events, agent.events]
  );
  const projectedDisplayData = useMemo(
    () => reduceEventsToMessageData(displayEvents),
    [displayEvents]
  );
  const displayData =
    hasResumeOverlay || hasEventsOutsideAgent
      ? projectedDisplayData
      : agent.data;
  const displayMessages = displayData.messages;
  const displayChatId = chatId ?? activeChatId ?? "new";
  const hasUnconfirmedLocalPendingUserMessage = Boolean(
    localPendingUserMessage &&
      !hasLatestUserMessage(displayMessages, localPendingUserMessage)
  );
  const hasOpenDisplayTurn = useMemo(
    () => Boolean(getOpenChatTurnId(displayEvents)),
    [displayEvents]
  );
  const isBusy =
    hasUnconfirmedLocalPendingUserMessage ||
    agent.status === "submitted" ||
    hasOpenDisplayTurn;
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
  const disabledReason = isFinalizingTurn ? "Finishing response." : undefined;
  const visibleMessages = appendPendingUserMessages(displayMessages, [
    pendingMessage,
    localPendingMessage,
  ]);
  const isEmpty = visibleMessages.length === 0 && !isTurnBlocked;
  const isChatRoute = Boolean(shellActiveChatId || chatId);
  const showThinking =
    isBusy && !hasRenderableAssistantProgress(visibleMessages.at(-1));
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
    currentSessionRef.current = undefined;
    clearTurnState();
    failedSendRecoveryRef.current = null;
    setResumedEvents([]);
    stopFinalizingTurn();
    clearLocalPendingUserMessage();
    setIsResuming(false);
    setClientError(null);
  }, [agent, clearLocalPendingUserMessage, clearTurnState, stopFinalizingTurn]);

  const prepareSend = useCallback(
    async (firstMessage: string) => {
      const result = await prepareClientChatSend({
        chatId: activeChatIdRef.current ?? undefined,
        message: firstMessage,
      });

      if (!result.allowed) {
        setClientError(`${result.message} Retry in ${result.retryAfter}s.`);
        return false;
      }

      const preparedChat = result.chat;
      touchChat(preparedChat);

      if (!activeChatIdRef.current) {
        setActiveChatId(preparedChat.id);
        setShellActiveChatId(preparedChat.id);
        activeChatIdRef.current = preparedChat.id;
        eventIndexChatIdRef.current = preparedChat.id;
        eventIndexRef.current = 0;
        knownInitialEventsRef.current = [];
        setCurrentTitle(preparedChat.title);
        currentTitleRef.current = preparedChat.title;
        router.replace(`/chat/${preparedChat.id}`, { scroll: false });
      } else if (preparedChat.title !== currentTitleRef.current) {
        setCurrentTitle(preparedChat.title);
        currentTitleRef.current = preparedChat.title;
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
      turnTimingRef.current = { startedAt: performance.now() };
      clearTurnState();
      failedSendRecoveryRef.current = restoreAfterFailedSend;

      try {
        ready = await prepareSend(message);
        if (turnTimingRef.current) {
          turnTimingRef.current.preflightFinishedAt = performance.now();
        }
      } catch (error) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;
        restoreAfterFailedSend(
          error instanceof Error ? error.message : "Failed to prepare chat."
        );
        return;
      }

      if (!ready) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;
        const pendingChatId = activeChatIdRef.current;

        if (pendingChatId) {
          void clearChatPendingMessageAction(pendingChatId);
        }
        restoreAfterFailedSend();
        return;
      }

      const readyChatId = activeChatIdRef.current;

      if (!readyChatId) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;
        restoreAfterFailedSend("Chat is still getting ready.");
        return;
      }

      try {
        await agent.send(message);
      } catch (error) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;

        if (isAbortError(error)) {
          stopFinalizingTurn();
          return;
        }

        stopFinalizingTurn();
        void clearChatPendingMessageAction(readyChatId);
        restoreAfterFailedSend(
          error instanceof Error ? error.message : "Failed to send message."
        );
      }
    },
    [
      agent,
      clearLocalPendingUserMessage,
      clearTurnState,
      isTurnBlocked,
      prepareSend,
      requestSignIn,
      setLocalPendingUserMessage,
      stopFinalizingTurn,
      onPendingUserMessageSettled,
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

      const limit = await checkClientSendLimit();

      if (!limit.allowed) {
        setClientError(`${limit.message} Retry in ${limit.retryAfter}s.`);
        return;
      }

      try {
        await agent.respond(responses);
      } catch (error) {
        stopFinalizingTurn();
        setClientError(
          error instanceof Error ? error.message : "Failed to send response."
        );
      }
    },
    [agent, isTurnBlocked, requestSignIn, stopFinalizingTurn, viewer]
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
    currentSessionRef.current = activeChat?.session;
    if (eventIndexChatIdRef.current !== nextChatId) {
      eventIndexChatIdRef.current = nextChatId;
      eventIndexRef.current = nextEventIndex;
      knownInitialEventsRef.current = activeChat?.events ?? [];
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

  useEffect(
    () => () => {
      if (persistEventTimerRef.current !== null) {
        window.clearTimeout(persistEventTimerRef.current);
      }
      void flushEventBatch();
    },
    [flushEventBatch]
  );

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
    const openTurnId = getOpenChatTurnId(existingEvents);

    if (!(pendingMessageText || !openTurnId)) {
      return;
    }

    const startIndex = existingEvents.length;
    const shouldIgnoreLeadingWaiting =
      pendingMessageText !== null &&
      !hasLatestUserMessage(
        reduceEventsToMessageData(existingEvents).messages,
        pendingMessageText
      );
    const session = new Client({ host: "" }).sessions.attach(
      activeChat.session.sessionId,
      { streamIndex: startIndex }
    );
    let cancelled = false;
    let completed = false;

    resumeStartedRef.current = true;
    currentTurnIdRef.current = openTurnId;
    resumedEventsRef.current = [];
    setResumedEvents([]);
    setIsResuming(true);
    setClientError(null);

    void (async () => {
      try {
        const resumeStreamOptions = {
          signal: abortController.signal,
          startIndex,
        };

        let isFirstEvent = true;

        for await (const event of session.stream(resumeStreamOptions)) {
          if (cancelled) {
            return;
          }

          if (
            isFirstEvent &&
            shouldIgnoreLeadingWaiting &&
            event.type === "session.waiting"
          ) {
            isFirstEvent = false;
            continue;
          }
          isFirstEvent = false;

          if (event.type === "turn.started") {
            currentTurnIdRef.current = event.data.turnId;

            if (cancellationRequestedRef.current) {
              cancelTurn(event.data.turnId);
            }
          } else if (isChatTurnSettledEvent(event)) {
            clearTurnState();
            setIsResuming(false);
            startFinalizingTurn();
          }

          const nextEvents = appendUniqueStreamEvent(
            resumedEventsRef.current,
            event
          );
          resumedEventsRef.current = nextEvents;
          setResumedEvents(nextEvents);

          if (isChatTurnSettledEvent(event)) {
            break;
          }
        }

        if (cancelled) {
          return;
        }

        const newEvents = resumedEventsRef.current;
        const allEvents = mergeStreamEventLogs(existingEvents, newEvents);

        if (!newEvents.some(isChatTurnSettledEvent)) {
          setClientError("Stream disconnected before the response completed.");
          return;
        }

        await saveClientChatSnapshot({
          chatId: activeChat.id,
          events: allEvents,
          session: session.state,
        });
        eventIndexRef.current = allEvents.length;
        knownInitialEventsRef.current = allEvents;
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
        clearTurnState();
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
          stopFinalizingTurn();
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
    cancelTurn,
    clearTurnState,
    onActiveChatUpdated,
    onPendingUserMessageSettled,
    pendingUserMessage,
    startFinalizingTurn,
    stopFinalizingTurn,
    touchChat,
    viewer,
  ]);

  useEffect(() => {
    currentTitleRef.current = currentTitle;
  }, [currentTitle]);

  useEffect(() => {
    const resumed = resumedEventsRef.current;

    if (
      resumed.length === 0 ||
      !activeChat ||
      !resumed.every((event) =>
        activeChat.events.some((persistedEvent) =>
          areSameStreamEvent(persistedEvent, event)
        )
      )
    ) {
      return;
    }

    resumedEventsRef.current = [];
    setResumedEvents([]);
  }, [activeChat]);

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
        stop: requestCancellation,
      },
      {
        disabledReason,
        isBusy,
        isCancelling: isCancellationRequested,
        isDisabled: isFinalizingTurn,
        isEmpty,
      }
    );
  }, [
    disabledReason,
    isBusy,
    isCancellationRequested,
    isFinalizingTurn,
    isEmpty,
    onControllerChange,
    requestCancellation,
    resetSession,
    sendMessage,
  ]);

  useEffect(
    () => () => {
      onControllerChange(null, IDLE_AGENT_CHAT_CONTROLLER_STATUS);
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
                    canRespond={!isTurnBlocked && Boolean(viewer)}
                    isStreaming={
                      agent.status === "streaming" &&
                      index === visibleMessages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onInputResponses={handleInputResponses}
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

import type { EveMessage } from "eve/react";

function hasRenderableAssistantProgress(message: EveMessage | undefined) {
  if (message?.role !== "assistant") {
    return false;
  }

  return message.parts.some((part) => {
    if (part.type === "step-start") {
      return false;
    }

    if (part.type === "text" || part.type === "reasoning") {
      return part.text.length > 0;
    }

    return true;
  });
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
