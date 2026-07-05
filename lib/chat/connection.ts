import type {
  AuthorizationRequiredStreamEvent,
  HandleMessageStreamEvent,
} from "eve/client";
import { createSessionWaitingEvent } from "./session";
import type { EnabledConnections } from "./types";

export type PendingConnectionAuthorization = {
  readonly description: string;
  readonly displayName: string;
  readonly expiresAt?: string;
  readonly instructions?: string;
  readonly key: string;
  readonly name: string;
  readonly sequence: number;
  readonly stepIndex: number;
  readonly turnId: string;
  readonly url?: string;
  readonly authorization?: AuthorizationRequiredStreamEvent["data"]["authorization"];
};

const CONNECTION_LABELS = {
  linear: "Linear",
  notion: "Notion",
  sentry: "Sentry",
} satisfies Record<keyof EnabledConnections, string>;

export function createAuthorizationDeclinedEvents(
  authorization: PendingConnectionAuthorization
): readonly HandleMessageStreamEvent[] {
  return [
    {
      data: {
        authorization: authorization.authorization,
        name: authorization.name,
        outcome: "declined",
        reason: "skipped",
        sequence: authorization.sequence,
        stepIndex: authorization.stepIndex,
        turnId: authorization.turnId,
      },
      type: "authorization.completed",
    },
    createSessionWaitingEvent(),
  ];
}

export function createConnectionClientContext(
  enabledConnections: EnabledConnections
) {
  const entries = Object.entries(CONNECTION_LABELS) as [
    keyof EnabledConnections,
    string,
  ][];
  const enabled = entries
    .filter(([connection]) => enabledConnections[connection])
    .map(([, label]) => label);
  const disabled = entries
    .filter(([connection]) => !enabledConnections[connection])
    .map(([, label]) => label);

  if (enabled.length > 0) {
    const disabledContext =
      disabled.length > 0
        ? ` Do not use disabled connections unless the user enables them first: ${disabled.join(", ")}.`
        : "";

    return `The user has enabled these external connections for this turn: ${enabled.join(", ")}. Use an enabled connection when it is relevant to the user's request.${disabledContext}`;
  }

  return "The user has disabled all external connections for this turn. Do not search or call connection tools unless the user enables a connection first.";
}

function toPendingAuthorization(
  event: AuthorizationRequiredStreamEvent
): PendingConnectionAuthorization {
  const challenge = event.data.authorization;
  const displayName = challenge?.displayName ?? event.data.name;

  return {
    authorization: challenge,
    description:
      challenge?.instructions ??
      event.data.description ??
      `Connect ${displayName} to let eve continue.`,
    displayName,
    expiresAt: challenge?.expiresAt,
    instructions: challenge?.instructions,
    key: `${event.data.turnId}:${event.data.name}`,
    name: event.data.name,
    sequence: event.data.sequence,
    stepIndex: event.data.stepIndex,
    turnId: event.data.turnId,
    url: challenge?.url,
  };
}

export function getConnectionAuthorizationDisabledReason(
  authorizations: readonly PendingConnectionAuthorization[]
) {
  const displayName = authorizations[0]?.displayName ?? "the requested service";

  return `Connect ${displayName} to continue this turn, or skip it.`;
}

export function getPendingAuthorizations(
  events: readonly HandleMessageStreamEvent[]
) {
  const pending = new Map<string, PendingConnectionAuthorization>();

  for (const event of events) {
    if (event.type === "authorization.required") {
      const authorization = toPendingAuthorization(event);
      pending.set(authorization.name, authorization);
      continue;
    }

    if (event.type === "authorization.completed") {
      pending.delete(event.data.name);
    }
  }

  return [...pending.values()];
}
