export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

export type OnInputResponses = (
  responses: readonly AgentInputResponse[]
) => void | Promise<void>;
