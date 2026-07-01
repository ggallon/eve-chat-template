import { describe, expect, it } from "vitest";

import { assertChatMessageLength, MAX_CHAT_MESSAGE_CHARS } from "./limits";

describe("assertChatMessageLength", () => {
  it("does not throw for a message at the maximum length", () => {
    expect(() =>
      assertChatMessageLength("a".repeat(MAX_CHAT_MESSAGE_CHARS))
    ).not.toThrow();
  });

  it("does not throw for a message shorter than the maximum length", () => {
    expect(() => assertChatMessageLength("a".repeat(10))).not.toThrow();
  });

  it("does not throw when leading and trailing whitespace bring the raw length over the max but the trimmed length is within it", () => {
    const padded = `   ${"a".repeat(MAX_CHAT_MESSAGE_CHARS)}   `;

    expect(() => assertChatMessageLength(padded)).not.toThrow();
  });

  it("does not throw for a message of max-length emoji (code-point semantics)", () => {
    expect(() =>
      assertChatMessageLength("😀".repeat(MAX_CHAT_MESSAGE_CHARS))
    ).not.toThrow();
  });

  it("throws for a message one code point over the maximum length", () => {
    expect(() =>
      assertChatMessageLength("a".repeat(MAX_CHAT_MESSAGE_CHARS + 1))
    ).toThrow();
  });

  it("throws for a message of max-plus-one emoji", () => {
    expect(() =>
      assertChatMessageLength("😀".repeat(MAX_CHAT_MESSAGE_CHARS + 1))
    ).toThrow();
  });

  it("throws for a message far over the maximum length", () => {
    expect(() =>
      assertChatMessageLength("a".repeat(MAX_CHAT_MESSAGE_CHARS * 10))
    ).toThrow();
  });

  it("throws an error whose message names the formatted limit and the character budget", () => {
    expect(() =>
      assertChatMessageLength("a".repeat(MAX_CHAT_MESSAGE_CHARS + 1))
    ).toThrow("Messages must be 8 000 characters or fewer.");
  });
});
