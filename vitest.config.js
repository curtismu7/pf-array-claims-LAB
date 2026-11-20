import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  define: { __LAB_VERSION__: JSON.stringify(`v${version}`) },
  test: {
    environment: "jsdom",
    include: ["test/*.test.jsx", "web/src/gateway-trace/*.test.jsx", "web/src/floating-dialog/*.test.jsx"],
    setupFiles: ["./test/setup-jest-dom.js"]
  }
});
