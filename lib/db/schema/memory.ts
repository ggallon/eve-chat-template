import { relations } from "drizzle-orm";
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
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => [
    index("user_memory_user_category_idx").on(table.userId, table.category),
  ]
);

export const userMemoryRelations = relations(userMemory, ({ one }) => ({
  user: one(user, {
    fields: [userMemory.userId],
    references: [user.id],
  }),
}));

export type UserMemory = typeof userMemory.$inferSelect;
