import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The header's version button shows package.json's version, fixed at build time.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  root: "web",
  plugins: [react()],
  define: { __LAB_VERSION__: JSON.stringify(`v${version}`) },
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    port: 17828,
    proxy: { "/api": "http://127.0.0.1:7828" }
  }
});
