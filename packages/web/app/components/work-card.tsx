import { Link } from "react-router";

import { Card, CardContent } from "~/components/ui/card";

export interface WorkSummary {
  id: string;
  title: string;
}

interface WorkCardProps {
  work: WorkSummary;
}

export function WorkCard({ work }: WorkCardProps) {
  return (
    <Link
      aria-label={`${work.title} の詳細へ`}
      className="group block outline-none"
      preventScrollReset
      to={`/works/${work.id}`}
    >
      <Card className="h-full gap-0 border-neutral-800/80 bg-neutral-900/80 p-0 transition duration-200 group-hover:-translate-y-0.5 group-hover:border-neutral-600 group-focus-visible:ring-2 group-focus-visible:ring-neutral-200">
        <div className="aspect-46/65 overflow-hidden rounded-t-xl bg-linear-to-br from-neutral-800 via-neutral-900 to-neutral-950" />
        <CardContent className="p-3">
          <h2 className="line-clamp-2 min-h-[2lh] text-sm font-normal leading-snug text-neutral-50">
            {work.title}
          </h2>
        </CardContent>
      </Card>
    </Link>
  );
}
