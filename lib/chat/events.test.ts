import type { MessageStreamEvent } from "eve/client";

import { describe, expect, it } from "vitest";

import { isChatTurnSettledEvent } from "./events";

describe("isChatTurnSettledEvent", () => {
  describe("settled event types", () => {
    it.each([
      [
        "authorization.required",
        {
          data: {
            description: "Authorize access",
            name: "github",
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "authorization.required",
        },
      ],
      [
        "session.completed",
        {
          data: {},
          meta: { at: "iso-string", id: "1" },
          type: "session.completed",
        },
      ],
      [
        "session.failed",
        {
          data: {
            code: "internal",
            message: "boom",
            sessionId: "session-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "session.failed",
        },
      ],
      [
        "session.waiting",
        {
          data: {
            wait: "next-user-message",
            continuationToken: "test",
          },
          meta: { at: "iso-string", id: "1" },
          type: "session.waiting",
        },
      ],
    ] as Readonly<[string, MessageStreamEvent]>[])(
      "returns true for %s",
      (_, event) => {
        expect(isChatTurnSettledEvent(event)).toBe(true);
      }
    );
  });

  describe("non-settled event types", () => {
    it.each([
      [
        "session.started",
        {
          data: {},
          meta: { at: "iso-string", id: "1" },
          type: "session.started",
        },
      ],
      [
        "turn.started",
        {
          data: { sequence: 0, turnId: "turn-1" },
          meta: { at: "iso-string", id: "1" },
          type: "turn.started",
        },
      ],
      [
        "message.received",
        {
          data: {
            message: "hi",
            sequence: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "message.received",
        },
      ],
      [
        "message.appended",
        {
          data: {
            messageDelta: "hi",
            messageSoFar: "hi",
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "message.appended",
        },
      ],
      [
        "message.completed",
        {
          data: {
            finishReason: "stop",
            message: "hi",
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "message.completed",
        },
      ],
      [
        "actions.requested",
        {
          data: {
            actions: [],
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "actions.requested",
        },
      ],
      [
        "action.result",
        {
          data: {
            result: { kind: "tool", output: "" },
            sequence: 0,
            status: "completed",
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "action.result",
        },
      ],
      [
        "input.requested",
        {
          data: {
            requests: [],
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "input.requested",
        },
      ],
      [
        "step.started",
        {
          data: {
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "step.started",
        },
      ],
      [
        "step.completed",
        {
          data: {
            finishReason: "stop",
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "step.completed",
        },
      ],
      [
        "turn.completed",
        {
          data: { sequence: 0, turnId: "turn-1" },
          type: "turn.completed",
        },
      ],
      [
        "authorization.completed",
        {
          data: {
            name: "github",
            outcome: "authorized",
            sequence: 0,
            stepIndex: 0,
            turnId: "turn-1",
          },
          meta: { at: "iso-string", id: "1" },
          type: "authorization.completed",
        },
      ],
    ] as Readonly<[string, MessageStreamEvent]>[])(
      "returns false for %s",
      (_, event) => {
        expect(isChatTurnSettledEvent(event)).toBe(false);
      }
    );
  });

  it("returns false for an unknown type string", () => {
    const event = {
      type: "unknown.event",
    } as unknown as MessageStreamEvent;

    expect(isChatTurnSettledEvent(event)).toBe(false);
  });
});
