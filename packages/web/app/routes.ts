import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/works-layout.tsx", [
    index("routes/_index.tsx"),
    route("works/:workId", "routes/works.$workId.tsx"),
  ]),
] satisfies RouteConfig;
