"use client";

import { useEffect, useState } from "react";

const formatDuration = (time: number) => {
  if (!Number.isFinite(time)) return "";
  const h = Math.floor(time / 3600);
  const m = Math.floor((time % 3600) / 60);
  const s = Math.floor(time % 60);
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

export default function VideoDuration({ filepath }: { filepath: string }) {
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.src = `${process.env.NEXT_PUBLIC_BACKEND_URL}/${filepath}`;
    el.onloadedmetadata = () => setDuration(el.duration);

    return () => {
      el.onloadedmetadata = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [filepath]);

  if (duration === null) return null;

  return (
    <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-1 rounded">
      {formatDuration(duration)}
    </div>
  );
}