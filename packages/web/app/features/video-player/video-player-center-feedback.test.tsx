import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { CenterFeedback } from "./use-video-player";
import { VideoPlayerCenterFeedback } from "./video-player-center-feedback";

afterEach(() => {
  cleanup();
});

function renderFeedback(
  feedback: CenterFeedback,
  options?: { seekStepSeconds?: number; visible?: boolean },
) {
  const { seekStepSeconds = 10, visible = true } = options ?? {};

  return render(
    <VideoPlayerCenterFeedback
      feedback={feedback}
      seekStepSeconds={seekStepSeconds}
      visible={visible}
    />,
  );
}

describe("VideoPlayerCenterFeedback", () => {
  it.each([
    { level: 0.65, expectedPercent: "65" },
    { level: 0, expectedPercent: "0" },
  ])("volume=$level のとき $expectedPercent% を表示する", ({ level, expectedPercent }) => {
    const { container } = renderFeedback({ type: "volume", level });

    expect(screen.getByText(`${expectedPercent}%`)).toBeDefined();
    expect(
      container
        .querySelector('[data-video-center-feedback="volume"]')
        ?.getAttribute("data-volume-level"),
    ).toBe(expectedPercent);
  });

  it("mute フィードバックを data-video-center-feedback で識別できる", () => {
    const { container } = renderFeedback({ type: "mute" });

    expect(container.querySelector('[data-video-center-feedback="mute"]')).not.toBeNull();
  });

  it("skip フィードバックに seekStepSeconds の秒数を表示する", () => {
    renderFeedback({ type: "skipBackward" }, { seekStepSeconds: 10 });
    expect(screen.getByText("10")).toBeDefined();

    cleanup();

    renderFeedback({ type: "skipForward" }, { seekStepSeconds: 15 });
    expect(screen.getByText("15")).toBeDefined();
  });

  it("visible に応じて opacity クラスを切り替える", () => {
    const { container: hidden } = renderFeedback({ type: "play" }, { visible: false });
    expect(hidden.querySelector('[data-video-center-feedback="play"]')?.className).toContain(
      "opacity-0",
    );

    cleanup();

    const { container: shown } = renderFeedback({ type: "play" }, { visible: true });
    expect(shown.querySelector('[data-video-center-feedback="play"]')?.className).toContain(
      "opacity-100",
    );
  });
});
