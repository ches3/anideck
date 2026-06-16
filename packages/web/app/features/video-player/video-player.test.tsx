import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { VideoPlayer } from "./video-player";

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
        <VideoPlayer
          autoPlay
          backHref="/works/work-1"
          src="/stream/test.mp4"
          workTitle="作品タイトル"
          episodeTitle="#01"
        />
      </MemoryRouter>,
    );

    const video = document.querySelector("video");

    expect(video).toBeDefined();
    expect(video?.hasAttribute("controls")).toBe(false);
    expect(video?.autoplay).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.getAttribute("src")).toBe("/stream/test.mp4");
  });

  it("動画領域をクリックすると再生/一時停止が切り替わり、フィードバックが表示される", () => {
    const { container } = render(
      <MemoryRouter>
        <VideoPlayer
          backHref="/works/work-1"
          src="/stream/test.mp4"
          workTitle="作品タイトル"
          episodeTitle="#01"
        />
      </MemoryRouter>,
    );

    const player = container.firstElementChild;
    if (!(player instanceof HTMLElement)) {
      throw new Error("プレイヤーが見つかりません");
    }

    fireEvent.click(player);

    expect(playSpy).toHaveBeenCalled();
    expect(document.querySelector('[data-video-center-feedback="play"]')).not.toBeNull();

    fireEvent.click(player);

    expect(pauseSpy).toHaveBeenCalled();
    expect(document.querySelector('[data-video-center-feedback="pause"]')).not.toBeNull();
  });

  it("作品タイトル部分のクリックでは再生状態が切り替わらない", () => {
    render(
      <MemoryRouter>
        <VideoPlayer
          backHref="/works/work-1"
          src="/stream/test.mp4"
          workTitle="作品タイトル"
          episodeTitle="#01"
        />
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
        <VideoPlayer
          backHref="/works/work-1"
          src="/stream/test.mp4"
          workTitle="作品タイトル"
          episodeTitle="#01"
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "再生" }));

    expect(document.querySelector("[data-video-center-feedback]")).toBeNull();
  });

  it("コントロール非表示中、タッチでは再生状態が切り替わらない", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer
          backHref="/works/work-1"
          src="/stream/test.mp4"
          workTitle="作品タイトル"
          episodeTitle="#01"
        />
      </MemoryRouter>,
    );

    const player = container.firstElementChild;
    if (!(player instanceof HTMLElement)) {
      throw new Error("プレイヤーが見つかりません");
    }

    fireEvent.click(player);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const touchClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(touchClick, "pointerType", {
      configurable: true,
      value: "touch",
    });

    fireEvent(player, touchClick);

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("コントロール非表示中、マウスクリックで一時停止される", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer
          backHref="/works/work-1"
          src="/stream/test.mp4"
          workTitle="作品タイトル"
          episodeTitle="#01"
        />
      </MemoryRouter>,
    );

    const player = container.firstElementChild;
    if (!(player instanceof HTMLElement)) {
      throw new Error("プレイヤーが見つかりません");
    }

    fireEvent.click(player);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const mouseClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(mouseClick, "pointerType", {
      configurable: true,
      value: "mouse",
    });

    fireEvent(player, mouseClick);

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("ボタン操作によってコントロール非表示タイマーが延長される", () => {
    vi.useFakeTimers();

    const { container } = render(
      <MemoryRouter>
        <VideoPlayer
          backHref="/works/work-1"
          src="/stream/test.mp4"
          workTitle="作品タイトル"
          episodeTitle="#01"
        />
      </MemoryRouter>,
    );

    const player = container.firstElementChild;
    if (!(player instanceof HTMLElement)) {
      throw new Error("プレイヤーが見つかりません");
    }

    fireEvent.click(player);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    const touchClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    Object.defineProperty(touchClick, "pointerType", {
      configurable: true,
      value: "touch",
    });
    fireEvent(player, touchClick);

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

  describe("キーボードショートカット", () => {
    function renderPlayer() {
      return render(
        <MemoryRouter>
          <VideoPlayer
            backHref="/works/work-1"
            src="/stream/test.mp4"
            workTitle="作品タイトル"
            episodeTitle="#01"
          />
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
