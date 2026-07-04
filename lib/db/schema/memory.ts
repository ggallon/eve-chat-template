import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const userMemory = pgTable(
  "user_memory",
  {
    id: text("id").primaryKey(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    category: text().notNull(),
    content: text().notNull(),
    source: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("user_memory_user_category_idx").on(table.userId, table.category),
  ]
);

export type UserMemory = typeof userMemory.$inferSelect;
