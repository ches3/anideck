import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vite-plus/test";

import { WorksList } from "./works-list";

describe("WorksList", () => {
  it("作品がない場合は空状態が表示される", () => {
    render(<WorksList works={[]} />);

    expect(screen.getByText("作品がまだありません")).toBeDefined();
    expect(screen.getByText(/ソースフォルダと取り込みルール/)).toBeDefined();
  });

  it("作品がある場合はカードリンクが表示される", () => {
    render(
      <MemoryRouter>
        <WorksList works={[{ id: "work-1", title: "ぼっち・ざ・ろっく!", thumbnailUrl: null }]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "ぼっち・ざ・ろっく! の詳細へ" });

    expect(link.getAttribute("href")).toBe("/works/work-1");
    expect(screen.getByRole("heading", { level: 2, name: "ぼっち・ざ・ろっく!" })).toBeDefined();
  });
});
