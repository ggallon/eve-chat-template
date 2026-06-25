import { defaultBackend, defineSandbox } from "eve/sandbox";

/**
 * 60 minutes — default expiration (in milliseconds) applied
 * to snapshots automatically created for this sandbox.
 */
const DEFAULT_SANDBOX_EXPIRATION_MS = 60 * 60 * 1000;

/**
 * 15 minutes. The `@vercel/sandbox` SDK defaults to 5 minutes which is
 * too short for multi-step workflows — the VM expires between steps.
 */
const DEFAULT_SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Defines the sandbox configuration for the EVE chat agent.
 */
export default defineSandbox({
  backend: defaultBackend({
    vercel: {
      networkPolicy: "deny-all",
      resources: { vcpus: 1 },
      runtime: "node24",
      snapshotExpiration: DEFAULT_SANDBOX_EXPIRATION_MS,
      tags: { project: "eve-chat" },
      timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
    },
    docker: { image: "ghcr.io/vercel/eve:latest" },
    microsandbox: { memoryMiB: 2048 },
  }),
});
