import { localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { betterAuthEveAuth } from "@/lib/eve-auth";

export default eveChannel({
  auth: [
    betterAuthEveAuth,
    // The common Vercel deployment path. Verifies a Vercel OIDC bearer JWT.
    vercelOidc(),
    // Local development. Accepts requests addressed to a loopback hostname.
    localDev(),
  ],
  uploadPolicy: "disabled",
});
