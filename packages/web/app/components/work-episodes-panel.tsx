import { Link } from "react-router";

export interface WorkEpisode {
  id: string;
  title: string;
  path: string;
}

interface WorkEpisodesPanelProps {
  workId: string;
  episodes: WorkEpisode[];
}

export function WorkEpisodesPanel({ workId, episodes }: WorkEpisodesPanelProps) {
  if (episodes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/60 px-6 py-12 text-center text-sm text-neutral-400">
        エピソードがまだありません
      </p>
    );
  }

  return (
    <ul aria-label="エピソード一覧" className="flex flex-col gap-3">
      {episodes.map((episode) => (
        <li key={episode.id}>
          <Link
            to={`/works/${workId}/${episode.id}/watch`}
            aria-label={episode.title}
            className="block rounded-xl border border-neutral-800/80 bg-neutral-900/80 px-4 py-4 text-sm text-neutral-100 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
          >
            {episode.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}
