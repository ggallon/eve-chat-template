import { defineDynamic, defineInstructions } from "eve/instructions";
import { getUserContext } from "@/lib/user/queries";
import { BASE_INSTRUCTIONS } from "./lib/base_instruction";
import { buildUserContextPrompt } from "./lib/memory_internal";

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const userId = ctx.session.auth.current?.principalId;
      if (!userId || userId.startsWith("eve:")) {
        return defineInstructions({ markdown: BASE_INSTRUCTIONS });
      }

      const context = await getUserContext(userId);
      if (context) {
        const userBlock = buildUserContextPrompt(context);
        return defineInstructions({
          markdown: `${BASE_INSTRUCTIONS}\n\n---\n\n${userBlock}`,
        });
      }

      return defineInstructions({ markdown: BASE_INSTRUCTIONS });
    },
  },
});
