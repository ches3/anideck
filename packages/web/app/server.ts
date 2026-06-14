import { apiApp } from "@anideck/api/api";
import { Hono } from "hono";
import { createHonoServer } from "react-router-hono-server/node";

const app = new Hono().route("/api", apiApp).all("/api/*", (c) => c.body(null, 404));

export { app };

export default createHonoServer({
  app,
  defaultLogger: false,
});
