import type { AgentChatControllerStatus } from "./types";

export const IDLE_AGENT_CHAT_CONTROLLER_STATUS: AgentChatControllerStatus = {
  isBusy: false,
  isCancelling: false,
  isDisabled: false,
  isEmpty: true,
};
