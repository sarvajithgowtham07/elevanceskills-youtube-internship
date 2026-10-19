"use client";



import { useRef, useEffect, useState } from "react";



interface VideoPlayerProps {

  video: {

    _id: string;

    videotitle: string;

    filepath: string;

  };

}



export default function VideoPlayer({ video }: VideoPlayerProps) {

  const videoRef = useRef<HTMLVideoElement>(null);

  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null);



  const [isPlaying, setIsPlaying] = useState(false);

  const [progress, setProgress] = useState(0);

  const [duration, setDuration] = useState(0);

  const [volume, setVolume] = useState(1);

  const [isMuted, setIsMuted] = useState(false);

  const [showControls, setShowControls] = useState(true);

  const [playbackSpeed, setPlaybackSpeed] = useState(1);



  const resetControlsTimer = () => {

    setShowControls(true);



    if (hideControlsTimer.current) {

      clearTimeout(hideControlsTimer.current);

    }



    if (isPlaying) {

      hideControlsTimer.current = setTimeout(() => {

        setShowControls(false);

      }, 3000);

    }

  };



  const togglePlay = () => {

    const videoElement = videoRef.current;

    if (!videoElement) return;



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



  const handleSpeedChange = (

    e: React.ChangeEvent<HTMLSelectElement>

  ) => {

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

          } else {

            void videoElement.requestFullscreen();

          }

          break;



        case "arrowleft":

          event.preventDefault();

          videoElement.currentTime = Math.max(

            0,

            videoElement.currentTime - 5

          );

          break;



        case "arrowright":

          event.preventDefault();

          videoElement.currentTime = Math.min(

            videoElement.duration || 0,

            videoElement.currentTime + 5

          );

          break;



        case "arrowup": {

          event.preventDefault();



          const newVolumeUp = Math.min(

            1,

            videoElement.volume + 0.1

          );



          videoElement.volume = newVolumeUp;

          videoElement.muted = false;



          setVolume(newVolumeUp);

          setIsMuted(false);

          break;

        }



        case "arrowdown": {

          event.preventDefault();



          const newVolumeDown = Math.max(

            0,

            videoElement.volume - 0.1

          );



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

      }

    };



    window.addEventListener("keydown", handleKeyDown);



    return () => {

      window.removeEventListener("keydown", handleKeyDown);



      if (hideControlsTimer.current) {

        clearTimeout(hideControlsTimer.current);

      }

    };

  }, []);



  const handleMouseMove = () => {

    resetControlsTimer();

  };



  const handleTimeUpdate = () => {

    const videoElement = videoRef.current;

    if (!videoElement) return;



    setProgress(videoElement.currentTime);

  };



  const handleLoadedMetadata = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    console.log("METADATA EVENT FIRED");
    console.log("Video ID:", video._id);
    console.log("Video filepath:", video.filepath);
    console.log("Video URL:", videoElement.currentSrc);
    console.log("Duration in seconds:", videoElement.duration);
    console.log("Duration formatted:", formatTime(videoElement.duration));

    setDuration(videoElement.duration);
    setProgress(videoElement.currentTime);
  };



  const handleSeek = (

    e: React.ChangeEvent<HTMLInputElement>

  ) => {

    const videoElement = videoRef.current;

    if (!videoElement) return;



    const newTime = Number(e.target.value);



    videoElement.currentTime = newTime;

    setProgress(newTime);



    resetControlsTimer();

  };



  const handleVolumeChange = (

    e: React.ChangeEvent<HTMLInputElement>

  ) => {

    const videoElement = videoRef.current;

    if (!videoElement) return;



    const newVolume = Number(e.target.value);



    videoElement.volume = newVolume;

    videoElement.muted = newVolume === 0;



    setVolume(newVolume);

    setIsMuted(newVolume === 0);



    resetControlsTimer();

  };



  const toggleMute = () => {

    const videoElement = videoRef.current;

    if (!videoElement) return;



    videoElement.muted = !videoElement.muted;

    setIsMuted(videoElement.muted);



    resetControlsTimer();

  };



  const toggleFullscreen = () => {

    const videoElement = videoRef.current;

    if (!videoElement) return;



    if (document.fullscreenElement) {

      void document.exitFullscreen();

    } else {

      void videoElement.requestFullscreen();

    }



    resetControlsTimer();

  };



  const formatTime = (time: number) => {

    if (!Number.isFinite(time)) return "0:00";



    const minutes = Math.floor(time / 60);

    const seconds = Math.floor(time % 60);



    return `${minutes}:${seconds.toString().padStart(2, "0")}`;

  };



  return (

    <div

      className="relative bg-black rounded-lg overflow-hidden"

      onMouseMove={handleMouseMove}

    >

      <video

        ref={videoRef}

        className="w-full aspect-video"

        onTimeUpdate={handleTimeUpdate}

        onLoadedMetadata={handleLoadedMetadata}

        onPlay={() => {

          setIsPlaying(true);

          resetControlsTimer();

        }}

        onPause={() => {

          setIsPlaying(false);

          setShowControls(true);

        }}

        onEnded={() => {

          setIsPlaying(false);

          setShowControls(true);

          setProgress(duration);

        }}
>

        <source

          src={`${process.env.NEXT_PUBLIC_BACKEND_URL}/${video?.filepath}`}

          type="video/mp4"

        />

        Your browser does not support the video tag.

      </video>



      <div

        className={`absolute bottom-0 left-0 right-0 bg-black/90 px-3 py-2 transition-opacity duration-300 ${showControls

          ? "opacity-100"

          : "opacity-0 pointer-events-none"

          }`}

      >

        <input

          type="range"

          min="0"

          max={duration || 0}

          step="0.1"

          value={progress}

          onChange={handleSeek}

          className="w-full h-1 cursor-pointer"

        />



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

            {formatTime(progress)} / {formatTime(duration)}

          </span>



          <div className="flex-1" />



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

            onClick={toggleFullscreen}

            className="text-lg"

            type="button"

            aria-label="Toggle fullscreen"

          >

            ⛶

          </button>

        </div>

      </div>

    </div>

  );

}