import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { type UserMemory, userMemory } from "@/lib/db/schema/memory";
import { errorResponse } from "@/lib/server/http";
import { MEMORY_CATEGORIES } from "./constants";
import { normalizeMemoryContent, parseMemoryImport } from "./import";
import type {
  MemoryByCategory,
  MemoryCategory,
  MemoryEntry,
  MemorySource,
} from "./types";

function emptyByCategory(): MemoryByCategory {
  return {
    work_context: [],
    personal_context: [],
    active_focus: [],
    instructions_preferences: [],
    project_history: [],
  };
}

function rowToEntry(row: UserMemory): MemoryEntry {
  return {
    id: row.id,
    category: row.category as MemoryCategory,
    content: row.content,
    source: row.source as MemorySource,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

const saveMemorySchema = z.object({
  userId: z.string().trim().min(1),
  category: z.enum(MEMORY_CATEGORIES),
  content: z.string().trim().min(1).max(4000),
  source: z.enum(["import", "agent", "manual"]).default("agent"),
});

export async function saveMemory(input: {
  userId: string;
  category: MemoryCategory;
  content: string;
  source: MemorySource;
}) {
  const result = await setMemoryForCategory(input.userId, {
    category: input.category,
    content: input.content,
    source: input.source,
  });

  if (!result.saved) {
    return { saved: false, reason: result.reason ?? ("unchanged" as const) };
  }

  return { saved: true, entry: result.entry };
}

export async function listMemoryForUser(
  userId: string
): Promise<MemoryByCategory> {
  const rows = await db
    .select()
    .from(userMemory)
    .where(eq(userMemory.userId, userId))
    .orderBy(asc(userMemory.createdAt));

  const grouped = emptyByCategory();
  for (const row of rows) {
    const category = row.category as MemoryCategory;
    if (MEMORY_CATEGORIES.includes(category)) {
      grouped[category].push(rowToEntry(row));
    }
  }

  return latestEntryPerCategory(grouped);
}

function latestEntryPerCategory(grouped: MemoryByCategory): MemoryByCategory {
  const result = emptyByCategory();

  for (const category of MEMORY_CATEGORIES) {
    const entries = grouped[category];
    if (!entries.length) {
      continue;
    }

    result[category] = [
      entries.reduce((latest, entry) =>
        entry.updatedAt >= latest.updatedAt ? entry : latest
      ),
    ];
  }

  return result;
}

async function getLatestMemoryForCategory(
  userId: string,
  category: MemoryCategory
) {
  const rows = await db
    .select()
    .from(userMemory)
    .where(
      and(eq(userMemory.userId, userId), eq(userMemory.category, category))
    )
    .orderBy(asc(userMemory.updatedAt));

  const entry = rows.at(-1);
  return entry ? rowToEntry(entry) : undefined;
}

export async function setMemoryForCategory(
  userId: string,
  input: { category: MemoryCategory; content: string; source: MemorySource }
) {
  const content = input.content.trim();
  if (!content) {
    throw errorResponse({
      statusCode: 400,
      statusMessage: "Memory content cannot be empty",
    });
  }

  const latest = await getLatestMemoryForCategory(userId, input.category);
  if (
    latest &&
    normalizeMemoryContent(latest.content) === normalizeMemoryContent(content)
  ) {
    return {
      entry: latest,
      saved: false as const,
      reason: "unchanged" as const,
    };
  }

  await db
    .delete(userMemory)
    .where(
      and(
        eq(userMemory.userId, userId),
        eq(userMemory.category, input.category)
      )
    );

  const id = crypto.randomUUID();
  await db.insert(userMemory).values({
    id,
    userId,
    category: input.category,
    content,
    source: input.source,
  });

  const [row] = await db
    .select()
    .from(userMemory)
    .where(eq(userMemory.id, id))
    .limit(1);

  return {
    entry: row ? rowToEntry(row) : undefined,
    saved: true as const,
  };
}

export async function importMemoryForUser(userId: string, raw: string) {
  const sections = parseMemoryImport(raw);
  const created: MemoryEntry[] = [];
  const skipped: MemoryCategory[] = [];

  for (const category of MEMORY_CATEGORIES) {
    const content = sections[category]?.trim();
    if (!content) {
      continue;
    }

    const result = await setMemoryForCategory(userId, {
      category,
      content,
      source: "import",
    });

    if (result.saved && result.entry) {
      created.push(result.entry);
    } else if (!result.saved && result.reason === "unchanged") {
      skipped.push(category);
    }
  }

  return { created, skipped, memory: await listMemoryForUser(userId) };
}

export async function deleteMemoryEntry(userId: string, id: string) {
  const [existing] = await db
    .select()
    .from(userMemory)
    .where(and(eq(userMemory.id, id), eq(userMemory.userId, userId)))
    .limit(1);

  if (!existing) {
    return false;
  }

  await db
    .delete(userMemory)
    .where(
      and(
        eq(userMemory.userId, userId),
        eq(userMemory.category, existing.category)
      )
    );

  return true;
}

export async function updateMemoryEntry(
  userId: string,
  id: string,
  content: string
) {
  const trimmed = content.trim();
  if (!trimmed) {
    throw errorResponse({
      statusCode: 400,
      statusMessage: "Memory content cannot be empty",
    });
  }

  const [existing] = await db
    .select()
    .from(userMemory)
    .where(and(eq(userMemory.id, id), eq(userMemory.userId, userId)))
    .limit(1);

  if (!existing) {
    return;
  }

  await db
    .update(userMemory)
    .set({ content: trimmed, source: "manual" })
    .where(eq(userMemory.id, id));

  const [row] = await db
    .select()
    .from(userMemory)
    .where(eq(userMemory.id, id))
    .limit(1);

  return row ? rowToEntry(row) : undefined;
}
