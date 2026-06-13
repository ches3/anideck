import { apiApp } from "@anideck/api/api";
import { Hono } from "hono";

const app = new Hono().route("/api", apiApp);

export default app;
