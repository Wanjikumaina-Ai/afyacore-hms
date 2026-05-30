import { defineConfig } from "vite";
import { reactRouter } from "@react-router/dev/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    reactRouter(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});