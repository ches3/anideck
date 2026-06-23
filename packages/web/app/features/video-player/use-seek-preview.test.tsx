import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useSeekPreview, type SeekThumbnailPreviewProps } from "./use-seek-preview";
import { formatDuration } from "./utils";

const sampleManifest = {
  intervalSec: 10 as const,
  count: 144,
  thumbnail: { width: 240 as const, height: 136 },
  sprite: { columns: 10 as const, rows: 15 },
};

const readySeekThumbnail: SeekThumbnailPreviewProps = {
  manifest: sampleManifest,
  spriteUrl: "/api/works/work-1/episodes/episode-1/seek-thumbnails/sprite.webp",
};

type HookResult = ReturnType<typeof useSeekPreview>;

function renderUseSeekPreview(options: {
  currentTime?: number;
  duration?: number;
  seekThumbnail?: SeekThumbnailPreviewProps;
  onSeek?: (time: number) => void;
}) {
  const onSeek = options.onSeek ?? vi.fn();
  const hookRef: { current: HookResult | null } = { current: null };

  function Harness() {
    const hook = useSeekPreview({
      currentTime: options.currentTime ?? 0,
      duration: options.duration ?? 0,
      seekThumbnail: options.seekThumbnail,
      onSeek,
    });
    hookRef.current = hook;

    return (
      <div
        ref={hook.seekTrackRef}
        className="relative"
        data-testid="seek-preview-track"
        onPointerLeave={hook.onSeekHoverEnd}
        onPointerMove={hook.onSeekHoverMove}
      >
        <div
          ref={hook.previewTooltipRef}
          aria-hidden={!hook.isPreviewVisible}
          data-testid="seek-preview-tooltip"
          style={{
            left: hook.isPreviewVisible ? `${hook.previewLeftPx}px` : "0%",
          }}
        >
          {hook.frameStyle !== null ? (
            <div
              data-testid="seek-preview-thumbnail"
              style={{
                backgroundImage: hook.frameStyle.backgroundImage,
                backgroundPosition: hook.frameStyle.backgroundPosition,
                backgroundRepeat: hook.frameStyle.backgroundRepeat,
                backgroundSize: hook.frameStyle.backgroundSize,
              }}
            />
          ) : null}
          <span>{hook.previewTime === null ? null : formatDuration(hook.previewTime)}</span>
        </div>
      </div>
    );
  }

  render(<Harness />);

  const getHook = () => {
    if (!hookRef.current) {
      throw new Error("フックが初期化されませんでした");
    }

    return hookRef.current;
  };

  return { getHook, onSeek };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useSeekPreview", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      private callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe() {
        this.callback([], this);
      }

      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("ドラッグ中は onSeek() が呼ばれない", () => {
    const { getHook, onSeek } = renderUseSeekPreview({ currentTime: 30, duration: 120 });

    act(() => {
      getHook().onSeekValueChange([42]);
    });

    expect(onSeek).not.toHaveBeenCalled();
    expect(getHook().previewTime).toBe(42);
  });

  it("ドラッグ完了時に onSeek() が呼ばれる", () => {
    const { getHook, onSeek } = renderUseSeekPreview({ currentTime: 30, duration: 120 });

    act(() => {
      getHook().onSeekValueChange([42]);
      getHook().onSeekValueCommit([42]);
    });

    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(42);
  });

  it("サムネイル未設定時のドラッグ中は再生時刻を表示する", () => {
    const { getHook } = renderUseSeekPreview({ currentTime: 30, duration: 120 });

    act(() => {
      getHook().onSeekValueChange([42]);
    });

    expect(screen.getByTestId("seek-preview-tooltip")).toBeDefined();
    expect(screen.queryByTestId("seek-preview-thumbnail")).toBeNull();
    expect(screen.getByText("0:42")).toBeDefined();
  });

  it("サムネイル設定時のドラッグ中はサムネイルと再生時刻を表示する", () => {
    const { getHook } = renderUseSeekPreview({
      currentTime: 30,
      duration: 120,
      seekThumbnail: readySeekThumbnail,
    });

    act(() => {
      getHook().onSeekValueChange([42]);
    });

    expect(screen.getByTestId("seek-preview-thumbnail")).toBeDefined();
    expect(screen.getByText("0:42")).toBeDefined();
  });

  it("ドラッグ終了後はプレビューを非表示にする", () => {
    const { getHook } = renderUseSeekPreview({ currentTime: 30, duration: 120 });

    act(() => {
      getHook().onSeekValueChange([42]);
      getHook().onSeekDragEnd();
    });

    expect(screen.getByTestId("seek-preview-tooltip").getAttribute("aria-hidden")).toBe("true");
  });

  it("シークバー左端付近ではサムネイルプレビューがトラック内に収まる", () => {
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    getBoundingClientRect.mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "seek-preview-track") {
        return {
          left: 0,
          width: 400,
          right: 400,
          top: 0,
          bottom: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }

      if (this.dataset.testid === "seek-preview-tooltip") {
        return {
          left: 0,
          width: 160,
          right: 160,
          top: 0,
          bottom: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        left: 0,
        width: 0,
        right: 0,
        top: 0,
        bottom: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    renderUseSeekPreview({
      currentTime: 30,
      duration: 120,
      seekThumbnail: readySeekThumbnail,
    });

    const seekTrack = screen.getByTestId("seek-preview-track");

    fireEvent.pointerMove(seekTrack, { clientX: 0, pointerType: "mouse" });

    const tooltip = screen.getByTestId("seek-preview-tooltip");
    expect(tooltip.style.left).toBe("80px");

    getBoundingClientRect.mockRestore();
  });

  it("シークバー右端付近ではサムネイルの実際の幅に応じてクランプする", () => {
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    getBoundingClientRect.mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "seek-preview-track") {
        return {
          left: 0,
          width: 400,
          right: 400,
          top: 0,
          bottom: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }

      if (this.dataset.testid === "seek-preview-tooltip") {
        const width = this.querySelector('[data-testid="seek-preview-thumbnail"]') ? 256 : 70;
        return {
          left: 0,
          width,
          right: width,
          top: 0,
          bottom: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }

      return {
        left: 0,
        width: 0,
        right: 0,
        top: 0,
        bottom: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    renderUseSeekPreview({
      currentTime: 30,
      duration: 120,
      seekThumbnail: readySeekThumbnail,
    });

    const seekTrack = screen.getByTestId("seek-preview-track");
    fireEvent.pointerMove(seekTrack, { clientX: 400, pointerType: "mouse" });

    expect(screen.getByTestId("seek-preview-tooltip").style.left).toBe("272px");

    getBoundingClientRect.mockRestore();
  });
});
