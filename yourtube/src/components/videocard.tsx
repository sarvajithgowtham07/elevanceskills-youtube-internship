
"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import VideoDuration from "./VideoDuration";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

export default function VideoCard({ video }: any) {
  const channelName = video?.videochanel || "Unknown Channel";
  const channelImage = video?.channelImage || video?.uploaderImage;

  const thumbnailUrl = video?.thumbnail
    ? video.thumbnail.startsWith("http")
      ? video.thumbnail
      : `${BACKEND_URL}${video.thumbnail.startsWith("/") ? "" : "/"}${video.thumbnail}`
    : undefined;

  const videoUrl = video?.filepath
    ? `${BACKEND_URL}/${video.filepath.replace(/\\/g, "/")}`
    : undefined;

  return (
    <Link href={`/watch/${video?._id}`} className="group">
      <div className="space-y-3">
        <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={video?.videotitle || "Video thumbnail"}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <video
              src={videoUrl}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              preload="metadata"
              muted
            />
          )}
          <VideoDuration filepath={video?.filepath} />
        </div>

        <div className="flex gap-3">
          <Avatar className="w-9 h-9 flex-shrink-0">
            {channelImage && (
              <AvatarImage src={channelImage} alt={channelName} />
            )}
            <AvatarFallback>
              {channelName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600">
              {video?.videotitle || "Untitled video"}
            </h3>

            <p className="text-sm text-gray-600 mt-1">{channelName}</p>

            <p className="text-sm text-gray-600">
              {(video?.views || 0).toLocaleString()} views •{" "}
              {video?.createdAt
                ? `${formatDistanceToNow(new Date(video.createdAt))} ago`
                : "Recently uploaded"}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
