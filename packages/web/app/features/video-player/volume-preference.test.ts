import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  readVideoPlayerVolumePreference,
  writeVideoPlayerVolumePreference,
} from "./volume-preference";

const STORAGE_KEY = "anideck:video-player-volume";

describe("readVideoPlayerVolumePreference()", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("未保存の場合は null を返す", () => {
    expect(readVideoPlayerVolumePreference()).toBeNull();
  });

  it("保存済みの設定を読み込む", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: 0.3, muted: true }));

    expect(readVideoPlayerVolumePreference()).toEqual({ volume: 0.3, muted: true });
  });

  it("不正な JSON の場合は null を返す", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json");

    expect(readVideoPlayerVolumePreference()).toBeNull();
  });

  it("型が不正な場合は null を返す", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: "0.5", muted: false }));

    expect(readVideoPlayerVolumePreference()).toBeNull();
  });

  it("範囲外の volume はクランプする", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: 1.5, muted: false }));

    expect(readVideoPlayerVolumePreference()).toEqual({ volume: 1, muted: false });
  });
});

describe("writeVideoPlayerVolumePreference()", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("設定を localStorage に保存する", () => {
    writeVideoPlayerVolumePreference({ volume: 0.7, muted: false });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ volume: 0.7, muted: false }),
    );
  });

  it("範囲外の volume はクランプして保存する", () => {
    writeVideoPlayerVolumePreference({ volume: -0.2, muted: true });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify({ volume: 0, muted: true }),
    );
  });
});
