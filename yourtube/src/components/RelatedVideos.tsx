
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

interface RelatedVideosProps {
  videos: Array<{
    _id: string;
    videotitle: string;
    videochanel: string;
    views: number;
    createdAt: string;
    filepath?: string;
    thumbnail?: string;
    thumbnailUrl?: string;
  }>;
}

export default function RelatedVideos({ videos }: RelatedVideosProps) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:5000";

  return (
    <div className="space-y-2">
      {videos.map((video) => {
        const thumbnailPath = video.thumbnailUrl || video.thumbnail || "";
        const thumbnail = thumbnailPath
          ? `${backendUrl}/${thumbnailPath.replace(/^\/+/, "")}`
          : "";

        return (
          <Link
            key={video._id}
            href={`/watch/${video._id}`}
            className="flex gap-2 group"
          >
            <div className="relative w-40 aspect-video bg-gray-100 rounded overflow-hidden flex-shrink-0">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt={video.videotitle}
                  onError={(event) => {
                    console.error("Thumbnail failed to load:", thumbnail);
                    event.currentTarget.style.display = "none";
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm line-clamp-2 group-hover:text-blue-600">
                {video.videotitle}
              </h3>
              <p className="text-xs text-gray-600 mt-1">
                {video.videochanel}
              </p>
              <p className="text-xs text-gray-600">
                {video.views.toLocaleString()} views •{" "}
                {formatDistanceToNow(new Date(video.createdAt))} ago
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
