import type { MemoryByCategory } from "../memory/types";
import type { UserProfile } from "../profile/types";

export interface UserContextPayload {
  memory: MemoryByCategory;
  profile: UserProfile;
}
