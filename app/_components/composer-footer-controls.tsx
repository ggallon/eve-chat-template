import { IntegrationsMenu } from "@/components/chat/integrations-menu";
import { useChatShell } from "./chat-shell-context";

export function ComposerFooterControls() {
  const { enabledConnections, setConnectionEnabled } = useChatShell();

  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
      <IntegrationsMenu
        enabledConnections={enabledConnections}
        onConnectionEnabledChange={setConnectionEnabled}
      />
    </div>
  );
}
