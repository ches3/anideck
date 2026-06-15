const STORAGE_KEY = "anideck:video-player-volume";

export type VideoPlayerVolumePreference = {
  volume: number;
  muted: boolean;
};

function clampVolume(volume: number): number {
  return Math.min(Math.max(volume, 0), 1);
}

function isVideoPlayerVolumePreference(value: unknown): value is VideoPlayerVolumePreference {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    "volume" in value &&
    "muted" in value &&
    typeof value.volume === "number" &&
    typeof value.muted === "boolean"
  );
}

export function readVideoPlayerVolumePreference(): VideoPlayerVolumePreference | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isVideoPlayerVolumePreference(parsed)) {
      return null;
    }

    return {
      volume: clampVolume(parsed.volume),
      muted: parsed.muted,
    };
  } catch {
    return null;
  }
}

export function writeVideoPlayerVolumePreference(preference: VideoPlayerVolumePreference): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volume: clampVolume(preference.volume),
        muted: preference.muted,
      }),
    );
  } catch {
    // Ignore quota errors and private browsing restrictions.
  }
}
