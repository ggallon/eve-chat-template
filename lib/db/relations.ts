import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  user: {
    accounts: r.many.account(),
    sessions: r.many.session(),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  chat: {
    user: r.one.user({
      from: r.chat.userId,
      to: r.user.id,
    }),
  },
  userMemory: {
    user: r.one.user({
      from: r.userMemory.userId,
      to: r.user.id,
    }),
  },
  userProfiles: {
    user: r.one.user({
      from: r.userProfiles.userId,
      to: r.user.id,
    }),
  },
}));
