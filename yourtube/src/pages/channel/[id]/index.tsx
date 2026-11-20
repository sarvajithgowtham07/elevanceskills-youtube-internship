
"use client";

import ChannelHeader from "@/components/ChannelHeader";
import Channeltabs from "@/components/Channeltabs";
import ChannelVideos from "@/components/ChannelVideos";
import VideoUploader from "@/components/VideoUploader";
import { useUser } from "@/lib/AuthContext";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";

const index = () => {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useUser();

  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChannelVideos = async () => {
      if (!user?._id || !router.isReady) return;

      try {
        setLoading(true);

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_BACKEND_URL}/video/getall`
        );

        if (!response.ok) {
          throw new Error("Unable to fetch videos");
        }

        const allVideos = await response.json();

        const channelVideos = allVideos.filter((video: any) => {
          return (
            video.uploader === user._id ||
            (user.channelname &&
              video.videochanel?.toLowerCase() ===
                user.channelname.toLowerCase())
          );
        });

        setVideos(channelVideos);
      } catch (error) {
        console.error("Error fetching channel videos:", error);
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchChannelVideos();
  }, [user, router.isReady]);

  const channel = user;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading channel...
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-white">
      <div className="max-w-full mx-auto">
        <ChannelHeader channel={channel} user={user} />
        <Channeltabs />

        <div className="px-4 pb-8">
          <VideoUploader channelId={id} channelName={channel?.channelname} />
        </div>

        <div className="px-4 pb-8">
          {loading ? (
            <p className="text-center py-12 text-gray-500">
              Loading videos...
            </p>
          ) : (
            <ChannelVideos videos={videos} />
          )}
        </div>
      </div>
    </div>
  );
};

export default index;
