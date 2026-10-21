import React, { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";

type DownloadItem = {
    _id: string;
    downloadedAt: string;
    status: "pending" | "completed" | "failed";
    fileSize: number;
    subscriptionPlan: string;
    videoId?: {
        _id: string;
        videotitle?: string;
        filename?: string;
        filepath?: string;
        thumbnail?: string;
    } | null;
};

type DownloadHistoryResponse = {
    downloads: DownloadItem[];
    quota: {
        plan: string;
        dailyLimit: number;
        dailyUsed: number;
        dailyRemaining: number;
        monthlyLimit: number;
        monthlyUsed: number;
        monthlyRemaining: number;
    };
};

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DownloadsPage() {
    const [data, setData] = useState<DownloadHistoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const loadDownloads = async () => {
            try {
                const response = await axiosInstance.get("/video/downloads/history");
                setData(response.data);
            } catch {
                setError("Unable to load download history. Please sign in and try again.");
            } finally {
                setLoading(false);
            }
        };

        loadDownloads();
    }, []);

    if (loading) {
        return <div className="p-6">Loading downloads...</div>;
    }

    if (error) {
        return <div className="p-6 text-red-600">{error}</div>;
    }

    const quota = data?.quota;

    return (
        <main className="min-h-screen bg-background text-foreground p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold">Downloads</h1>

                {quota && (
                    <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="rounded-lg border p-4">
                            <p className="text-sm text-muted-foreground">Current plan</p>
                            <p className="text-xl font-semibold">{quota.plan}</p>
                        </div>
                        <div className="rounded-lg border p-4">
                            <p className="text-sm text-muted-foreground">Daily quota remaining</p>
                            <p className="text-xl font-semibold">
                                {quota.dailyRemaining} / {quota.dailyLimit}
                            </p>
                        </div>
                        <div className="rounded-lg border p-4">
                            <p className="text-sm text-muted-foreground">Monthly quota remaining</p>
                            <p className="text-xl font-semibold">
                                {quota.monthlyRemaining} / {quota.monthlyLimit}
                            </p>
                        </div>
                    </section>
                )}

                {!data?.downloads.length ? (
                    <div className="rounded-lg border p-8 text-center">
                        <h2 className="text-lg font-semibold">No downloads yet</h2>
                        <p className="text-sm text-muted-foreground mt-2">
                            Videos you download will appear here with their status and details.
                        </p>
                    </div>
                ) : (
                    <section className="space-y-3">
                        {data.downloads.map((item) => (
                            <article
                                key={item._id}
                                className="rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                            >
                                <div className="flex-1 min-w-0">
                                    <h2 className="font-semibold truncate">
                                        {item.videoId?.thumbnail && (
                                            <img
                                                src={item.videoId.thumbnail}
                                                alt={item.videoId.videotitle || "Video thumbnail"}
                                                className="h-20 w-32 rounded-md object-cover"
                                            />
                                        )}
                                    </h2>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {new Date(item.downloadedAt).toLocaleString()}
                                    </p>
                                    <p className="text-sm mt-1">
                                        Plan: {item.subscriptionPlan} · Size: {formatSize(item.fileSize)}
                                    </p>
                                </div>
                                <span className="text-sm capitalize rounded-full border px-3 py-1 self-start sm:self-center">
                                    {item.status}
                                </span>
                            </article>
                        ))}
                    </section>
                )}
            </div>
        </main>
    );
}
