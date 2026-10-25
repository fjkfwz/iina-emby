/// <reference types="vitest" />
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { defineConfig } from "vitest/config";

const info = JSON.parse(fs.readFileSync(new URL("./Info.json", import.meta.url), "utf-8"));

export default defineConfig(({ mode }) => {
  const isTest = mode === "test" || process.env.VITEST === "true";
  return {
    define: {
      __APP_VERSION__: JSON.stringify(info.version),
      ...(isTest
        ? {}
        : {
            "import.meta.url": "''",
            "import.meta.resolve": "undefined",
          }),
    },
    resolve: {
      alias: {
        "~": path.resolve(import.meta.dirname, "./app"),
        "@shared": path.resolve(import.meta.dirname, "./shared"),
      },
    },
    plugins: [
      react(),
      viteSingleFile({
        removeViteModuleLoader: true,
      }),
      {
        name: "remove-module-type",
        enforce: "post",
        transformIndexHtml(html) {
          return html
            .replace(/<script type="module" crossorigin>/gi, "<script>")
            .replace(/<script type="module">/gi, "<script>");
        },
      },
    ],
    build: {
      outDir: "dist/client",
      emptyOutDir: true,
      target: ["es2019", "safari13"],
      modulePreload: false,
    },
    test: {
      environment: "node",
      include: ["**/*.test.ts", "**/*.test.tsx"],
    },
  };
});
