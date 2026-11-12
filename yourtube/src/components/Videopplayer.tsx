"use client";
import axiosInstance from "@/lib/axiosinstance";
import { useUser } from "@/lib/AuthContext";
import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { registerVideo, unregisterVideo } from "@/lib/VideoPlaybackManager";

const getSubtitleUrl = (title: string) => {
  const normalizedTitle = title.toLowerCase();

  if (normalizedTitle.includes("cold")) return "/subtitles/cold-en.vtt";
  if (normalizedTitle.includes("grateful")) return "/subtitles/grateful-neffex-en.vtt";
  if (normalizedTitle.includes("mortals") || normalizedTitle.includes("warriyo")) return "/subtitles/mortals-warriyo-en.vtt";

  return "";
};

interface VideoPlayerProps {
  video: {
    _id: string;
    videotitle: string;
    filepath?: string;
    qualities?: { label: string; filepath: string }[];
    subtitleUrl?: string;
    subtitleLanguage?: string;
    subtitleLabel?: string;
  };
  nextVideo?: {
    _id: string;
    videotitle: string;
    filepath: string;
  };
  autoPlay?: boolean;
  onWatchRemainingChange?: (seconds: number | null) => void;
  onDownloadQuotaChange?: (quota: { plan: string; dailyLimit: number; dailyUsed: number; dailyRemaining: number; monthlyLimit: number; monthlyUsed: number; monthlyRemaining: number } | null) => void;
}

