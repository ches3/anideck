import { Hono } from "hono";

import type { ApiEnv } from "../lib/context.ts";
import { db } from "../lib/db/index.ts";
import { getWork, getWorkEpisode, listWorks } from "../lib/services/work.ts";
import { createVideoStreamResponse } from "../lib/video-stream.ts";

export const worksRoute = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const works = await listWorks(db);
    return c.json({ works }, 200);
  })
  .get("/:workId/episodes/:episodeId", async (c) => {
    const workId = c.req.param("workId");
    const episodeId = c.req.param("episodeId");
    const detail = await getWorkEpisode(db, workId, episodeId);

    return c.json(
      {
        work: detail.work,
        episode: {
          id: detail.episode.id,
          title: detail.episode.title,
        },
        streamUrl: `/api/works/${workId}/episodes/${episodeId}/stream`,
      },
      200,
    );
  })
  .get("/:workId/episodes/:episodeId/stream", async (c) => {
    const workId = c.req.param("workId");
    const episodeId = c.req.param("episodeId");
    const detail = await getWorkEpisode(db, workId, episodeId);
    const result = await createVideoStreamResponse(
      detail.episode.path,
      c.req.header("range"),
      c.req.raw.signal,
    );

    switch (result.status) {
      case 416:
        return c.body(null, 416, result.headers);
      case 200:
      case 206:
        return c.body(result.body, result.status, result.headers);
    }
  })
  .get("/:workId", async (c) => {
    const workId = c.req.param("workId");
    const work = await getWork(db, workId);
    return c.json({ work }, 200);
  });
