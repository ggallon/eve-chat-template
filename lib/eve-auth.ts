import type { AuthFn } from "eve/channels/auth";
import { auth } from "@/lib/auth";

export const betterAuthEveAuth: AuthFn<Request> = async (request) => {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return null;
  }

  return {
    attributes: {
      email: session.user.email,
      name: session.user.name,
    },
    authenticator: "better-auth",
    issuer: "better-auth",
    principalId: session.user.id,
    principalType: "user",
    subject: session.user.email,
  };
};
