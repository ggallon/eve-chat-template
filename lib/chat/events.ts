import type { EveMessageData, HandleMessageStreamEvent } from "eve/client";
import { defaultMessageReducer } from "eve/react";

import { areEqualJsonValues } from "./json-utils";

function areSameStreamEvent(
  left: HandleMessageStreamEvent,
  right: HandleMessageStreamEvent | undefined
) {
  return right !== undefined && areEqualJsonValues(left, right);
}

export function appendUniqueStreamEvent(
  events: readonly HandleMessageStreamEvent[],
  event: HandleMessageStreamEvent
): HandleMessageStreamEvent[] {
  if (
    events.some((existingEvent) => areSameStreamEvent(existingEvent, event))
  ) {
    return events as HandleMessageStreamEvent[];
  }

  return [...events, event];
}

function countSharedEventPrefix(
  events: readonly HandleMessageStreamEvent[],
  knownEvents: readonly HandleMessageStreamEvent[]
) {
  const count = Math.min(events.length, knownEvents.length);

  for (let index = 0; index < count; index += 1) {
    if (!areSameStreamEvent(knownEvents[index]!, events[index])) {
      return index;
    }
  }

  return count;
}

export function findBoundaryEvent(events: readonly HandleMessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event && isChatTurnSettledEvent(event)) {
      return event;
    }
  }
}

export function getLocalEventKey(event: HandleMessageStreamEvent) {
  if (event.type === "authorization.completed") {
    return `${event.type}:${event.data.turnId}:${event.data.name}:${event.data.outcome}:${event.data.reason ?? ""}`;
  }

  if (event.type === "session.waiting") {
    return `${event.type}:${event.meta?.at ?? "local"}`;
  }

  return null;
}

export function isChatTurnSettledEvent(event: HandleMessageStreamEvent) {
  return (
    event.type === "authorization.required" ||
    event.type === "session.completed" ||
    event.type === "session.failed" ||
    event.type === "session.waiting"
  );
}

export function hasOpenChatTurn(events: readonly HandleMessageStreamEvent[]) {
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
  events: readonly HandleMessageStreamEvent[],
  localEvents: readonly HandleMessageStreamEvent[]
): HandleMessageStreamEvent[] {
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
  events: readonly HandleMessageStreamEvent[],
  streamedEvents: readonly HandleMessageStreamEvent[]
): HandleMessageStreamEvent[] {
  if (streamedEvents.length === 0) {
    return events as HandleMessageStreamEvent[];
  }

  let merged: HandleMessageStreamEvent[] = [...events];

  for (const event of streamedEvents) {
    const next = appendUniqueStreamEvent(merged, event);

    if (next !== merged) {
      merged = next;
    }
  }

  return merged;
}

export function preserveKnownInitialEvents(
  snapshotEvents: readonly HandleMessageStreamEvent[],
  knownEvents: readonly HandleMessageStreamEvent[]
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
  events: readonly HandleMessageStreamEvent[]
): EveMessageData {
  const reducer = defaultMessageReducer();
  let data = reducer.initial();

  for (const event of events) {
    data = reducer.reduce(data, event);
  }

  return data;
}
