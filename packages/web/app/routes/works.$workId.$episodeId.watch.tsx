import { data } from "react-router";

import { VideoPlayer } from "~/features/video-player";
import { createApiClient } from "~/lib/api.server";

import type { Route } from "./+types/works.$workId.$episodeId.watch";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.episode.title} - ${loaderData.work.title} - anideck` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const client = createApiClient(request);
  const response = await client.works[":workId"].episodes[":episodeId"].$get({
    param: { workId: params.workId, episodeId: params.episodeId },
  });

  if (!response.ok) {
    const payload = await response.json();
    throw data(payload.error, {
      status: response.status,
      statusText: response.statusText,
    });
  }

  const payload = await response.json();

  return {
    work: payload.work,
    episode: payload.episode,
    streamUrl: payload.streamUrl,
  };
}

export default function WatchPage({ loaderData }: Route.ComponentProps) {
  const { work, episode, streamUrl } = loaderData;

  return (
    <main className="h-svh w-full bg-black">
      <VideoPlayer
        autoPlay
        backHref={`/works/${work.id}`}
        src={streamUrl}
        episodeTitle={episode.title}
        workTitle={work.title}
      />
    </main>
  );
}