export default function VideoPlayer({
  video,
  nextVideo,
  autoPlay = false,
  onWatchRemainingChange,
  onDownloadQuotaChange,
}: VideoPlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);
  const { user } = useUser();

  const [countdown, setCountdown] = useState<number | null>(null);
  const [selectedQuality, setSelectedQuality] = useState("Auto");
  const [videoSource, setVideoSource] = useState(video.filepath || "");
  const [defaultVideoSource, setDefaultVideoSource] = useState(video.filepath || "");
  const [originalVideoSource, setOriginalVideoSource] = useState("");
  const [originalAllowed, setOriginalAllowed] = useState(false);
  const [playbackQualities, setPlaybackQualities] = useState<{ label: string; filepath: string }[]>(video.qualities || []);
  const [playbackError, setPlaybackError] = useState("");
  const [watchLimitReached, setWatchLimitReached] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
  const watchSessionIdRef = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const pendingPlaybackRef = useRef<{ time: number; shouldPlay: boolean } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [bufferedProgress, setBufferedProgress] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isSubtitlesEnabled, setIsSubtitlesEnabled] = useState(false);
  const [subtitleText, setSubtitleText] = useState("");
  const subtitleTrackRef = useRef<HTMLTrackElement>(null);
  const subtitleUrl = video.subtitleUrl || getSubtitleUrl(video.videotitle);
  const playerRef = useRef<HTMLDivElement>(null);
  const resumePositionRef = useRef<number | null>(null);

  // 1. Timeline Hover Preview refs & state
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoverPreviewTime, setHoverPreviewTime] = useState<number | null>(null);
  const [hoverPreviewX, setHoverPreviewX] = useState(0);

  // 3. Preview video update effect
  useEffect(() => {
    const previewVideo = previewVideoRef.current;

    if (
      previewVideo &&
      hoverPreviewTime !== null &&
      previewVideo.readyState >= 1
    ) {
      previewVideo.currentTime = hoverPreviewTime;
    }
  }, [hoverPreviewTime]);

  useEffect(() => {
    if (countdown === null) return;

    if (countdown === 0 && nextVideo) {
      void router.push({
        pathname: `/watch/${nextVideo._id}`,
        query: { autoplay: "1" },
      });
      setCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, nextVideo, router]);

  const resetControlsTimer = () => {
    setShowControls(true);

    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
    }

    if (videoRef.current && !videoRef.current.paused) {
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const togglePlay = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    if (watchLimitReached) {
      setPlaybackError("Your daily watch-time limit has been reached. Upgrade your plan to continue watching.");
      return;
    }

    if (videoElement.ended) {
      videoElement.currentTime = 0;
      setProgress(0);
      void videoElement.play();
      return;
    }

    if (videoElement.paused) {
      void videoElement.play();
    } else {
      videoElement.pause();
    }

    resetControlsTimer();
  };



  const loadDownloadQuota = async () => {
    if (!user?._id) return;

    try {
      const response = await axiosInstance.get("/video/downloads/history");
      onDownloadQuotaChange?.(response.data.quota);
    } catch (error) {
      console.error("Download quota error:", error);
    }
  };

  const handleDownload = async () => {
    if (!user?._id || isDownloading) {
      if (!user?._id) setDownloadMessage("Please sign in to download videos.");
      return;
    }

    setIsDownloading(true);
    setDownloadMessage("");

    try {
      const response = await axiosInstance.get(`/video/download/${video._id}`, {
        responseType: "blob",
      });

      const disposition = response.headers["content-disposition"] || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `${video.videotitle || "video"}.mp4`;
      const blobUrl = window.URL.createObjectURL(
        new Blob([response.data], {
          type: response.headers["content-type"] || "video/mp4",
        })
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
      setDownloadMessage("Download started. The file will be saved to your device.");
      await loadDownloadQuota();
    } catch (error: any) {
      let message = error.response?.data?.message;

      if (error.response?.data instanceof Blob) {
        try {
          const errorText = await error.response.data.text();
          message = JSON.parse(errorText).message;
        } catch {
          message = "";
        }
      }

      setDownloadMessage(
        message || "Unable to download this video. Please try again."
      );
      await loadDownloadQuota();
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    void loadDownloadQuota();
  }, [user?._id]);

  const sendWatchHeartbeat = async (playing: boolean) => {
    if (!user?._id || !video._id) return;

    try {
      const response = await axiosInstance.post("/video/watch-time/heartbeat", {
        videoId: video._id,
        sessionId: watchSessionIdRef.current,
        playing
      });

      const data = response.data;
      onWatchRemainingChange?.(data.remainingSeconds);

      if (data.limitReached) {
        setWatchLimitReached(true);
        videoRef.current?.pause();
        setPlaybackError("Your daily watch-time limit has been reached. Upgrade your plan to continue watching.");
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        videoRef.current?.pause();
        setPlaybackError("Please sign in again to continue watching.");
      } else {
        console.error("Watch-time heartbeat error:", error);
      }
    }
  };

  useEffect(() => {
    if (!user?._id || !video._id) return;
    void sendWatchHeartbeat(false);
  }, [user?._id, video._id]);

  const saveProgress = async () => {
    const videoElement = videoRef.current;
    if (!user?._id || !videoElement || !Number.isFinite(videoElement.duration) || videoElement.duration <= 0) return;

    try {
      await axiosInstance.put(`/history/progress/${video._id}`, {
        userId: user._id,
        currentTime: videoElement.currentTime,
        duration: videoElement.duration,
      });
    } catch (error) {
      console.error("Progress save error:", error);
    }
  };

  useEffect(() => {
    if (!user?._id || !video._id) return;

    let active = true;
    resumePositionRef.current = null;

    const fetchProgress = async () => {
      try {
        const res = await axiosInstance.get(
          `/history/progress/${user._id}/${video._id}`
        );

        if (!active) return;

        const savedProgress = res.data?.progress;

        if (savedProgress && !savedProgress.completed && savedProgress.currentTime > 0) {
          resumePositionRef.current = savedProgress.currentTime;

          const videoElement = videoRef.current;

          if (videoElement && videoElement.readyState >= 1) {
            videoElement.currentTime = Math.min(
              savedProgress.currentTime,
              videoElement.duration
            );
            setProgress(videoElement.currentTime);
            resumePositionRef.current = null;
          }
        }
      } catch (error) {
        console.error("Progress fetch error:", error);
      }
    };

    fetchProgress();

    return () => {
      active = false;
    };
  }, [user?._id, video._id]);

  useEffect(() => {
    if (!user?._id || !video._id) return;

    const interval = setInterval(() => {
      void saveProgress();
    }, 5000);

    return () => clearInterval(interval);
  }, [user?._id, video._id]);

  useEffect(() => {
    if (!user?._id || !video._id || !isPlaying || isBuffering || watchLimitReached) return;

    void sendWatchHeartbeat(true);
    const interval = setInterval(() => {
      void sendWatchHeartbeat(true);
    }, 15000);

    return () => {
      clearInterval(interval);
      void sendWatchHeartbeat(false);
    };
  }, [user?._id, video._id, isPlaying, isBuffering, watchLimitReached]);
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        unregisterVideo(videoRef.current);
      }

      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, []);


  const handleVideoEnded = () => {
    setIsPlaying(false);
    setIsBuffering(false);
    setShowControls(true);
    setProgress(duration);

    if (nextVideo) {
      setCountdown(10);
    }

    void saveProgress();
  };

  const cancelAutoplay = () => {
    setCountdown(null);
  };

  const handleSkip = (seconds: number) => {
    const videoElement = videoRef.current;
    if (!videoElement || !Number.isFinite(videoElement.duration)) return;

    const newTime = Math.max(
      0,
      Math.min(videoElement.duration, videoElement.currentTime + seconds)
    );

    videoElement.currentTime = newTime;
    setProgress(newTime);
    resetControlsTimer();
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const speed = Number(e.target.value);
    const videoElement = videoRef.current;

    if (!videoElement) return;

    videoElement.playbackRate = speed;
    setPlaybackSpeed(speed);
    resetControlsTimer();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const target = event.target as HTMLElement;

      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (event.key.toLowerCase()) {
        case "s": {
          event.preventDefault();
          const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
          const currentSpeed = videoElement.playbackRate;
          const currentIndex = speeds.indexOf(currentSpeed);
          const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
          videoElement.playbackRate = nextSpeed;
          setPlaybackSpeed(nextSpeed);
          resetControlsTimer();
          break;
        }

        case "n":
          if (event.shiftKey && nextVideo) {
            event.preventDefault();
            setCountdown(null);
            void router.push({
              pathname: `/watch/${nextVideo._id}`,
              query: { autoplay: "1" },
            });
          }
          break;

        case " ":
        case "k":
          event.preventDefault();
          togglePlay();
          break;

        case "m":
          videoElement.muted = !videoElement.muted;
          setIsMuted(videoElement.muted);
          break;

        case "f":
          event.preventDefault();

          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else if (playerRef.current) {
            void playerRef.current.requestFullscreen().catch((error) => {
              console.error("Fullscreen error:", error);
            });
          }
          break;
        case "c":
          event.preventDefault();
          toggleSubtitles();
          break;

        case "arrowleft":
          event.preventDefault();
          handleSkip(event.shiftKey ? -30 : -10);
          break;

        case "arrowright":
          event.preventDefault();
          handleSkip(event.shiftKey ? 30 : 10);
          break;

        case "arrowup": {
          event.preventDefault();

          const newVolumeUp = Math.min(1, videoElement.volume + 0.1);

          videoElement.volume = newVolumeUp;
          videoElement.muted = false;

          setVolume(newVolumeUp);
          setIsMuted(false);
          break;
        }

        case "arrowdown": {
          event.preventDefault();

          const newVolumeDown = Math.max(0, videoElement.volume - 0.1);

          videoElement.volume = newVolumeDown;
          videoElement.muted = newVolumeDown === 0;

          setVolume(newVolumeDown);
          setIsMuted(newVolumeDown === 0);
          break;
        }

        case "0":
          videoElement.currentTime = 0;
          setProgress(0);
          break;

        case "p":
          if (document.pictureInPictureElement) {
            void document.exitPictureInPicture();
          } else if (document.pictureInPictureEnabled) {
            void videoElement.requestPictureInPicture().catch((error) => {
              console.error("Picture-in-Picture error:", error);
            });
          }
          break;

        case "t":
          setIsTheaterMode((prev) => !prev);
          resetControlsTimer();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);

      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
    };
  }, [nextVideo, router]);

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  const handleTimeUpdate = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    setProgress(videoElement.currentTime);

    if (isSubtitlesEnabled) {
      const track = subtitleTrackRef.current?.track;
      const activeCue = track?.activeCues?.[0] as VTTCue | undefined;
      setSubtitleText(activeCue?.text || "");
    }
  };

  useEffect(() => {
    let active = true;

    const loadPlayback = async () => {
      setSelectedQuality("Auto");
      setVideoSource("");
      setDefaultVideoSource("");
      setOriginalVideoSource("");
      setOriginalAllowed(false);
      setPlaybackQualities([]);
      setPlaybackError("");
      setIsBuffering(true);
      pendingPlaybackRef.current = null;

      try {
        const res = await axiosInstance.get(`/video/play/${video._id}`);

        if (!active) return;

        if (!res.data?.filepath) {
          throw new Error("The playback endpoint did not return a video URL");
        }

        setVideoSource(res.data.filepath);
        setDefaultVideoSource(res.data.filepath);
        setOriginalVideoSource(res.data.originalAllowed ? res.data.filepath : "");
        setPlaybackQualities(res.data.qualities || []);
        setOriginalAllowed(Boolean(res.data.originalAllowed));
        setSelectedQuality(res.data.defaultQuality || "Auto");
      } catch (error: any) {
        if (!active) return;

        setPlaybackError(error.response?.data?.message || error.message || "Unable to load video");
        console.error("Playback authorization error:", error.response?.data || error);
      } finally {
        if (active) setIsBuffering(false);
      }
    };

    void loadPlayback();

    return () => {
      active = false;
    };
  }, [video._id]);

  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const quality = e.target.value;
    const source = quality === "Auto"
      ? defaultVideoSource
      : quality === "Original"
        ? (originalAllowed ? originalVideoSource : undefined)
        : playbackQualities.find((item) => item.label === quality)?.filepath;

    if (!source || source === videoSource) return;

    const videoElement = videoRef.current;
    if (!videoElement) return;

    pendingPlaybackRef.current = {
      time: videoElement.currentTime,
      shouldPlay: !videoElement.paused,
    };

    setSelectedQuality(quality);
    setVideoSource(source);
    setIsBuffering(true);
  };

  const handleLoadedMetadata = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    setDuration(videoElement.duration);

    const pending = pendingPlaybackRef.current;
    if (resumePositionRef.current !== null) {
      videoElement.currentTime = Math.min(
        resumePositionRef.current,
        videoElement.duration
      );
      setProgress(videoElement.currentTime);
      resumePositionRef.current = null;
    } else if (pending) {
      videoElement.currentTime = Math.min(
        pending.time,
        videoElement.duration || pending.time
      );
      setProgress(videoElement.currentTime);
      pendingPlaybackRef.current = null;

      if (pending.shouldPlay) {
        void videoElement.play().catch((error) => {
          console.error("Video quality switch playback error:", error);
        });
      }
    } else {
      setProgress(videoElement.currentTime);
    }
  };

  const handleBufferProgress = () => {
    const videoElement = videoRef.current;

    if (
      !videoElement ||
      !Number.isFinite(videoElement.duration) ||
      videoElement.duration <= 0
    )
      return;

    if (videoElement.buffered.length > 0) {
      const bufferedEnd = videoElement.buffered.end(
        videoElement.buffered.length - 1
      );

      const percentage = (bufferedEnd / videoElement.duration) * 100;
      setBufferedProgress(Math.min(100, percentage));
    }
  };

  // 2. Timeline hover mouse handlers
  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return;

    const mouseX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, mouseX / rect.width));
    const previewTime = percentage * duration;

    setHoverPreviewTime(previewTime);
    setHoverPreviewX(Math.max(80, Math.min(mouseX, rect.width - 80)));
  };

  const handleTimelineMouseLeave = () => {
    setHoverPreviewTime(null);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const newTime = Number(e.target.value);

    videoElement.currentTime = newTime;
    setProgress(newTime);

    resetControlsTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const newVolume = Number(e.target.value);

    videoElement.volume = newVolume;
    videoElement.muted = newVolume === 0;

    setVolume(newVolume);
    setIsMuted(newVolume === 0);

    resetControlsTimer();
  };

  const toggleSubtitles = () => {
    const track = subtitleTrackRef.current?.track;
    if (!track) return;

    const enable = !isSubtitlesEnabled;

    track.mode = enable ? "hidden" : "disabled";
    setIsSubtitlesEnabled(enable);

    if (enable) {
      const activeCue = track.activeCues?.[0] as VTTCue | undefined;
      setSubtitleText(activeCue?.text || "");
    } else {
      setSubtitleText("");
    }

    resetControlsTimer();
  };

  const toggleMute = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    videoElement.muted = !videoElement.muted;
    setIsMuted(videoElement.muted);

    resetControlsTimer();
  };

  const toggleFullscreen = async () => {
    const playerElement = playerRef.current;
    if (!playerElement) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await playerElement.requestFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }

    resetControlsTimer();
  };

  const handleDoubleClick = () => {
    toggleFullscreen();
  };

  const toggleTheaterMode = () => {
    setIsTheaterMode((prev) => !prev);
    resetControlsTimer();
  };

  const togglePictureInPicture = async () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoElement.requestPictureInPicture();
      }
    } catch (error) {
      console.error("Picture-in-Picture error:", error);
    }
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time)) return "0:00";

    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progressPercentage =
    duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div
      ref={playerRef}
      className={`relative bg-black overflow-hidden transition-all duration-300 select-none ${isTheaterMode
        ? "fixed inset-x-0 top-16 z-40 w-full rounded-none"
        : "w-full rounded-lg"
        }`}
      onMouseMove={handleMouseMove}
      onDoubleClick={handleDoubleClick}
    >
      <video
        ref={videoRef}
        className="w-full aspect-video"
        src={videoSource}
        onClick={togglePlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleBufferProgress}
        onWaiting={() => {
          setIsBuffering(true);
          void sendWatchHeartbeat(false);
        }}
        onCanPlay={() => setIsBuffering(false)}
        onPlaying={() => setIsBuffering(false)}
        onPlay={() => {
          setIsPlaying(true);
          resetControlsTimer();
          registerVideo(videoRef.current!);
        }}
        onPause={() => {
          setIsPlaying(false);
          void sendWatchHeartbeat(false);
          setShowControls(true);
          void saveProgress();
          unregisterVideo(videoRef.current!);

          if (hideControlsTimer.current) {
            clearTimeout(hideControlsTimer.current);
          }
        }}
        onEnded={handleVideoEnded}
        autoPlay={autoPlay}
      >
        {subtitleUrl && (
          <track
            key={subtitleUrl}
            ref={subtitleTrackRef}
            kind="subtitles"
            src={subtitleUrl}
            srcLang={video.subtitleLanguage || "en"}
            label={video.subtitleLabel || "English"}
            onLoad={() => {
              const track = subtitleTrackRef.current?.track;
              if (!track) return;

              track.mode = isSubtitlesEnabled ? "hidden" : "disabled";

              const updateSubtitle = () => {
                const activeCue = track.activeCues?.[0] as VTTCue | undefined;
                setSubtitleText(activeCue?.text || "");
              };

              track.addEventListener("cuechange", updateSubtitle);
              updateSubtitle();
            }}
            onError={() => {
              console.error("Subtitle file failed to load:", subtitleUrl);
            }}
          />
        )}
        Your browser does not support the video tag.
      </video>

      {/* Autoplay Countdown Overlay */}
      {countdown !== null && nextVideo && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-gray-900 p-6 text-center text-white shadow-xl">
            <p className="text-sm text-gray-400">Up next</p>
            <h3 className="mt-2 text-xl font-bold">{nextVideo.videotitle}</h3>
            <p className="mt-4 text-5xl font-bold">{countdown}</p>
            <p className="mt-2 text-sm text-gray-300">
              Playing next video in {countdown} seconds
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCountdown(null);
                  void router.push(`/watch/${nextVideo._id}?autoplay=1`);
                }}
                className="rounded-lg bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 transition"
              >
                Play Now
              </button>
              <button
                type="button"
                onClick={cancelAutoplay}
                className="rounded-lg bg-gray-700 px-4 py-2 font-semibold text-white hover:bg-gray-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isSubtitlesEnabled && subtitleText && (
        <div
          className="absolute left-0 right-0 flex justify-center px-4 pointer-events-none"
          style={{
            bottom: showControls ? "90px" : "8%",
            zIndex: 30,
          }}
        >
          <div className="w-[85%] max-w-[1100px] rounded-md bg-black/90 px-8 py-3 text-center text-lg font-semibold text-white whitespace-pre-line shadow-lg">
            {subtitleText}
          </div>
        </div>
      )}

      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {playbackError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-6 text-center text-white">
          <p>{playbackError}</p>
        </div>
      )}

      <div
        className={`absolute bottom-0 left-0 right-0 bg-black/90 px-3 py-2 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
      >
        {/* 4. Timeline with Hover Preview */}
        <div
          ref={timelineRef}
          className="relative w-full"
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={handleTimelineMouseLeave}
        >
          {hoverPreviewTime !== null && (
            <div
              className="absolute bottom-full mb-3 z-50 pointer-events-none"
              style={{
                left: `${hoverPreviewX}px`,
                transform: "translateX(-50%)",
              }}
            >
              <div className="w-40 overflow-hidden rounded-lg border border-white/30 bg-black shadow-xl">
                <video
                  ref={previewVideoRef}
                  src={videoSource}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full aspect-video object-cover"
                  onLoadedMetadata={(e) => {
                    if (hoverPreviewTime !== null) {
                      e.currentTarget.currentTime = hoverPreviewTime;
                    }
                  }}
                />
                <div className="py-1 text-center text-xs font-semibold text-white">
                  {formatTime(hoverPreviewTime)}
                </div>
              </div>
            </div>
          )}

          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={progress}
            onChange={handleSeek}
            className="w-full h-1 cursor-pointer"
            style={{
              background: `linear-gradient(to right, #ffffff ${progressPercentage}%, #aaaaaa ${progressPercentage}%, #aaaaaa ${bufferedProgress}%, #555555 ${bufferedProgress}%)`,
            }}
          />
        </div>

        <div className="flex items-center gap-3 mt-2 text-white flex-wrap">
          <button
            onClick={togglePlay}
            className="text-lg"
            type="button"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          <button
            onClick={() => handleSkip(-10)}
            className="text-sm"
            type="button"
            aria-label="Rewind 10 seconds"
          >
            -10
          </button>

          <button
            onClick={() => handleSkip(10)}
            className="text-sm"
            type="button"
            aria-label="Forward 10 seconds"
          >
            +10
          </button>

          <button
            onClick={toggleMute}
            className="text-lg"
            type="button"
            aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0 ? "🔇" : "🔊"}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 cursor-pointer"
            aria-label="Volume"
          />

          <span className="text-sm whitespace-nowrap">
            {formatTime(progress)} / {formatTime(duration)} (-{formatTime(Math.max(0, duration - progress))})
          </span>
          {downloadMessage && (
            <span className="text-xs text-blue-200 max-w-48">
              {downloadMessage}
            </span>
          )}

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || !user?._id}
            className="rounded-lg border border-white/15 bg-gray-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Download this video for offline viewing"
          >
            {isDownloading ? "Downloading..." : "Download"}
          </button>

          <label className="flex items-center gap-1 text-sm whitespace-nowrap">
            <span>Quality</span>
            <select
              value={selectedQuality}
              onChange={handleQualityChange}
              className="bg-gray-800 text-white rounded px-2 py-1"
              aria-label="Video quality"
            >
              <option value="Auto">Auto</option>
              {playbackQualities.map((quality) => (
                <option key={quality.label} value={quality.label}>
                  {quality.label}
                </option>
              ))}
              {originalAllowed && <option value="Original">Original</option>}
            </select>
          </label>

          <label className="flex items-center gap-1 text-sm whitespace-nowrap">
            <span>Speed</span>
            <select
              value={playbackSpeed}
              onChange={handleSpeedChange}
              className="bg-gray-800 text-white rounded px-2 py-1"
              aria-label="Playback speed"
            >
              <option value="0.5">0.5×</option>
              <option value="0.75">0.75×</option>
              <option value="1">1×</option>
              <option value="1.25">1.25×</option>
              <option value="1.5">1.5×</option>
              <option value="1.75">1.75×</option>
              <option value="2">2×</option>
            </select>
          </label>

          <button
            onClick={toggleTheaterMode}
            className="text-lg"
            type="button"
            aria-label={isTheaterMode ? "Exit theater mode" : "Theater mode"}
            title={isTheaterMode ? "Exit theater mode" : "Theater mode"}
          >
            {isTheaterMode ? "▣" : "▭"}
          </button>

          {subtitleUrl && (
            <button
              onClick={toggleSubtitles}
              className={`text-sm font-semibold ${isSubtitlesEnabled ? "text-yellow-400" : "text-white"
                }`}
              type="button"
              aria-label={
                isSubtitlesEnabled ? "Disable subtitles" : "Enable subtitles"
              }
              aria-pressed={isSubtitlesEnabled}
              title="Subtitles (C)"
            >
              CC
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="text-lg"
            type="button"
            aria-label="Toggle fullscreen"
          >
            ⛶
          </button>

          <button
            onClick={togglePictureInPicture}
            className="text-lg"
            type="button"
            aria-label="Picture in Picture"
          >
            ▣
          </button>
        </div>
      </div>
    </div>
  );
}
