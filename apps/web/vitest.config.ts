import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@deliberum/client": fileURLToPath(
        new URL("../../packages/client/src/index.ts", import.meta.url)
      ),
      "@deliberum/ui": fileURLToPath(
        new URL("../../packages/ui/src/index.tsx", import.meta.url)
      )
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"]
  }
});
