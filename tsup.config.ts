import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/cli.ts"],
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    target: "node20",
  },
  {
    entry: {
      browser: "src/browser.ts"
    },
    format: ["iife"],
    globalName: "Pipsel",
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: false,
    target: "es2020",
  }
]);
