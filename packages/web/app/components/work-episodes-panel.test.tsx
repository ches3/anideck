import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { WorkEpisodesPanel } from "./work-episodes-panel";

afterEach(() => {
  cleanup();
});

describe("WorkEpisodesPanel", () => {
  test("エピソード一覧を表示する", () => {
    render(
      <WorkEpisodesPanel
        episodes={[
          { id: "ep-1", title: "#01", path: "/media/anime/#01.mp4" },
          { id: "ep-2", title: "#02", path: "/media/anime/#02.mp4" },
        ]}
      />,
    );

    expect(screen.getByRole("list", { name: "エピソード一覧" })).toBeDefined();
    expect(screen.getByRole("listitem", { name: "#01" })).toBeDefined();
    expect(screen.getByRole("listitem", { name: "#02" })).toBeDefined();
  });

  test("エピソードがない場合は空状態を表示する", () => {
    render(<WorkEpisodesPanel episodes={[]} />);

    expect(screen.getByText("エピソードがまだありません")).toBeDefined();
  });
});
