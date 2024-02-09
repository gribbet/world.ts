import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";
import dts from "vite-plugin-dts";

export default defineConfig({
  root: "src",
  plugins: [glsl(), dts()],
  build: {
    outDir: "../dist",
    sourcemap: true,
    target: "esnext",
    lib: {
      fileName: "index",
      entry: "./index.ts",
      formats: ["es"],
    },
  },
});
