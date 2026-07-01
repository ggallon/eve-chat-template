import { describe, expect, it } from "vitest";

import { createFallbackTitle, DEFAULT_CHAT_TITLE } from "./title";

describe("createFallbackTitle", () => {
  describe("fallback to default", () => {
    it("returns the default title for an empty string", () => {
      expect(createFallbackTitle("")).toBe(DEFAULT_CHAT_TITLE);
    });

    it("returns the default title for a whitespace-only string", () => {
      expect(createFallbackTitle("   \t\n")).toBe(DEFAULT_CHAT_TITLE);
    });

    it("returns the default title when only markdown decoration remains", () => {
      expect(createFallbackTitle("# * _ ` >")).toBe(DEFAULT_CHAT_TITLE);
    });
  });

  describe("whitespace and markdown normalization", () => {
    it("collapses repeated whitespace into single spaces", () => {
      expect(createFallbackTitle("hello    world\t\nfoo")).toBe(
        "hello world foo"
      );
    });

    it("strips markdown decoration characters", () => {
      expect(
        createFallbackTitle("**bold** _italic_ `code` # heading > quote")
      ).toBe("bold italic code  heading  quote");
    });

    it("strips a leading heading marker and trims the result", () => {
      expect(createFallbackTitle("# Hi\n\nbody")).toBe("Hi body");
    });
  });

  describe("truncation boundary", () => {
    it("leaves a 72-character title unchanged", () => {
      const input = "a".repeat(72);

      expect(createFallbackTitle(input)).toBe(input);
      expect(createFallbackTitle(input)).toHaveLength(72);
    });

    it("truncates a 73-character title to 69 characters plus an ellipsis", () => {
      const input = "a".repeat(73);
      const expected = `${"a".repeat(69)}...`;

      expect(createFallbackTitle(input)).toBe(expected);
      expect(createFallbackTitle(input)).toHaveLength(72);
    });

    it("trimEnds the truncated prefix before appending the ellipsis", () => {
      const input = `${"a".repeat(68)} ${"b".repeat(10)}`;

      expect(createFallbackTitle(input)).toBe(`${"a".repeat(68)}...`);
      expect(createFallbackTitle(input)).toHaveLength(71);
    });

    it("truncates a very long title", () => {
      const input = "a".repeat(1000);

      expect(createFallbackTitle(input)).toBe(`${"a".repeat(69)}...`);
      expect(createFallbackTitle(input)).toHaveLength(72);
    });
  });
});
