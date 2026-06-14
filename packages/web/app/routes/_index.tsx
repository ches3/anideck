import { data } from "react-router";

import { WorksList } from "~/components/works-list";
import { createApiClient } from "~/lib/api.server";

import type { Route } from "./+types/_index";

export function meta() {
  return [
    { title: "作品一覧 - anideck" },
    { name: "description", content: "ローカルに保存された作品の一覧" },
  ];
}

export async function loader({ request }: { request: Request }) {
  const client = createApiClient(request);
  const response = await client.works.$get();

  if (!response.ok) {
    const payload = await response.json();
    throw data(payload.error, {
      status: response.status,
      statusText: response.statusText,
    });
  }

  const payload = await response.json();
  const works = payload.works;

  return { works };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  const { works } = loaderData;

  return (
    <main>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-8 lg:px-10">
        <header className="flex items-baseline justify-between gap-4">
          <h1 className="text-lg font-medium text-neutral-100">作品一覧</h1>
          <p className="text-sm text-neutral-500 tabular-nums">{works.length} 件</p>
        </header>
        <WorksList works={works} />
      </div>
    </main>
  );
}
