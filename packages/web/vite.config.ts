import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { reactRouterHonoServer } from "react-router-hono-server/dev";
import { defineConfig } from "vite-plus";

export default defineConfig(({ mode }) => {
  const isTest = mode === "test";
  const plugins = isTest
    ? [tailwindcss()]
    : [reactRouterHonoServer({ serverEntryPoint: "app/server.ts" }), tailwindcss(), reactRouter()];

  return {
    plugins,
    resolve: {
      tsconfigPaths: true,
    },
    ssr: {
      noExternal: ["@anideck/api"],
      external: ["@libsql/client", "libsql"],
    },
    test: {
      environment: "jsdom",
    },
  };
});
