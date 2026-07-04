import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema/auth";
import { userProfiles } from "@/lib/db/schema/profile";
import { errorResponse } from "../server/http";
import type {
  UserProfile,
  UserProfilePatch,
  UserProfileWithUser,
} from "./types";

function rowToProfile(row: typeof userProfiles.$inferSelect): UserProfile {
  return {
    userId: row.userId,
    timezone: row.timezone,
    locale: row.locale,
    bio: row.bio,
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function getProfileForUser(
  userId: string
): Promise<UserProfile | undefined> {
  const [row] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  return row ? rowToProfile(row) : undefined;
}

export async function getOrCreateProfileForUser(
  userId: string
): Promise<UserProfile> {
  const existing = await getProfileForUser(userId);
  if (existing) {
    return existing;
  }

  await db.insert(userProfiles).values({ userId });

  const created = await getProfileForUser(userId);
  if (!created) {
    throw errorResponse({
      statusCode: 500,
      statusMessage: "Failed to create profile",
    });
  }

  return created;
}

export async function getProfileWithUser(
  userId: string
): Promise<UserProfileWithUser | undefined> {
  const [row] = await db
    .select({
      profile: userProfiles,
      user,
    })
    .from(user)
    .leftJoin(userProfiles, eq(userProfiles.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (!row?.user) {
    return;
  }

  const profile = row.profile
    ? rowToProfile(row.profile)
    : await getOrCreateProfileForUser(userId);

  return {
    ...profile,
    name: row.user.name,
    email: row.user.email,
  };
}

export async function updateProfileForUser(
  userId: string,
  patch: UserProfilePatch
) {
  await getOrCreateProfileForUser(userId);

  if (patch.name !== undefined) {
    await db
      .update(user)
      .set({ name: patch.name.trim() })
      .where(eq(user.id, userId));
  }

  await db
    .update(userProfiles)
    .set({
      ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
      ...(patch.locale === undefined ? {} : { locale: patch.locale }),
      ...(patch.bio === undefined ? {} : { bio: patch.bio }),
    })
    .where(eq(userProfiles.userId, userId));

  return getProfileWithUser(userId);
}
