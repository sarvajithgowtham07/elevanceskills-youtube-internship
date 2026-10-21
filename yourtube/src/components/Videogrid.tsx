
import React, { useEffect, useState } from "react";
import Videocard from "./videocard";
import axiosInstance from "@/lib/axiosinstance";

const Videogrid = () => {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = async () => {
    try {
      const res = await axiosInstance.get("/video/getall");
      setVideos(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error fetching videos:", error);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {loading ? (
        <p>Loading videos...</p>
      ) : videos.length > 0 ? (
        videos.map((video) => (
          <Videocard key={video._id} video={video} />
        ))
      ) : (
        <p>No videos available yet.</p>
      )}
    </div>
  );
};

export default Videogrid;
