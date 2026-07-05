import type { HandleMessageStreamEvent } from "eve/client";
import { formatResponseError, isAbortError } from "./error";
import { isChatTurnSettledEvent } from "./events";
import { readNdjsonStream } from "./json-utils";
import { sleep } from "./utils";

const STREAM_OPEN_RETRYABLE_STATUS = new Set([
  404, 409, 425, 500, 502, 503, 504,
]);
const STREAM_DISCONNECT_RECONNECT_ATTEMPTS = 3;
const STREAM_IDLE_TIMEOUT_MS = 120_000;
const STREAM_RECONNECT_DELAY_MS = 350;

export function isStreamDisconnectError(error: unknown) {
  if (isAbortError(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;

  return (
    error.name === "AbortError" ||
    error.message === "terminated" ||
    code === "UND_ERR_SOCKET" ||
    /abort|cancel|disconnect|premature close|socket|terminated/i.test(
      error.message
    )
  );
}

export async function openStreamBody({
  sessionId,
  signal,
  startIndex,
}: {
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly startIndex: number;
}) {
  const path = `/eve/v1/session/${encodeURIComponent(sessionId)}/stream`;
  const query =
    startIndex > 0
      ? `?${new URLSearchParams({ startIndex: String(startIndex) })}`
      : "";
  let status = 0;
  let body = "Failed to open message stream.";

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${path}${query}`, {
      signal: signal ?? null,
    });

    if (response.ok) {
      if (!response.body) {
        throw new Error("Response body is null.");
      }

      return response.body;
    }

    status = response.status;
    body = await response.text();

    if (!STREAM_OPEN_RETRYABLE_STATUS.has(response.status)) {
      throw new Error(formatResponseError(status, body));
    }

    if (attempt < 11) {
      await sleep(250);
    }
  }

  throw new Error(formatResponseError(status, body));
}

export function namespaceStreamEvent(
  event: HandleMessageStreamEvent,
  namespace: string | undefined
): HandleMessageStreamEvent {
  if (!namespace) {
    return event;
  }

  if (!("data" in event) || typeof event.data !== "object" || !event.data) {
    return event;
  }

  const turnId =
    "turnId" in event.data && typeof event.data.turnId === "string"
      ? event.data.turnId
      : undefined;

  if (!turnId) {
    return event;
  }

  const prefix = `${namespace}:`;

  if (turnId.startsWith(prefix)) {
    return event;
  }

  return {
    ...event,
    data: {
      ...event.data,
      turnId: `${prefix}${turnId}`,
    },
  } as HandleMessageStreamEvent;
}

export async function* streamSessionEvents({
  ignoreLeadingWaiting = false,
  onFinalize,
  sessionId,
  signal,
  startIndex,
}: {
  readonly ignoreLeadingWaiting?: boolean;
  readonly onFinalize: (events: readonly HandleMessageStreamEvent[]) => void;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly startIndex: number;
}) {
  const events: HandleMessageStreamEvent[] = [];
  let nextIndex = startIndex;
  let disconnectReconnectsRemaining = STREAM_DISCONNECT_RECONNECT_ATTEMPTS;
  let lastProgressAt = Date.now();

  try {
    for (;;) {
      let disconnected = false;
      let foundBoundary = false;
      const body = await openStreamBody({
        sessionId,
        signal,
        startIndex: nextIndex,
      });

      try {
        for await (const event of readNdjsonStream(body)) {
          events.push(event);
          nextIndex += 1;
          lastProgressAt = Date.now();
          disconnectReconnectsRemaining = STREAM_DISCONNECT_RECONNECT_ATTEMPTS;
          yield event;

          const isStaleLeadingWaiting =
            ignoreLeadingWaiting &&
            events.length === 1 &&
            event.type === "session.waiting";

          if (isChatTurnSettledEvent(event) && !isStaleLeadingWaiting) {
            foundBoundary = true;
            break;
          }
        }
      } catch (error) {
        if (!isStreamDisconnectError(error)) {
          throw error;
        }

        disconnected = true;
      }

      if (foundBoundary || signal?.aborted) {
        return;
      }

      if (Date.now() - lastProgressAt >= STREAM_IDLE_TIMEOUT_MS) {
        return;
      }

      if (disconnected) {
        if (disconnectReconnectsRemaining <= 0) {
          return;
        }

        disconnectReconnectsRemaining -= 1;
      }

      await sleep(STREAM_RECONNECT_DELAY_MS);
    }
  } finally {
    onFinalize(events);
  }
}

export function createBrowserMessageResponse({
  continuationToken,
  ignoreLeadingWaiting = false,
  onFinalize,
  sessionId,
  signal,
  startIndex,
}: {
  readonly continuationToken?: string;
  readonly ignoreLeadingWaiting?: boolean;
  readonly onFinalize: (events: readonly HandleMessageStreamEvent[]) => void;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly startIndex: number;
}) {
  let consumed = false;

  return {
    continuationToken,
    sessionId,
    [Symbol.asyncIterator]() {
      if (consumed) {
        throw new Error("MessageResponse has already been consumed.");
      }

      consumed = true;

      return streamSessionEvents({
        ignoreLeadingWaiting,
        onFinalize,
        sessionId,
        signal,
        startIndex,
      })[Symbol.asyncIterator]();
    },
  };
}
