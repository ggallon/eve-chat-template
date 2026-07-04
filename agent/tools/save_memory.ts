import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { MEMORY_CATEGORIES } from "@/lib/memory/constants";
import { saveMemory } from "@/lib/memory/queries";
import type { MemoryCategory } from "@/lib/memory/types";

interface ToolResult {
  category: MemoryCategory;
  saved: boolean;
}

const DESCRIBE_CATEGORY_GUIDE = [
  "Which category to update:",
  "- work_context: professional situation: role, company, team, tools, ongoing responsibilities.",
  "- personal_context: durable personal facts: family, location, interests, life situation.",
  "- active_focus: what the user is currently prioritizing. When something here is finished, fold a short summary into project_history and drop it here instead of leaving it to go stale.",
  "- instructions_preferences: standing behavioral rules for how the assistant should act (tone, format, always/never do).",
  "- project_history: a compact, summarized log of past projects and decisions. Compress older entries instead of appending indefinitely.",
].join("\n");

const updateSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES).describe(DESCRIBE_CATEGORY_GUIDE),
  content: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "Full replacement prose for this category. The previous content is discarded, this is not a delta. " +
        "Can't be blank: to remove a detail, rewrite the category without it; to fully clear one, use a short neutral placeholder instead. " +
        "Never include passwords, access tokens, payment details, private keys, or one-time codes."
    ),
});

export default defineTool({
  description:
    "Propose long-term memory updates. Use only for durable, cross-session facts and preferences," +
    "not one-off task details or ephemeral requests. Combine every category you want to update into " +
    "a single call, never call this in parallel or more than once per turn. Always include `reason`: " +
    "one sentence on why this is worth remembering, shown to the user in the approval prompt. Every " +
    "call triggers exactly one approval for the whole batch, and nothing is stored until the user " +
    "approves, no separate confirmation is needed in chat beforehand. The result reports success per " +
    "category; check it rather than assuming the whole batch saved.",
  inputSchema: z.object({
    reason: z
      .string()
      .min(1)
      .max(400)
      .describe(
        "One sentence on why these updates are worth remembering. Shown to the user for approval."
      ),
    updates: z
      .array(updateSchema)
      .min(1)
      .max(5)
      .refine(
        (updates) =>
          new Set(updates.map((u) => u.category)).size === updates.length,
        { message: "Each category can only appear once per call." }
      )
      .describe(
        "Category updates to save together: one entry per category, up to all 5."
      ),
  }),
  approval: always(),
  async execute({ updates }, ctx) {
    const userId = ctx.session.auth.current?.principalId;
    if (!userId) {
      throw new Error("Cannot save memory without an authenticated user");
    }

    const results: ToolResult[] = [];
    for (const update of updates) {
      const result = await saveMemory({
        userId,
        category: update.category,
        content: update.content,
        source: "agent",
      });
      results.push({
        category: update.category,
        saved: result.saved,
      });
    }
    return { results };
  },
});
