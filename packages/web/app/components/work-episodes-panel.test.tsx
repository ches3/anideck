import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { WorkEpisodesPanel } from "./work-episodes-panel";

afterEach(() => {
  cleanup();
});

describe("WorkEpisodesPanel", () => {
  it("エピソード一覧が表示される", () => {
    render(
      <MemoryRouter>
        <WorkEpisodesPanel
          workId="work-1"
          episodes={[
            { id: "ep-1", title: "#01", path: "/media/anime/#01.mp4" },
            { id: "ep-2", title: "#02", path: "/media/anime/#02.mp4" },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("list", { name: "エピソード一覧" })).toBeDefined();
    expect(screen.getByRole("link", { name: "#01" })).toBeDefined();
    expect(screen.getByRole("link", { name: "#02" })).toBeDefined();
  });

  it("各エピソードに視聴ページへのリンクが表示される", () => {
    render(
      <MemoryRouter>
        <WorkEpisodesPanel
          workId="work-1"
          episodes={[{ id: "ep-1", title: "#01", path: "/media/anime/#01.mp4" }]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "#01" }).getAttribute("href")).toBe(
      "/works/work-1/ep-1/watch",
    );
  });

  it("エピソードがない場合は空状態が表示される", () => {
    render(
      <MemoryRouter>
        <WorkEpisodesPanel workId="work-1" episodes={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByText("エピソードがまだありません")).toBeDefined();
  });
});
