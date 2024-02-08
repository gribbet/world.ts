import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig({
  root: "src",
  plugins: [glsl()],
  build: {
    outDir: "../dist",
    sourcemap: true,
    target: "esnext",
  },
});
