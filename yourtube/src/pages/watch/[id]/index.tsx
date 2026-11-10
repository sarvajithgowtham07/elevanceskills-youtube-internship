import Comments from "@/components/Comments";
import RelatedVideos from "@/components/RelatedVideos";
import VideoInfo from "@/components/VideoInfo";
import Videopplayer from "@/components/Videopplayer";
import axiosInstance from "@/lib/axiosinstance";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

const WatchPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const videoId = Array.isArray(id) ? id[0] : id;
  const [videos, setvideo] = useState<any>(null);
  const [video, setvide] = useState<any>(null);
  const [loading, setloading] = useState(true);

  useEffect(() => {
    const fetchvideo = async () => {
      if (!videoId) return;
      try {
        const res = await axiosInstance.get("/video/getall");
        const matchedVideo = res.data?.filter((vid: any) => vid._id === videoId);
        setvideo(matchedVideo[0]);
        setvide(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setloading(false);
      }
    };
    fetchvideo();
  }, [videoId]);

  if (loading) {
    return <div>Loading..</div>;
  }

  if (!videos) {
    return <div>Video not found</div>;
  }

  const videoTitle = String(
    videos.videotitle || videos.filename || ""
  ).toLowerCase();

  const subtitleUrl = videoTitle.includes("grateful")
    ? "/subtitles/grateful-neffex-en.vtt"
    : videoTitle.includes("mortals")
      ? "/subtitles/mortals-warriyo-en.vtt"
      : undefined;

  const currentIndex = video?.findIndex((vid: any) => vid._id === videoId) ?? -1;
  const nextVideo = currentIndex >= 0 ? video[currentIndex + 1] : undefined;
  const autoPlay = router.query.autoplay === "1";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Videopplayer
              key={videos._id}
              video={{
                ...videos,
                subtitleUrl,
                subtitleLanguage: "en",
                subtitleLabel: "English",
              }}
              nextVideo={nextVideo}
              autoPlay={autoPlay}
            />
            <VideoInfo video={videos} />
            {videoId && <Comments videoId={videoId} />}
          </div>
          <div className="space-y-4">
            <RelatedVideos videos={video} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WatchPage;