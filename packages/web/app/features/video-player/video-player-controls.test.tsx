import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { VideoPlayerControls, type VideoPlayerControlsProps } from "./video-player-controls";

vi.mock("~/components/ui/slider", () => {
  const interactionStartValues = new Map<string, number>();

  return {
    Slider({
      "aria-label": ariaLabel,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onValueChange,
      onValueCommit,
      value,
    }: {
      "aria-label"?: string;
      onPointerCancel?: () => void;
      onPointerDown?: () => void;
      onPointerMove?: () => void;
      onPointerUp?: () => void;
      onValueChange?: (values: number[]) => void;
      onValueCommit?: (values: number[]) => void;
      value?: number[];
    }) {
      const currentValue = value?.[0] ?? 0;
      const sliderKey = ariaLabel ?? "";

      return (
        <button
          aria-label={ariaLabel}
          aria-valuenow={currentValue}
          onPointerCancel={() => {
            onPointerCancel?.();
          }}
          onPointerDown={() => {
            interactionStartValues.set(sliderKey, currentValue);
            onPointerDown?.();
          }}
          onPointerMove={() => {
            onPointerMove?.();
            onValueChange?.([42]);
          }}
          onPointerUp={() => {
            const startValue = interactionStartValues.get(sliderKey) ?? currentValue;

            onPointerUp?.();

            if (currentValue !== startValue) {
              onValueCommit?.([currentValue]);
            }
          }}
          role="slider"
          type="button"
        />
      );
    },
  };
});

function createControlsProps(
  overrides: Partial<VideoPlayerControlsProps> = {},
): VideoPlayerControlsProps {
  return {
    episodeTitle: "#01",
    workTitle: "作品タイトル",
    backHref: "/works/work-1",
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isFullscreen: false,
    showControls: true,
    seekStepSeconds: 10,
    onTogglePlay: vi.fn(),
    onSeek: vi.fn(),
    onSkipBackward: vi.fn(),
    onSkipForward: vi.fn(),
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    onToggleFullscreen: vi.fn(),
    ...overrides,
  };
}

function renderControls(overrides: Partial<VideoPlayerControlsProps> = {}) {
  const props = createControlsProps(overrides);

  render(
    <MemoryRouter>
      <VideoPlayerControls {...props} />
    </MemoryRouter>,
  );

  return props;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VideoPlayerControls", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("操作ボタンと作品・エピソード情報が表示される", () => {
    renderControls();

    expect(screen.getByRole("link", { name: "作品詳細に戻る" })).toBeDefined();
    expect(screen.getByRole("button", { name: "再生" })).toBeDefined();
    expect(screen.getByRole("button", { name: "10秒戻る" })).toBeDefined();
    expect(screen.getByRole("button", { name: "10秒進む" })).toBeDefined();
    expect(screen.getByRole("button", { name: "ミュート" })).toBeDefined();
    expect(screen.getByRole("button", { name: "フルスクリーン" })).toBeDefined();
    expect(screen.getByText("作品タイトル")).toBeDefined();
    expect(screen.getByText("#01")).toBeDefined();
  });

  it("戻るリンクの href が backHref と一致する", () => {
    renderControls({ backHref: "/works/work-42" });

    expect(screen.getByRole("link", { name: "作品詳細に戻る" }).getAttribute("href")).toBe(
      "/works/work-42",
    );
  });

  it("再生状態に応じて再生ボタンのラベルが切り替わる", () => {
    const { rerender } = render(
      <MemoryRouter>
        <VideoPlayerControls {...createControlsProps({ isPlaying: false })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "再生" })).toBeDefined();

    rerender(
      <MemoryRouter>
        <VideoPlayerControls {...createControlsProps({ isPlaying: true })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "一時停止" })).toBeDefined();
  });

  it("ミュート状態に応じてミュートボタンのラベルが切り替わる", () => {
    const { rerender } = render(
      <MemoryRouter>
        <VideoPlayerControls {...createControlsProps({ isMuted: false })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "ミュート" })).toBeDefined();

    rerender(
      <MemoryRouter>
        <VideoPlayerControls {...createControlsProps({ isMuted: true })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "ミュート解除" })).toBeDefined();
  });

  it("フルスクリーン状態に応じてフルスクリーンボタンのラベルが切り替わる", () => {
    const { rerender } = render(
      <MemoryRouter>
        <VideoPlayerControls {...createControlsProps({ isFullscreen: false })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "フルスクリーン" })).toBeDefined();

    rerender(
      <MemoryRouter>
        <VideoPlayerControls {...createControlsProps({ isFullscreen: true })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "フルスクリーン解除" })).toBeDefined();
  });

  it("currentTime と duration が表示される", () => {
    renderControls({ currentTime: 90, duration: 120 });

    expect(screen.getByText("1:30 / 2:00")).toBeDefined();
  });

  it("各ボタンをクリックすると対応するコールバックが呼ばれる", () => {
    const props = renderControls();

    fireEvent.click(screen.getByRole("button", { name: "再生" }));
    fireEvent.click(screen.getByRole("button", { name: "10秒戻る" }));
    fireEvent.click(screen.getByRole("button", { name: "10秒進む" }));
    fireEvent.click(screen.getByRole("button", { name: "ミュート" }));
    fireEvent.click(screen.getByRole("button", { name: "フルスクリーン" }));

    expect(props.onTogglePlay).toHaveBeenCalledTimes(1);
    expect(props.onSkipBackward).toHaveBeenCalledTimes(1);
    expect(props.onSkipForward).toHaveBeenCalledTimes(1);
    expect(props.onToggleMute).toHaveBeenCalledTimes(1);
    expect(props.onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it("シークバーのドラッグ中は onSeek() が呼ばれない", () => {
    const props = renderControls({ currentTime: 30, duration: 120 });
    const seekSlider = screen.getByRole("slider", { name: "再生位置" });

    fireEvent.pointerDown(seekSlider);
    fireEvent.pointerMove(seekSlider);

    expect(props.onSeek).not.toHaveBeenCalled();
    expect(screen.getByRole("slider", { name: "再生位置" }).getAttribute("aria-valuenow")).toBe(
      "42",
    );
  });

  it("シークバーのドラッグ完了時に onSeek() が呼ばれる", () => {
    const props = renderControls({ currentTime: 30, duration: 120 });
    const seekSlider = screen.getByRole("slider", { name: "再生位置" });

    fireEvent.pointerDown(seekSlider);
    fireEvent.pointerMove(seekSlider);
    fireEvent.pointerUp(seekSlider);

    expect(props.onSeek).toHaveBeenCalledTimes(1);
    expect(props.onSeek).toHaveBeenCalledWith(42);
  });

  it("音量バーのドラッグ中は onVolumeChange() が呼ばれる", () => {
    const props = renderControls({ volume: 0.5 });

    fireEvent.pointerMove(screen.getByRole("slider", { name: "音量" }));

    expect(props.onVolumeChange).toHaveBeenCalledTimes(1);
    expect(props.onVolumeChange).toHaveBeenCalledWith(42);
  });

  it("コントロール非表示時は操作を受け付けない", () => {
    renderControls({ showControls: false });

    const playButton = screen.getByRole("button", { name: "再生" });
    const controlSection = playButton.closest("[data-video-control]");

    expect(controlSection?.className.includes("pointer-events-auto")).toBe(false);
  });
});
