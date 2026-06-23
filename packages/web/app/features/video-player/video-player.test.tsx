import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { VideoPlayer } from "./video-player";

const defaultVideoPlayerProps = {
  backHref: "/works/work-1",
  src: "/stream/test.mp4",
  workTitle: "作品タイトル",
  episodeTitle: "#01",
  seekThumbnail: null,
} as const;

const DOUBLE_CLICK_THRESHOLD_MS = 200;

function getPlayer(container: HTMLElement) {
  const player = container.firstElementChild;
  if (!(player instanceof HTMLElement)) {
    throw new Error("プレイヤーが見つかりません");
  }

  return player;
}

function advanceSingleClickDelay() {
  act(() => {
    vi.advanceTimersByTime(DOUBLE_CLICK_THRESHOLD_MS);
  });
}

function createPointerEvent(
  type: "pointerdown" | "pointerup",
  pointerType: "mouse" | "touch",
  options?: { button?: number; pointerId?: number },
) {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: options?.button ?? 0,
    cancelable: true,
    pointerId: options?.pointerId ?? 1,
  });
  Object.defineProperty(event, "pointerType", {
    configurable: true,
    value: pointerType,
  });

  return event;
}

function createPointerUpEvent(pointerType: "mouse" | "touch", options?: { button?: number }) {
  return createPointerEvent("pointerup", pointerType, options);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("VideoPlayer", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);

    localStorage.clear();

    playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: false });
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      });
    pauseSpy = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(function (this: HTMLMediaElement) {
        Object.defineProperty(this, "paused", { configurable: true, value: true });
        this.dispatchEvent(new Event("pause"));
      });
  });

  it("ネイティブ controls なしで autoPlay と playsInline が有効になる", () => {
    render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} autoPlay />
      </MemoryRouter>,
    );

    const video = document.querySelector("video");

    expect(video).toBeDefined();
    expect(video?.hasAttribute("controls")).toBe(false);
    expect(video?.autoplay).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.getAttribute("src")).toBe("/stream/test.mp4");
  });

  it("クリックすると再生/一時停止が切り替わり、フィードバックが表示される", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} />
      </MemoryRouter>,
    );

    const player = getPlayer(container);

    fireEvent(player, createPointerUpEvent("mouse"));
    advanceSingleClickDelay();

    expect(playSpy).toHaveBeenCalled();
    expect(document.querySelector('[data-video-center-feedback="play"]')).not.toBeNull();

    fireEvent(player, createPointerUpEvent("mouse"));
    advanceSingleClickDelay();

    expect(pauseSpy).toHaveBeenCalled();
    expect(document.querySelector('[data-video-center-feedback="pause"]')).not.toBeNull();
  });

  it("作品タイトル部分のクリックでは再生状態が切り替わらない", () => {
    render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "再生" }));

    expect(playSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("作品タイトル"));

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();
    expect(document.querySelector("[data-video-center-feedback]")).toBeNull();
  });

  it("再生ボタンによる操作ではフィードバックが表示されない", () => {
    render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "再生" }));

    expect(document.querySelector("[data-video-center-feedback]")).toBeNull();
  });

  it("コントロール非表示中、タッチでは再生状態が切り替わらない", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} />
      </MemoryRouter>,
    );

    const player = getPlayer(container);

    fireEvent(player, createPointerUpEvent("mouse"));
    advanceSingleClickDelay();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent(player, createPointerUpEvent("touch"));

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("コントロール非表示中、マウスクリックで一時停止される", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} />
      </MemoryRouter>,
    );

    const player = getPlayer(container);

    fireEvent(player, createPointerUpEvent("mouse"));
    advanceSingleClickDelay();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent(player, createPointerUpEvent("mouse"));
    advanceSingleClickDelay();

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("ボタン操作によってコントロール非表示タイマーが延長される", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} />
      </MemoryRouter>,
    );

    const player = getPlayer(container);

    fireEvent(player, createPointerUpEvent("mouse"));
    advanceSingleClickDelay();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent(player, createPointerUpEvent("touch"));
    advanceSingleClickDelay();

    const muteButton = screen.getByRole("button", { name: "ミュート" });
    const controlSection = muteButton.closest("[data-video-control]");
    expect(controlSection?.className.includes("pointer-events-auto")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(muteButton);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(controlSection?.className.includes("pointer-events-auto")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(controlSection?.className.includes("pointer-events-auto")).toBe(false);
  });

  it("コントロール操作終了後に非表示タイマーが再開される", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer {...defaultVideoPlayerProps} />
      </MemoryRouter>,
    );

    const player = getPlayer(container);

    fireEvent(player, createPointerUpEvent("mouse"));
    advanceSingleClickDelay();
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent(player, createPointerUpEvent("touch"));
    advanceSingleClickDelay();

    const muteButton = screen.getByRole("button", { name: "ミュート" });
    const controlSection = muteButton.closest("[data-video-control]");
    expect(controlSection?.className.includes("pointer-events-auto")).toBe(true);

    fireEvent(muteButton, createPointerEvent("pointerdown", "mouse", { pointerId: 7 }));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(controlSection?.className.includes("pointer-events-auto")).toBe(true);

    fireEvent(document, createPointerEvent("pointerup", "mouse", { pointerId: 7 }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(controlSection?.className.includes("pointer-events-auto")).toBe(false);
  });

  describe("フルスクリーン", () => {
    function renderPlayer() {
      return render(
        <MemoryRouter>
          <VideoPlayer {...defaultVideoPlayerProps} />
        </MemoryRouter>,
      );
    }

    afterEach(() => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
    });

    it("ダブルクリックするとフルスクリーンに切り替わる", () => {
      vi.useFakeTimers();

      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const { container } = renderPlayer();
      const player = getPlayer(container);

      player.requestFullscreen = requestFullscreen;

      fireEvent(player, createPointerUpEvent("mouse"));
      act(() => {
        vi.advanceTimersByTime(DOUBLE_CLICK_THRESHOLD_MS - 1);
      });
      fireEvent(player, createPointerUpEvent("mouse"));

      expect(requestFullscreen).toHaveBeenCalledTimes(1);
    });

    it("フルスクリーン中にダブルクリックするとフルスクリーンが解除される", () => {
      vi.useFakeTimers();

      const exitFullscreen = vi.fn().mockResolvedValue(undefined);
      const { container } = renderPlayer();
      const player = getPlayer(container);

      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: player,
      });
      document.exitFullscreen = exitFullscreen;

      fireEvent(player, createPointerUpEvent("mouse"));
      act(() => {
        vi.advanceTimersByTime(DOUBLE_CLICK_THRESHOLD_MS - 1);
      });
      fireEvent(player, createPointerUpEvent("mouse"));

      expect(exitFullscreen).toHaveBeenCalledTimes(1);
    });

    it("ダブルクリックしても再生状態は切り替わらない", () => {
      vi.useFakeTimers();

      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const { container } = renderPlayer();
      const player = getPlayer(container);

      player.requestFullscreen = requestFullscreen;

      fireEvent(player, createPointerUpEvent("mouse"));
      act(() => {
        vi.advanceTimersByTime(DOUBLE_CLICK_THRESHOLD_MS - 1);
      });
      fireEvent(player, createPointerUpEvent("mouse"));
      advanceSingleClickDelay();

      expect(playSpy).not.toHaveBeenCalled();
      expect(pauseSpy).not.toHaveBeenCalled();
    });

    it("ダブルクリックしても中央フィードバックが表示されない", () => {
      vi.useFakeTimers();

      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const { container } = renderPlayer();
      const player = getPlayer(container);

      player.requestFullscreen = requestFullscreen;

      fireEvent(player, createPointerUpEvent("mouse"));
      act(() => {
        vi.advanceTimersByTime(DOUBLE_CLICK_THRESHOLD_MS - 1);
      });
      fireEvent(player, createPointerUpEvent("mouse"));

      expect(document.querySelector("[data-video-center-feedback]")).toBeNull();
    });

    it("作品タイトル部分をダブルクリックしてもフルスクリーンにならない", () => {
      vi.useFakeTimers();

      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const exitFullscreen = vi.fn().mockResolvedValue(undefined);
      const { container } = renderPlayer();
      const player = getPlayer(container);

      player.requestFullscreen = requestFullscreen;
      document.exitFullscreen = exitFullscreen;

      fireEvent(screen.getByText("作品タイトル"), createPointerUpEvent("mouse"));
      act(() => {
        vi.advanceTimersByTime(DOUBLE_CLICK_THRESHOLD_MS - 1);
      });
      fireEvent(screen.getByText("作品タイトル"), createPointerUpEvent("mouse"));

      expect(requestFullscreen).not.toHaveBeenCalled();
      expect(exitFullscreen).not.toHaveBeenCalled();
    });

    it("タッチでのダブルタップではフルスクリーンにならない", () => {
      vi.useFakeTimers();

      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const exitFullscreen = vi.fn().mockResolvedValue(undefined);
      const { container } = renderPlayer();
      const player = getPlayer(container);

      player.requestFullscreen = requestFullscreen;
      document.exitFullscreen = exitFullscreen;

      fireEvent(player, createPointerUpEvent("touch"));
      fireEvent(player, createPointerUpEvent("touch"));

      expect(requestFullscreen).not.toHaveBeenCalled();
      expect(exitFullscreen).not.toHaveBeenCalled();
    });
  });

  describe("キーボードショートカット", () => {
    function renderPlayer() {
      return render(
        <MemoryRouter>
          <VideoPlayer {...defaultVideoPlayerProps} />
        </MemoryRouter>,
      );
    }

    function getVideo() {
      const video = document.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) {
        throw new Error("video 要素が見つかりません");
      }

      return video;
    }

    function setVideoState(
      video: HTMLVideoElement,
      state: Partial<{ currentTime: number; duration: number }>,
    ) {
      if (state.duration !== undefined) {
        Object.defineProperty(video, "duration", {
          configurable: true,
          value: state.duration,
        });
      }

      if (state.currentTime !== undefined) {
        Object.defineProperty(video, "currentTime", {
          configurable: true,
          value: state.currentTime,
          writable: true,
        });
      }

      act(() => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });
    }

    function expectCenterFeedback(type: string) {
      expect(document.querySelector(`[data-video-center-feedback="${type}"]`)).not.toBeNull();
    }

    it("キーボード操作で中央フィードバックが表示される", () => {
      renderPlayer();
      const video = getVideo();
      setVideoState(video, { currentTime: 50, duration: 120 });

      fireEvent.keyDown(window, { key: " " });
      expect(playSpy).toHaveBeenCalled();
      expectCenterFeedback("play");

      fireEvent.keyDown(window, { key: " " });
      expect(pauseSpy).toHaveBeenCalled();
      expectCenterFeedback("pause");

      fireEvent.keyDown(window, { key: "ArrowLeft" });
      expect(video.currentTime).toBe(40);
      expectCenterFeedback("skipBackward");

      fireEvent.keyDown(window, { key: "ArrowRight" });
      expect(video.currentTime).toBe(50);
      expectCenterFeedback("skipForward");

      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(video.volume).toBe(0.95);
      expectCenterFeedback("volume");

      fireEvent.keyDown(window, { key: "m" });
      expect(video.muted).toBe(true);
      expectCenterFeedback("mute");
    });

    it("F キーとコントロール操作では中央フィードバックが表示されない", () => {
      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const { container } = renderPlayer();
      const player = container.firstElementChild;
      if (!(player instanceof HTMLElement)) {
        throw new Error("プレイヤーが見つかりません");
      }

      player.requestFullscreen = requestFullscreen;

      fireEvent.keyDown(window, { key: "f" });
      expect(requestFullscreen).toHaveBeenCalled();
      expect(document.querySelector("[data-video-center-feedback]")).toBeNull();

      const video = getVideo();
      setVideoState(video, { currentTime: 50, duration: 120 });

      fireEvent.click(screen.getByRole("button", { name: "10秒戻る" }));
      expect(video.currentTime).toBe(40);
      expect(document.querySelector("[data-video-center-feedback]")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "ミュート" }));
      expect(document.querySelector("[data-video-center-feedback]")).toBeNull();
    });
  });
});
