import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    devServer({
      entry: "src/index.ts",
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "index.mjs",
      },
    },
  },
  ssr: {
    noExternal: ["@anideck/api"],
    external: ["@libsql/client", "libsql"],
  },
});
