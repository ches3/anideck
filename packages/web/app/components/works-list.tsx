import { WorkCard, type WorkSummary } from "~/components/work-card";

interface WorksListProps {
  works: WorkSummary[];
}

export function WorksList({ works }: WorksListProps) {
  if (works.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-neutral-700 bg-neutral-900/60 px-6 py-16 text-center">
        <p className="text-lg font-semibold text-neutral-100">作品がまだありません</p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-400">
          ソースフォルダと取り込みルールを設定すると、ローカルに保存された作品がここに表示されます。
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="作品一覧"
      className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {works.map((work) => (
        <WorkCard key={work.id} work={work} />
      ))}
    </section>
  );
}
