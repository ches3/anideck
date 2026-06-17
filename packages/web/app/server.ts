import { apiApp } from "@anideck/api/api";
import { Hono } from "hono";
import { createHonoServer } from "react-router-hono-server/node";

const app = new Hono().route("/api", apiApp).all("/api/*", (c) => c.body(null, 404));

export { app };

const hostname = process.env.HOSTNAME;

export default createHonoServer({
  app,
  defaultLogger: false,
  hostname,
  listeningListener(info) {
    console.log(`Server started on http://${info.address}:${info.port}`);
  },
});
