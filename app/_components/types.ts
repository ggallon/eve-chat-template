export type AgentChatControllerStatus = {
  readonly disabledReason?: string;
  readonly isBusy: boolean;
  readonly isCancelling: boolean;
  readonly isDisabled: boolean;
  readonly isEmpty: boolean;
};

export type DraftHandlers = {
  readonly clearDraft: () => void;
  readonly restoreDraft: (value: string) => void;
};

export type AgentChatController = {
  readonly reset: () => void;
  readonly sendMessage: (
    text: string,
    draftHandlers: DraftHandlers
  ) => Promise<void>;
  readonly stop: () => void;
};
