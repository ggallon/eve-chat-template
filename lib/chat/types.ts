import type { ClientSessionState, MessageStreamEvent } from "eve/client";

export type StorageMode = "browser" | "database";

export type Viewer = {
  readonly email: string;
  readonly id: string;
  readonly image: string | null;
  readonly name: string;
};

export type ChatListItem = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

export type ChatListPage = {
  readonly items: readonly ChatListItem[];
  readonly nextCursor: string | null;
};

export type ActiveChat = {
  readonly events: readonly MessageStreamEvent[];
  readonly id: string;
  readonly pendingUserMessage: string | null;
  readonly session: ClientSessionState | undefined;
  readonly title: string;
};

export type EnabledConnections = {
  readonly linear: boolean;
  readonly notion: boolean;
  readonly sentry: boolean;
};
