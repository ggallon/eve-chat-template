import { listMemoryForUser } from "@/lib/memory/queries";
import { getOrCreateProfileForUser } from "@/lib/profile/queries";
import type { UserContextPayload } from "./types";

export async function getUserContext(
  userId: string
): Promise<UserContextPayload | undefined> {
  const [profile, memory] = await Promise.all([
    getOrCreateProfileForUser(userId),
    listMemoryForUser(userId),
  ]);

  return { profile, memory };
}
