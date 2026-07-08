import { afterEach, describe, expect, it, vi } from "vitest";

import { readAndClearChatDraft, writeChatDraft } from "./draft-storage";

function createFakeSessionStorage() {
  const store = new Map<string, string>();

  return {
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

function createThrowingSessionStorage() {
  return {
    clear: () => {
      throw new Error("storage unavailable");
    },
    getItem: () => {
      throw new Error("storage unavailable");
    },
    key: () => {
      throw new Error("storage unavailable");
    },
    length: 0,
    removeItem: () => {
      throw new Error("storage unavailable");
    },
    setItem: () => {
      throw new Error("storage unavailable");
    },
  } as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readAndClearChatDraft", () => {
  it("returns null when no draft was stored", () => {
    vi.stubGlobal("window", { sessionStorage: createFakeSessionStorage() });

    expect(readAndClearChatDraft()).toBeNull();
  });

  it("returns the stored draft and clears it", () => {
    const sessionStorage = createFakeSessionStorage();
    sessionStorage.setItem("eve-chat-draft", "hello world");
    vi.stubGlobal("window", { sessionStorage });

    expect(readAndClearChatDraft()).toBe("hello world");
    expect(sessionStorage.getItem("eve-chat-draft")).toBeNull();
  });

  it("returns null when window is unavailable (server context)", () => {
    expect(readAndClearChatDraft()).toBeNull();
  });

  it("returns null when sessionStorage throws", () => {
    vi.stubGlobal("window", { sessionStorage: createThrowingSessionStorage() });

    expect(readAndClearChatDraft()).toBeNull();
  });
});

describe("writeChatDraft", () => {
  it("stores the draft under the shared key", () => {
    const sessionStorage = createFakeSessionStorage();
    vi.stubGlobal("window", { sessionStorage });

    writeChatDraft("draft text");

    expect(sessionStorage.getItem("eve-chat-draft")).toBe("draft text");
  });

  it("does not throw when window is unavailable (server context)", () => {
    expect(() => writeChatDraft("draft text")).not.toThrow();
  });

  it("does not throw when sessionStorage throws", () => {
    vi.stubGlobal("window", { sessionStorage: createThrowingSessionStorage() });

    expect(() => writeChatDraft("draft text")).not.toThrow();
  });
});
