
import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import path from "path";
import cloudinary from "../utils/cloudinary.js";
import Subscription from "../Modals/Subscription.js";
import WatchTime from "../Modals/WatchTime.js";

const qualityDefinitions = [
  { label: "360p", width: 640, height: 360 },
  { label: "480p", width: 854, height: 480 },
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 }
];

const planHierarchy = {
  Free: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3
};

const uploadToCloudinary = (buffer, publicId, accessLevel) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        type: accessLevel === "Free" ? "upload" : "authenticated",
        public_id: publicId,
        folder: "videos",
        overwrite: false,
        format: "mp4",
        eager: [
          ...qualityDefinitions.map(({ width, height }) => ({
            width,
            height,
            crop: "limit",
            quality: "auto:good",
            format: "mp4"
          })),
          {
            width: 320,
            height: 180,
            crop: "fill",
            start_offset: "1",
            format: "jpg"
          }
        ],
        eager_async: false
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    stream.end(buffer);
  });
};

const generateAuthenticatedUrl = (publicId) => {
  return cloudinary.url(publicId, {
    resource_type: "video",
    type: "authenticated",
    format: "mp4",
    sign_url: true,
    secure: true
  });
};

export const uploadvideo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "Please upload a video file"
    });
  }

  let uploadedAsset;
  let accessLevel = "Free";

  try {
    const originalName = req.file.originalname;
    const title = req.body.videotitle || path.parse(originalName).name;
    accessLevel = req.body.accessLevel || "Free";

    if (!["Free", "Bronze", "Silver", "Gold"].includes(accessLevel)) {
      return res.status(400).json({
        message: "Invalid video access level"
      });
    }

    const publicId = `${Date.now()}-${path.parse(originalName).name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    uploadedAsset = await uploadToCloudinary(
      req.file.buffer,
      publicId,
      accessLevel
    );

    if (!uploadedAsset.eager || uploadedAsset.eager.length < 5) {
      throw new Error("Cloudinary quality or thumbnail generation failed");
    }

    const qualities = uploadedAsset.eager.slice(0, 4).map((item, index) => ({
      label: qualityDefinitions[index].label,
      filepath: item.secure_url
    }));

    const thumbnail = uploadedAsset.eager[4].secure_url;

    const filepath = accessLevel === "Free"
      ? uploadedAsset.secure_url
      : generateAuthenticatedUrl(uploadedAsset.public_id);

    const file = new video({
      videotitle: title,
      filename: originalName,
      filepath,
      publicId: uploadedAsset.public_id,
      thumbnail,
      filetype: "video/mp4",
      filesize: String(uploadedAsset.bytes),
      videochanel: req.body.videochanel || "Local Videos",
      uploader: req.body.uploader || "Local Uploads",
      accessLevel,
      qualities
    });

    await file.save();

    return res.status(201).json({
      message: "Video uploaded successfully",
      thumbnail
    });
  } catch (error) {
    console.error("Video upload error:", error);

    if (uploadedAsset?.public_id) {
      try {
        await cloudinary.uploader.destroy(uploadedAsset.public_id, {
          resource_type: "video",
          type: accessLevel === "Free" ? "upload" : "authenticated"
        });
      } catch (cleanupError) {
        console.error("Cloudinary cleanup error:", cleanupError.message);
      }
    }

    return res.status(500).json({
      message: "Unable to upload video"
    });
  }
};

export const getallvideo = async (req, res) => {
  try {
    const allVideos = await video.find().sort({ createdAt: -1 });

    const videosWithChannelImages = await Promise.all(
      allVideos.map(async (item) => {
        let channelImage = "";

        if (item.uploader && mongoose.isValidObjectId(item.uploader)) {
          const channelOwner = await users
            .findById(item.uploader)
            .select("channelImage");

          channelImage = channelOwner?.channelImage || "";
        }

        if (!channelImage && item.videochanel) {
          const channelOwner = await users
            .findOne({ channelname: item.videochanel })
            .select("channelImage");

          channelImage = channelOwner?.channelImage || "";
        }

        const videoData = item.toObject();
        const isPremium = (item.accessLevel || "Free") !== "Free";

        if (isPremium) {
          delete videoData.filepath;
          delete videoData.qualities;
        }

        return {
          ...videoData,
          channelImage,
          qualities: isPremium ? [] : item.qualities || []
        };
      })
    );

    return res.status(200).json(videosWithChannelImages);
  } catch (error) {
    console.error("Get all videos error:", error);

    return res.status(500).json({
      message: "Unable to retrieve videos"
    });
  }
};

export const getVideoPlayback = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }

    const selectedVideo = await video.findById(videoId);

    if (!selectedVideo) {
      return res.status(404).json({ message: "Video not found" });
    }

    let currentPlan = "Free";
    const subscription = await Subscription.findOne({ userId: req.user.id });

    if (
      subscription &&
      subscription.status === "active" &&
      subscription.endDate &&
      subscription.endDate > new Date()
    ) {
      currentPlan = subscription.plan || "Free";
    }

    const requiredPlan = selectedVideo.accessLevel || "Free";

    if ((planHierarchy[currentPlan] ?? 0) < (planHierarchy[requiredPlan] ?? 0)) {
      return res.status(403).json({
        message: "Upgrade your subscription to watch this video",
        requiredPlan,
        currentPlan
      });
    }

    const qualityLimits = {
      Free: 480,
      Bronze: 720,
      Silver: 1080,
      Gold: 1080
    };

    const maxQuality = qualityLimits[currentPlan];
    const allowedQualities = (selectedVideo.qualities || [])
      .filter((item) => Number.parseInt(item.label, 10) <= maxQuality)
      .sort((a, b) => Number.parseInt(a.label, 10) - Number.parseInt(b.label, 10));

    const originalAllowed = currentPlan === "Gold";
    const defaultQuality = originalAllowed
      ? "Original"
      : allowedQualities[allowedQualities.length - 1]?.label;

    const defaultVariant = allowedQualities[allowedQualities.length - 1];

    if (!originalAllowed && !defaultVariant) {
      return res.status(409).json({
        message: "Video quality versions are unavailable. Please re-upload this video."
      });
    }

    return res.status(200).json({
      videoId: selectedVideo._id,
      filepath: originalAllowed ? selectedVideo.filepath : defaultVariant.filepath,
      qualities: allowedQualities,
      originalAllowed,
      defaultQuality,
      maxQuality: originalAllowed ? "Original" : `${maxQuality}p`,
      accessLevel: requiredPlan,
      currentPlan
    });
  } catch (error) {
    console.error("Video playback error:", error);

    return res.status(500).json({
      message: "Unable to authorize video playback"
    });
  }
};


const getIndiaDayKey = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
};

const getNextIndiaMidnight = (dayKey) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextKey = nextDay.toISOString().slice(0, 10);
  return new Date(`${nextKey}T00:00:00+05:30`);
};

const watchTimeLimits = {
  Free: 60 * 60,
  Bronze: 120 * 60,
  Silver: 180 * 60,
  Gold: null
};

export const recordWatchTime = async (req, res) => {
  try {
    const userId = req.user.id;
    const { videoId, sessionId, playing } = req.body;

    if (!mongoose.isValidObjectId(videoId) || typeof sessionId !== "string" || !sessionId || typeof playing !== "boolean") {
      return res.status(400).json({ message: "Invalid watch-time heartbeat data" });
    }

    const selectedVideo = await video.findById(videoId).select("_id");
    if (!selectedVideo) {
      return res.status(404).json({ message: "Video not found" });
    }

    const subscription = await Subscription.findOne({ userId });
    let currentPlan = "Free";

    if (
      subscription &&
      subscription.status === "active" &&
      subscription.endDate &&
      subscription.endDate > new Date()
    ) {
      currentPlan = subscription.plan || "Free";
    }

    const dailyLimitSeconds = watchTimeLimits[currentPlan];
    const dayKey = getIndiaDayKey();
    let usage = await WatchTime.findOne({ userId, dayKey });

    if (!usage) {
      try {
        usage = await WatchTime.create({
          userId,
          dayKey,
          watchedSeconds: 0,
          activeSessionId: null,
          lastHeartbeatAt: null
        });
      } catch (error) {
        if (error.code !== 11000) throw error;
        usage = await WatchTime.findOne({ userId, dayKey });
      }
    }

    const now = new Date();
    let addedSeconds = 0;

    if (usage.activeSessionId === sessionId && usage.lastHeartbeatAt) {
      addedSeconds = Math.max(
        0,
        Math.min(20, Math.floor((now.getTime() - usage.lastHeartbeatAt.getTime()) / 1000))
      );
    }

    const remainingBeforeUpdate = dailyLimitSeconds === null
      ? null
      : Math.max(0, dailyLimitSeconds - usage.watchedSeconds);

    if (remainingBeforeUpdate !== null) {
      addedSeconds = Math.min(addedSeconds, remainingBeforeUpdate);
    }

    usage.watchedSeconds += addedSeconds;

    if (playing) {
      usage.activeSessionId = sessionId;
      usage.lastHeartbeatAt = now;
    } else if (usage.activeSessionId === sessionId) {
      usage.activeSessionId = null;
      usage.lastHeartbeatAt = null;
    }

    await usage.save();

    const remainingSeconds = dailyLimitSeconds === null
      ? null
      : Math.max(0, dailyLimitSeconds - usage.watchedSeconds);

    const limitReached = dailyLimitSeconds !== null && remainingSeconds <= 0;

    return res.status(200).json({
      plan: currentPlan,
      watchedSeconds: usage.watchedSeconds,
      dailyLimitSeconds,
      remainingSeconds,
      limitReached,
      resetAt: getNextIndiaMidnight(dayKey).toISOString()
    });
  } catch (error) {
    console.error("Watch-time tracking error:", error);
    return res.status(500).json({ message: "Unable to track watch time" });
  }
};

