import { listMemoryForUser } from "@/lib/memory/queries";
import type { MemoryByCategory } from "@/lib/memory/types";
import { getOrCreateProfileForUser } from "@/lib/profile/queries";
import type { UserProfile } from "@/lib/profile/types";

interface UserContextPayload {
  memory: MemoryByCategory;
  profile: UserProfile;
}

export async function getUserContext(
  userId: string
): Promise<UserContextPayload | undefined> {
  const [profile, memory] = await Promise.all([
    getOrCreateProfileForUser(userId),
    listMemoryForUser(userId),
  ]);

  return { profile, memory };
}
