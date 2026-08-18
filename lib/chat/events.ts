import { isDeepEqualData } from "ai";
import type { EveMessageData, MessageStreamEvent } from "eve/client";
import { defaultMessageReducer } from "eve/react";

export function areSameStreamEvent(
  left: MessageStreamEvent,
  right: MessageStreamEvent | undefined
) {
  if (right === undefined) {
    return false;
  }

  const leftId = left.meta?.id;
  const rightId = right.meta?.id;

  if (leftId && rightId) {
    return leftId === rightId;
  }

  return isDeepEqualData(left, right);
}

export function appendUniqueStreamEvent(
  events: readonly MessageStreamEvent[],
  event: MessageStreamEvent
): MessageStreamEvent[] {
  if (
    events.some((existingEvent) => areSameStreamEvent(existingEvent, event))
  ) {
    return events as MessageStreamEvent[];
  }

  return [...events, event];
}

function countSharedEventPrefix(
  events: readonly MessageStreamEvent[],
  knownEvents: readonly MessageStreamEvent[]
) {
  const count = Math.min(events.length, knownEvents.length);

  for (let index = 0; index < count; index += 1) {
    if (!areSameStreamEvent(knownEvents[index]!, events[index])) {
      return index;
    }
  }

  return count;
}

export function findBoundaryEvent(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event && isChatTurnSettledEvent(event)) {
      return event;
    }
  }
}

export function getLocalEventKey(event: MessageStreamEvent) {
  if (event.type === "authorization.completed") {
    return `${event.type}:${event.data.turnId}:${event.data.name}:${event.data.outcome}:${event.data.reason ?? ""}`;
  }

  if (event.type === "session.waiting") {
    return `${event.type}:${event.meta?.at ?? "local"}`;
  }

  return null;
}

export function isChatTurnSettledEvent(event: MessageStreamEvent) {
  return (
    event.type === "authorization.required" ||
    event.type === "session.completed" ||
    event.type === "session.failed" ||
    event.type === "session.waiting"
  );
}

export function hasOpenChatTurn(events: readonly MessageStreamEvent[]) {
  let open = false;

  for (const event of events) {
    if (event.type === "turn.started") {
      open = true;
    } else if (isChatTurnSettledEvent(event)) {
      open = false;
    }
  }

  return open;
}

export function mergeLocalEvents(
  events: readonly MessageStreamEvent[],
  localEvents: readonly MessageStreamEvent[]
): MessageStreamEvent[] {
  const merged = [...events];

  if (localEvents.length === 0) {
    return merged;
  }

  const keys = new Set(events.map(getLocalEventKey).filter(Boolean));

  for (const event of localEvents) {
    const key = getLocalEventKey(event);

    if (!key || keys.has(key)) {
      continue;
    }

    keys.add(key);
    merged.push(event);
  }

  return merged;
}

export function mergeStreamEventLogs(
  events: readonly MessageStreamEvent[],
  streamedEvents: readonly MessageStreamEvent[]
): MessageStreamEvent[] {
  if (streamedEvents.length === 0) {
    return events as MessageStreamEvent[];
  }

  let merged: MessageStreamEvent[] = [...events];

  for (const event of streamedEvents) {
    const next = appendUniqueStreamEvent(merged, event);

    if (next !== merged) {
      merged = next;
    }
  }

  return merged;
}

export function preserveKnownInitialEvents(
  snapshotEvents: readonly MessageStreamEvent[],
  knownEvents: readonly MessageStreamEvent[]
) {
  if (knownEvents.length === 0) {
    return snapshotEvents;
  }

  if (snapshotEvents.length === 0) {
    return knownEvents;
  }

  const sharedPrefixLength = countSharedEventPrefix(
    snapshotEvents,
    knownEvents
  );

  if (sharedPrefixLength === knownEvents.length) {
    return snapshotEvents;
  }

  if (sharedPrefixLength === snapshotEvents.length) {
    return knownEvents;
  }

  if (sharedPrefixLength > 0) {
    return [...knownEvents, ...snapshotEvents.slice(sharedPrefixLength)];
  }

  return [...knownEvents, ...snapshotEvents];
}

export function reduceEventsToMessageData(
  events: readonly MessageStreamEvent[]
): EveMessageData {
  const reducer = defaultMessageReducer();
  let data = reducer.initial();

  for (const event of events) {
    data = reducer.reduce(data, event);
  }

  return data;
}
