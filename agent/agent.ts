import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-haiku-4.5",
  build: {
    externalDependencies: ["next"],
  },
});
