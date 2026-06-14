import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    ssr: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/entry-server.tsx"),
      output: {
        format: "esm",
        entryFileNames: "entry-server.js",
      },
    },
    outDir: "dist/server",
    emptyOutDir: true,
  },
  ssr: {
    noExternal: ["wouter"],
  },
});
