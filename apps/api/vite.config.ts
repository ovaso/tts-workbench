import { builtinModules } from "node:module";
import { defineConfig } from "vite";

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
];

export default defineConfig({
  build: {
    target: "node24",
    ssr: true,
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: "src/server.ts",
      formats: ["es"],
      fileName: () => "server.js"
    },
    rollupOptions: {
      external: [
        ...nodeBuiltins,
        "fastify",
        "@fastify/cors",
        "@fastify/static",
        "@fastify/websocket",
        "ws"
      ]
    }
  },
  ssr: {
    noExternal: ["@tts-platform/core"]
  }
});
