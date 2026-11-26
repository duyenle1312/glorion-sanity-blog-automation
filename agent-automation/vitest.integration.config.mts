import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [workflow()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.integration.test.ts"],
    testTimeout: 60_000,
  },
});
