import type {
  ClientSession,
  HandleMessageStreamEvent,
  SendTurnInput,
  SessionState,
} from "eve/client";
import { readResponseError } from "./error";
import { findBoundaryEvent } from "./events";
import { createBrowserMessageResponse, streamSessionEvents } from "./stream";

export function createInitialSessionState(): SessionState {
  return { streamIndex: 0 };
}

function advanceBrowserSession({
  baseStreamIndex,
  continuationToken,
  events,
  session,
  sessionId,
}: {
  readonly baseStreamIndex: number;
  readonly continuationToken?: string;
  readonly events: readonly HandleMessageStreamEvent[];
  readonly session: SessionState;
  readonly sessionId: string;
}) {
  const boundary = findBoundaryEvent(events);

  if (boundary?.type === "session.waiting") {
    return {
      continuationToken: continuationToken ?? session.continuationToken,
      sessionId,
      streamIndex: baseStreamIndex + events.length,
    };
  }

  const lastEvent = events.at(-1);

  if (lastEvent?.type === "authorization.required") {
    return {
      continuationToken: continuationToken ?? session.continuationToken,
      sessionId,
      streamIndex: baseStreamIndex + events.length,
    };
  }

  return createInitialSessionState();
}

export function advanceSessionWithLocalEvents(
  session: SessionState,
  events: readonly HandleMessageStreamEvent[]
) {
  if (events.length === 0 || !session.sessionId) {
    return session;
  }

  return advanceBrowserSession({
    baseStreamIndex: session.streamIndex,
    continuationToken: session.continuationToken,
    events,
    session,
    sessionId: session.sessionId,
  });
}

export function createSessionWaitingEvent(): HandleMessageStreamEvent {
  return {
    data: {
      wait: "next-user-message",
    },
    meta: {
      at: new Date().toISOString(),
    },
    type: "session.waiting",
  };
}

export function normalizeSendInput(input: SendTurnInput) {
  return typeof input === "string" ? { message: input } : input;
}

function createHandleMessageBody({
  input,
  session,
}: {
  readonly input: ReturnType<typeof normalizeSendInput>;
  readonly session: SessionState;
}) {
  const body: Record<string, unknown> = {};

  if (input.message !== undefined) {
    body.message = input.message;
  }

  if (input.inputResponses !== undefined && input.inputResponses.length > 0) {
    body.inputResponses = input.inputResponses;
  }

  if (input.clientContext !== undefined) {
    body.clientContext = input.clientContext;
  }

  if (input.outputSchema !== undefined) {
    body.outputSchema = input.outputSchema;
  }

  if (session.continuationToken !== undefined) {
    body.continuationToken = session.continuationToken;
  }

  if (Object.keys(body).length === 0) {
    return null;
  }

  if (session.continuationToken === undefined && body.message === undefined) {
    return null;
  }

  if (
    session.continuationToken !== undefined &&
    body.message === undefined &&
    body.inputResponses === undefined
  ) {
    return null;
  }

  return body;
}

export function isSnapshotForCurrentSession(
  snapshotSession: SessionState,
  currentSession: SessionState | undefined
) {
  if (!snapshotSession.sessionId) {
    return true;
  }

  return snapshotSession.sessionId === currentSession?.sessionId;
}

const EVE_CREATE_SESSION_PATH = "/eve/v1/session";
const EVE_SESSION_ID_HEADER = "x-eve-session-id";

async function postSessionTurn(
  session: SessionState,
  input: ReturnType<typeof normalizeSendInput>
) {
  const body = createHandleMessageBody({ input, session });

  if (!body) {
    throw new Error("Session turn requires a message or input response.");
  }

  const response = await fetch(
    session.sessionId
      ? `/eve/v1/session/${encodeURIComponent(session.sessionId)}`
      : EVE_CREATE_SESSION_PATH,
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...input.headers,
      },
      method: "POST",
      signal: input.signal ?? null,
    }
  );

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const payload = (await response.json()) as {
    readonly continuationToken?: unknown;
    readonly sessionId?: unknown;
  };
  const sessionId =
    (typeof payload.sessionId === "string" ? payload.sessionId : undefined) ??
    response.headers.get(EVE_SESSION_ID_HEADER)?.trim();

  if (!sessionId) {
    throw new Error("Message route did not return a session id.");
  }

  return {
    continuationToken:
      typeof payload.continuationToken === "string"
        ? payload.continuationToken
        : undefined,
    sessionId,
  };
}

export type StreamSessionOptions = {
  readonly ignoreLeadingWaiting?: boolean;
  readonly signal?: AbortSignal;
  readonly startIndex?: number;
};

export type PersistedClientSession = ClientSession & {
  readonly state: SessionState;
  applyLocalEvents: (
    events: readonly HandleMessageStreamEvent[]
  ) => SessionState;
  setState: (session: SessionState) => void;
};

export function createPersistedClientSession({
  initialSession,
  onSessionStarted,
}: {
  readonly initialSession?: SessionState;
  readonly onSessionStarted: (session: SessionState) => Promise<void> | void;
}) {
  let session = initialSession ?? createInitialSessionState();

  return {
    get state() {
      return session;
    },
    async send(input: SendTurnInput) {
      const previousSession = session;
      const normalizedInput = normalizeSendInput(input);
      const response = await postSessionTurn(previousSession, normalizedInput);
      const startedSession = {
        ...previousSession,
        continuationToken:
          response.continuationToken ?? previousSession.continuationToken,
        sessionId: response.sessionId,
        streamIndex:
          previousSession.sessionId === response.sessionId
            ? previousSession.streamIndex
            : 0,
      };

      session = startedSession;

      await onSessionStarted(startedSession);

      return createBrowserMessageResponse({
        continuationToken: response.continuationToken,
        ignoreLeadingWaiting:
          Boolean(previousSession.sessionId) &&
          previousSession.sessionId === response.sessionId &&
          startedSession.streamIndex > 0,
        onFinalize: (events) => {
          session = advanceBrowserSession({
            baseStreamIndex: startedSession.streamIndex,
            continuationToken: response.continuationToken,
            events,
            session: startedSession,
            sessionId: response.sessionId,
          });
        },
        sessionId: response.sessionId,
        signal: normalizedInput.signal,
        startIndex: startedSession.streamIndex,
      });
    },
    stream(options?: StreamSessionOptions) {
      const sessionId = session.sessionId;

      if (!sessionId) {
        throw new Error("Session has no session ID. Send a message first.");
      }

      const startIndex = options?.startIndex ?? session.streamIndex;

      return streamSessionEvents({
        ignoreLeadingWaiting: options?.ignoreLeadingWaiting,
        onFinalize: (events) => {
          session = advanceBrowserSession({
            baseStreamIndex: startIndex,
            continuationToken: session.continuationToken,
            events,
            session,
            sessionId,
          });
        },
        sessionId,
        signal: options?.signal,
        startIndex,
      });
    },
    applyLocalEvents(events: readonly HandleMessageStreamEvent[]) {
      if (!session.sessionId) {
        throw new Error("Session has no session ID.");
      }

      session = advanceBrowserSession({
        baseStreamIndex: session.streamIndex,
        continuationToken: session.continuationToken,
        events,
        session,
        sessionId: session.sessionId,
      });

      return session;
    },
    setState(nextSession: SessionState) {
      session = nextSession;
    },
  } as unknown as PersistedClientSession;
}
