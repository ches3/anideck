import { XIcon } from "lucide-react";
import { data, useNavigate } from "react-router";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { WorkEpisodesPanel } from "~/components/work-episodes-panel";
import { createApiClient } from "~/lib/api.server";

import type { Route } from "./+types/works.$workId";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.work.title} - anideck` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const client = createApiClient(request);
  const response = await client.works[":workId"].$get({
    param: { workId: params.workId },
  });

  if (!response.ok) {
    const payload = await response.json();
    throw data(payload.error, {
      status: response.status,
      statusText: response.statusText,
    });
  }

  const payload = await response.json();
  const work = payload.work;

  return { work };
}

export default function WorkDetail({ loaderData }: Route.ComponentProps) {
  const { work } = loaderData;
  const navigate = useNavigate();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          void navigate("/", { preventScrollReset: true });
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100svh-6rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogClose asChild>
          <Button
            aria-label="作品一覧に戻る"
            className="absolute top-6 right-6 z-10 size-10 rounded-full bg-neutral-800/80 hover:bg-neutral-700/80 sm:top-8 sm:right-8 [&_svg]:size-5"
            size="icon-lg"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </DialogClose>
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto scrollbar-thin p-6 sm:p-8">
          <DialogHeader className="pr-14 sm:pr-16">
            <DialogTitle className="text-2xl font-medium">{work.title}</DialogTitle>
            <DialogDescription className="tabular-nums">
              {work.episodes.length} 話
            </DialogDescription>
          </DialogHeader>
          <WorkEpisodesPanel workId={work.id} episodes={work.episodes} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
