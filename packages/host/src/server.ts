import { serve } from "@hono/node-server";

import app from "./index.ts";

const port = Number(process.env.PORT ?? 3100);
const host = "0.0.0.0";
const maxPortAttempts = 20;

function isAddressInUse(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

function startServer(nextPort: number, attemptsLeft = maxPortAttempts): void {
  const server = serve(
    {
      fetch: app.fetch,
      hostname: host,
      port: nextPort,
    },
    (info) => {
      console.log(`anideck server listening on http://${host}:${String(info.port)}`);
    },
  );

  server.once("error", (error) => {
    if (!isAddressInUse(error)) {
      throw error;
    }

    if (attemptsLeft <= 1) {
      console.error(`Failed to find an available port starting from ${String(port)}`);
      process.exitCode = 1;
      return;
    }

    const fallbackPort = nextPort + 1;
    console.warn(`Port ${String(nextPort)} is already in use, trying ${String(fallbackPort)}`);
    startServer(fallbackPort, attemptsLeft - 1);
  });
}

startServer(port);
