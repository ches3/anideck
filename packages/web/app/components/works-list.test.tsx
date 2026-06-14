import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vite-plus/test";

import { WorksList } from "./works-list";

describe("WorksList", () => {
  test("作品がない場合は空状態を表示する", () => {
    render(<WorksList works={[]} />);

    expect(screen.getByText("作品がまだありません")).toBeDefined();
    expect(screen.getByText(/ソースフォルダと取り込みルール/)).toBeDefined();
  });

  test("作品がある場合はカードリンクを表示する", () => {
    render(
      <MemoryRouter>
        <WorksList works={[{ id: "work-1", title: "ぼっち・ざ・ろっく!" }]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "ぼっち・ざ・ろっく! の詳細へ" });

    expect(link.getAttribute("href")).toBe("/works/work-1");
    expect(screen.getByRole("heading", { level: 2, name: "ぼっち・ざ・ろっく!" })).toBeDefined();
  });
});
