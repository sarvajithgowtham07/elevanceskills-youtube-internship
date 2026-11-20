
import VideoCard from "./videocard";

export default function ChannelVideos({ videos = [] }: any) {
  if (!videos || videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16">
        <div className="mb-4 rounded-full bg-gray-100 p-5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-500"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m10 9 5 3-5 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">No videos uploaded yet</h3>
        <p className="text-sm text-gray-500 mt-2">
          Your uploaded videos will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Videos</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {videos.map((video: any) => (
          <VideoCard key={video._id} video={video} />
        ))}
      </div>
    </div>
  );
}
