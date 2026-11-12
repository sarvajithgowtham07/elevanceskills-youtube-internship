let activeVideo: HTMLVideoElement | null = null;
let channel: BroadcastChannel | null = null;
let initialized = false;
const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random()}`;

const pauseActiveVideo = () => {
  if (activeVideo && !activeVideo.paused) {
    activeVideo.pause();
  }
  activeVideo = null;
};

const handlePlaybackMessage = (data: { type?: string; tabId?: string }) => {
  if (data.type === "VIDEO_PLAYING" && data.tabId !== tabId) {
    pauseActiveVideo();
  }
};

const initialize = () => {
  if (initialized || typeof window === "undefined") return;

  initialized = true;

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel("video-playback");
    channel.onmessage = (event: MessageEvent) => {
      handlePlaybackMessage(event.data);
    };
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== "video-playback-event" || !event.newValue) return;

    try {
      handlePlaybackMessage(JSON.parse(event.newValue));
    } catch {
      return;
    }
  });
};

const notifyOtherTabs = () => {
  const message = {
    type: "VIDEO_PLAYING",
    tabId,
    timestamp: Date.now()
  };

  channel?.postMessage(message);

  try {
    localStorage.setItem("video-playback-event", JSON.stringify(message));
  } catch {
  }
};

export const registerVideo = (video: HTMLVideoElement) => {
  initialize();

  if (activeVideo && activeVideo !== video) {
    activeVideo.pause();
  }

  activeVideo = video;
  notifyOtherTabs();
};

export const unregisterVideo = (video: HTMLVideoElement) => {
  if (activeVideo === video) {
    activeVideo = null;
  }
};
