import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useVideoPlayer } from "./use-video-player";
import {
  writeVideoPlayerVolumePreference,
  readVideoPlayerVolumePreference,
} from "./volume-preference";

const SEEK_STEP_SECONDS = 10;

type HookResult = ReturnType<typeof useVideoPlayer>;

function renderUseVideoPlayer(options?: { autoPlay?: boolean }) {
  const hookRef: { current: HookResult | null } = { current: null };

  function Harness() {
    const hook = useVideoPlayer({
      autoPlay: options?.autoPlay ?? false,
      seekStepSeconds: SEEK_STEP_SECONDS,
    });
    hookRef.current = hook;

    return (
      <div ref={hook.containerRef}>
        <video ref={hook.videoRef} />
      </div>
    );
  }

  const view = render(<Harness />);

  const getHook = () => {
    if (!hookRef.current) {
      throw new Error("フックが初期化されませんでした");
    }

    return hookRef.current;
  };

  const video = view.container.querySelector("video");
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error("video 要素が見つかりません");
  }

  const container = view.container.firstElementChild;
  if (!(container instanceof HTMLDivElement)) {
    throw new Error("コンテナ要素が見つかりません");
  }

  return {
    getHook,
    video,
    container,
    unmount: view.unmount,
  };
}

function setVideoProperties(
  video: HTMLVideoElement,
  properties: Partial<{
    currentTime: number;
    duration: number;
    paused: boolean;
    volume: number;
    muted: boolean;
    readyState: number;
  }>,
) {
  const writableKeys = new Set(["currentTime", "volume", "muted"]);

  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(video, key, {
      configurable: true,
      value,
      writable: writableKeys.has(key),
    });
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("useVideoPlayer", () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.localStorage.clear();
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

  describe("play()", () => {
    it("isPlaying が true になる", async () => {
      const { getHook } = renderUseVideoPlayer();

      await act(async () => {
        const result = await getHook().play();
        expect(result).toBe(true);
      });

      expect(getHook().isPlaying).toBe(true);
    });

    it("play() が失敗した場合は false を返し、再生状態を変更しない", async () => {
      vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementationOnce(() =>
        Promise.reject(new Error("play denied")),
      );
      const { getHook } = renderUseVideoPlayer();

      await act(async () => {
        const result = await getHook().play();
        expect(result).toBe(false);
      });

      expect(getHook().isPlaying).toBe(false);
    });
  });

  it("autoPlay 有効時は play() が呼ばれる", () => {
    renderUseVideoPlayer({ autoPlay: true });

    expect(playSpy).toHaveBeenCalled();
  });

  describe("seek()", () => {
    it("0 未満は 0 にクリップされる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      setVideoProperties(video, { duration: 120, currentTime: 60 });
      act(() => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });

      act(() => {
        getHook().seek(-10);
      });

      expect(video.currentTime).toBe(0);
      expect(getHook().currentTime).toBe(0);
    });

    it("duration 超過は duration にクリップされる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      setVideoProperties(video, { duration: 120, currentTime: 60 });
      act(() => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });

      act(() => {
        getHook().seek(200);
      });

      expect(video.currentTime).toBe(120);
      expect(getHook().currentTime).toBe(120);
    });

    it("非有限値では currentTime が変わらない", () => {
      const { getHook, video } = renderUseVideoPlayer();

      setVideoProperties(video, { duration: 120, currentTime: 30 });

      act(() => {
        getHook().seek(Number.NaN);
      });

      expect(video.currentTime).toBe(30);
    });
  });

  describe("skipBackward()", () => {
    it("skip 量が currentTime を超える場合は currentTime が 0 になる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      setVideoProperties(video, { duration: 120, currentTime: 5 });
      act(() => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });

      act(() => {
        getHook().skipBackward();
      });

      expect(video.currentTime).toBe(0);
    });
  });

  describe("skipForward()", () => {
    it("skip 量が残り時間を超える場合は currentTime が duration になる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      setVideoProperties(video, { duration: 120, currentTime: 115 });
      act(() => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });

      act(() => {
        getHook().skipForward();
      });

      expect(video.currentTime).toBe(120);
    });
  });

  describe("setVideoVolume()", () => {
    it("1 を超える値は 1 にクリップされる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      act(() => {
        getHook().setVideoVolume(1.5);
      });

      expect(video.volume).toBe(1);
      expect(getHook().volume).toBe(1);
      expect(getHook().isMuted).toBe(false);
    });

    it("0 を設定するとミュート状態になる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      act(() => {
        getHook().setVideoVolume(0);
      });

      expect(video.volume).toBe(0);
      expect(video.muted).toBe(true);
      expect(getHook().isMuted).toBe(true);
    });
  });

  describe("toggleMute()", () => {
    it("volumeが0の状態でミュートを解除すると、volumeが1になる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      act(() => {
        getHook().setVideoVolume(0);
        getHook().toggleMute();
      });

      expect(video.muted).toBe(false);
      expect(video.volume).toBe(1);
      expect(getHook().isMuted).toBe(false);
      expect(getHook().volume).toBe(1);
    });

    it("ミュート時に音量値が維持される", () => {
      const { getHook, video } = renderUseVideoPlayer();

      act(() => {
        getHook().setVideoVolume(0.5);
        getHook().toggleMute();
      });

      expect(video.muted).toBe(true);
      expect(video.volume).toBe(0.5);
      expect(getHook().isMuted).toBe(true);
      expect(getHook().volume).toBe(0.5);
    });

    it("ミュート解除時に音量値が維持される", () => {
      const { getHook, video } = renderUseVideoPlayer();

      act(() => {
        getHook().setVideoVolume(0.5);
        getHook().toggleMute();
        getHook().toggleMute();
      });

      expect(video.muted).toBe(false);
      expect(video.volume).toBe(0.5);
      expect(getHook().isMuted).toBe(false);
      expect(getHook().volume).toBe(0.5);
    });
  });

  describe("音量設定の永続化", () => {
    it("localStorage に保存済みの設定がある場合、マウント直後に反映される", () => {
      writeVideoPlayerVolumePreference({ volume: 0.3, muted: true });

      const { getHook, video } = renderUseVideoPlayer();

      expect(video.volume).toBe(0.3);
      expect(video.muted).toBe(true);
      expect(getHook().volume).toBe(0.3);
      expect(getHook().isMuted).toBe(true);
    });

    it("setVideoVolume() 実行時に localStorage に保存される", () => {
      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().setVideoVolume(0.7);
      });

      expect(readVideoPlayerVolumePreference()).toEqual({ volume: 0.7, muted: false });
    });

    it("toggleMute() 実行時に localStorage に保存される", () => {
      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().setVideoVolume(0.5);
        getHook().toggleMute();
      });

      expect(readVideoPlayerVolumePreference()).toEqual({ volume: 0.5, muted: true });
    });
  });

  it("loadedmetadata で duration が反映される", () => {
    const { getHook, video } = renderUseVideoPlayer();

    setVideoProperties(video, { duration: 180, volume: 0.8 });

    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });

    expect(getHook().duration).toBe(180);
    expect(getHook().volume).toBe(0.8);
  });

  it("timeupdate で currentTime が反映される", () => {
    const { getHook, video } = renderUseVideoPlayer();

    setVideoProperties(video, { currentTime: 42 });

    act(() => {
      video.dispatchEvent(new Event("timeupdate"));
    });

    expect(getHook().currentTime).toBe(42);
  });

  describe("triggerCenterFeedback()", () => {
    it("一定時間後に centerFeedbackVisible が false になる", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().triggerCenterFeedback({ type: "play" });
      });

      expect(getHook().centerFeedback).toEqual({ type: "play" });
      expect(getHook().centerFeedbackVisible).toBe(true);

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(getHook().centerFeedbackVisible).toBe(false);
    });

    it("連続呼び出しで centerFeedback が最新値に更新される", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().triggerCenterFeedback({ type: "volume", level: 0.5 });
      });

      expect(getHook().centerFeedback).toEqual({ type: "volume", level: 0.5 });

      act(() => {
        vi.advanceTimersByTime(200);
        getHook().triggerCenterFeedback({ type: "volume", level: 0.6 });
      });

      expect(getHook().centerFeedback).toEqual({ type: "volume", level: 0.6 });
      expect(getHook().centerFeedbackVisible).toBe(true);
    });
  });

  describe("キーボードショートカット", () => {
    function prepareVideo(video: HTMLVideoElement) {
      setVideoProperties(video, { duration: 120, currentTime: 50, volume: 1, muted: false });
      act(() => {
        video.dispatchEvent(new Event("loadedmetadata"));
      });
    }

    it("操作に応じて centerFeedback と動画状態を更新する", () => {
      const { getHook, video } = renderUseVideoPlayer();
      prepareVideo(video);

      act(() => {
        fireEvent.keyDown(window, { key: "ArrowLeft" });
      });
      expect(video.currentTime).toBe(40);
      expect(getHook().centerFeedback).toEqual({ type: "skipBackward" });

      act(() => {
        fireEvent.keyDown(window, { key: "ArrowRight" });
      });
      expect(video.currentTime).toBe(50);
      expect(getHook().centerFeedback).toEqual({ type: "skipForward" });

      act(() => {
        fireEvent.keyDown(window, { key: "ArrowDown" });
      });
      expect(video.volume).toBe(0.95);
      expect(getHook().centerFeedback).toEqual({ type: "volume", level: 0.95 });

      act(() => {
        fireEvent.keyDown(window, { key: "ArrowUp" });
      });
      expect(video.volume).toBe(1);
      expect(getHook().centerFeedback).toEqual({ type: "volume", level: 1 });

      act(() => {
        fireEvent.keyDown(window, { key: "m" });
      });
      expect(video.muted).toBe(true);
      expect(getHook().centerFeedback).toEqual({ type: "mute" });

      act(() => {
        fireEvent.keyDown(window, { key: "m" });
      });
      expect(video.muted).toBe(false);
      expect(getHook().centerFeedback).toEqual({ type: "volume", level: 1 });

      setVideoProperties(video, { paused: true });

      act(() => {
        fireEvent.keyDown(window, { key: " " });
      });
      expect(getHook().centerFeedback).toEqual({ type: "play" });

      setVideoProperties(video, { paused: false });

      act(() => {
        fireEvent.keyDown(window, { key: " " });
      });
      expect(getHook().centerFeedback).toEqual({ type: "pause" });
    });

    it("トグル系キーのリピートではショートカットを実行しない", () => {
      const { getHook, video, container } = renderUseVideoPlayer();
      prepareVideo(video);
      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      container.requestFullscreen = requestFullscreen;
      setVideoProperties(video, { paused: true });

      act(() => {
        fireEvent.keyDown(window, { key: " ", repeat: true });
      });

      expect(video.paused).toBe(true);
      expect(getHook().centerFeedback).toBeNull();
      expect(getHook().hasRecentActivity).toBe(false);

      act(() => {
        fireEvent.keyDown(window, { key: "k", repeat: true });
      });

      expect(video.paused).toBe(true);
      expect(getHook().centerFeedback).toBeNull();
      expect(getHook().hasRecentActivity).toBe(false);

      act(() => {
        fireEvent.keyDown(window, { key: "m", repeat: true });
      });

      expect(video.muted).toBe(false);
      expect(getHook().centerFeedback).toBeNull();
      expect(getHook().hasRecentActivity).toBe(false);

      act(() => {
        fireEvent.keyDown(window, { key: "f", repeat: true });
      });

      expect(requestFullscreen).not.toHaveBeenCalled();
      expect(getHook().centerFeedback).toBeNull();
      expect(getHook().hasRecentActivity).toBe(false);
    });

    it("defaultPrevented 済みのキーイベントではショートカットを実行しない", () => {
      const { getHook, video } = renderUseVideoPlayer();
      prepareVideo(video);

      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowRight",
      });
      event.preventDefault();

      act(() => {
        window.dispatchEvent(event);
      });

      expect(video.currentTime).toBe(50);
      expect(getHook().centerFeedback).toBeNull();
    });

    it("F キーでは centerFeedback を設定しない", () => {
      const { getHook, container } = renderUseVideoPlayer();
      container.requestFullscreen = vi.fn().mockResolvedValue(undefined);

      act(() => {
        fireEvent.keyDown(window, { key: "f" });
      });

      expect(getHook().centerFeedback).toBeNull();
      expect(getHook().centerFeedbackVisible).toBe(false);
    });
  });

  describe("onUserActivity()", () => {
    it("無操作が一定時間続くと hasRecentActivity が false になる", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().onUserActivity();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().hasRecentActivity).toBe(false);
    });

    it("操作のたびに無操作タイマーが延長される", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().onUserActivity();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().hasRecentActivity).toBe(false);

      act(() => {
        getHook().onUserActivity();
        vi.advanceTimersByTime(1000);
      });

      expect(getHook().hasRecentActivity).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(getHook().hasRecentActivity).toBe(false);
    });
  });

  describe("beginControlInteraction() / endControlInteraction()", () => {
    it("操作中は無操作タイマーが満了しない", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().onUserActivity();
        getHook().beginControlInteraction();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().hasRecentActivity).toBe(true);
    });

    it("操作を終了してから OVERLAY_HIDE_DELAY_MS 経過後に hasRecentActivity が false になる", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().beginControlInteraction();
        vi.advanceTimersByTime(5000);
        getHook().endControlInteraction();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().hasRecentActivity).toBe(false);
    });

    it("操作中はタイマーを開始しない", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().beginControlInteraction();
        getHook().onUserActivity();
        getHook().endControlInteraction();
        vi.advanceTimersByTime(1000);
      });

      expect(getHook().hasRecentActivity).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(getHook().hasRecentActivity).toBe(false);
    });

    it("操作中は showControls が true のまま維持される", async () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      await act(async () => {
        await getHook().play();
      });

      act(() => {
        getHook().beginControlInteraction();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().showControls).toBe(true);
    });

    it("begin 前の endControlInteraction ではタイマーを開始しない", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().endControlInteraction();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().hasRecentActivity).toBe(false);
    });
  });

  describe("showControls", () => {
    it("再生中は無操作タイマー満了後に非表示になる", async () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      await act(async () => {
        await getHook().play();
      });

      act(() => {
        getHook().onUserActivity();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().showControls).toBe(false);
    });

    it("一時停止中は無操作タイマー満了後も表示される", () => {
      vi.useFakeTimers();

      const { getHook } = renderUseVideoPlayer();

      act(() => {
        getHook().onUserActivity();
        vi.advanceTimersByTime(2000);
      });

      expect(getHook().showControls).toBe(true);
    });
  });

  it("fullscreenchange イベントで isFullscreen が更新される", () => {
    const { getHook, container } = renderUseVideoPlayer();

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: container,
    });

    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(getHook().isFullscreen).toBe(true);

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });

    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(getHook().isFullscreen).toBe(false);
  });

  describe("toggleFullscreen()", () => {
    it("requestFullscreen() が呼ばれる", async () => {
      const requestFullscreen = vi.fn().mockResolvedValue(undefined);
      const { getHook, container } = renderUseVideoPlayer();

      container.requestFullscreen = requestFullscreen;

      await act(async () => {
        await getHook().toggleFullscreen();
      });

      expect(requestFullscreen).toHaveBeenCalled();
    });

    it("requestFullscreen() が失敗しても未処理エラーが発生しない", async () => {
      const requestFullscreen = vi.fn().mockRejectedValue(new Error("fullscreen denied"));
      const { getHook, container } = renderUseVideoPlayer();

      container.requestFullscreen = requestFullscreen;

      await expect(
        act(async () => {
          await getHook().toggleFullscreen();
        }),
      ).resolves.toBeUndefined();

      expect(requestFullscreen).toHaveBeenCalled();
    });
  });

  describe("togglePlay()", () => {
    it("一時停止中は play() が呼ばれる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      setVideoProperties(video, { paused: true });

      act(() => {
        getHook().togglePlay();
      });

      expect(playSpy).toHaveBeenCalled();
      expect(pauseSpy).not.toHaveBeenCalled();
    });

    it("再生中は pause() が呼ばれる", () => {
      const { getHook, video } = renderUseVideoPlayer();

      setVideoProperties(video, { paused: false });

      act(() => {
        getHook().togglePlay();
      });

      expect(pauseSpy).toHaveBeenCalled();
      expect(playSpy).not.toHaveBeenCalled();
    });
  });

  it("アンマウント時にタイマーがクリアされる", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const { getHook, unmount } = renderUseVideoPlayer();

    act(() => {
      getHook().triggerCenterFeedback({ type: "pause" });
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
