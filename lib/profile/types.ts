export interface UserProfile {
  bio: string;
  locale: string;
  timezone: string;
  updatedAt: number;
  userId: string;
}

export interface UserProfilePatch {
  bio?: string;
  locale?: string;
  name?: string;
  timezone?: string;
}

export interface UserProfileWithUser extends UserProfile {
  email: string;
  name: string;
}
