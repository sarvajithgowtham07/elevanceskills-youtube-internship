
import path from "path";
import mongoose from "mongoose";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import video from "../Modals/video.js";
import Subscription from "../Modals/Subscription.js";
import Download from "../Modals/Download.js";
import DownloadQuota from "../Modals/DownloadQuota.js";
import downloadLimits from "../utils/downloadLimits.js";

const getPeriodKeys = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    daily: `${values.year}-${values.month}-${values.day}`,
    monthly: `${values.year}-${values.month}`,
  };
};

const reserveQuota = async ({ userId, plan, period, periodKey, limit }) => {
  const filter = { userId, period, periodKey };
  const existing = await DownloadQuota.findOne(filter);

  if (existing) {
    if (existing.used >= limit) return null;

    return DownloadQuota.findOneAndUpdate(
      { ...filter, used: { $lt: limit } },
      { $inc: { used: 1 }, $set: { plan } },
      { new: true }
    );
  }

  try {
    return await DownloadQuota.create({
      ...filter,
      plan,
      used: 1,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;

    return DownloadQuota.findOneAndUpdate(
      { ...filter, used: { $lt: limit } },
      { $inc: { used: 1 }, $set: { plan } },
      { new: true }
    );
  }
};

const planHierarchy = {
  Free: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3,
};

const releaseQuota = async (quotaId) => {
  if (!quotaId) return;

  await DownloadQuota.findOneAndUpdate(
    { _id: quotaId, used: { $gt: 0 } },
    { $inc: { used: -1 } }
  );
};

export const downloadVideo = async (req, res) => {
  let downloadRecord;
  let dailyQuota;
  let monthlyQuota;

  try {
    const { videoId } = req.params;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({ message: "Invalid video ID" });
    }

    const subscription = await Subscription.findOne({ userId });
    const now = new Date();
    let plan = "Free";

    if (subscription?.status === "active") {
      if (subscription.endDate && subscription.endDate <= now) {
        subscription.status = "expired";
        await subscription.save();
      } else {
        plan = subscription.plan || "Free";
      }
    }

    const limits = downloadLimits[plan];

    if (!limits) {
      return res.status(403).json({ message: "Invalid subscription plan" });
    }

    const videoFile = await video.findById(videoId);

    if (!videoFile) {
      return res.status(404).json({ message: "Video not found" });
    }

    if (!videoFile.filepath) {
      return res.status(404).json({ message: "Video file not found" });
    }

    const requiredPlan = videoFile.accessLevel || "Free";
    if ((planHierarchy[plan] ?? 0) < (planHierarchy[requiredPlan] ?? 0)) {
      return res.status(403).json({
        message: `This video requires the ${requiredPlan} plan or higher.`,
      });
    }

    let videoUrl;

    try {
      videoUrl = new URL(videoFile.filepath);
    } catch {
      return res.status(400).json({
        message: "Invalid video storage URL",
      });
    }

    if (
      videoUrl.protocol !== "https:" ||
      videoUrl.hostname !== "res.cloudinary.com"
    ) {
      return res.status(400).json({
        message: "Video is not stored in Cloudinary",
      });
    }

    const keys = getPeriodKeys(now);
    const duplicateSince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const duplicate = await Download.findOne({
      userId,
      videoId,
      status: { $in: ["pending", "completed"] },
      downloadedAt: { $gte: duplicateSince },
      countsTowardQuota: true,
    });

    if (duplicate) {
      return res.status(409).json({
        message: "You have already downloaded this video within the last 24 hours.",
      });
    }

    dailyQuota = await reserveQuota({
      userId,
      plan,
      period: "daily",
      periodKey: keys.daily,
      limit: limits.daily,
    });

    if (!dailyQuota) {
      return res.status(429).json({
        message: "Your daily download limit has been reached",
        dailyLimit: limits.daily,
        dailyRemaining: 0,
      });
    }

    monthlyQuota = await reserveQuota({
      userId,
      plan,
      period: "monthly",
      periodKey: keys.monthly,
      limit: limits.monthly,
    });

    if (!monthlyQuota) {
      await releaseQuota(dailyQuota._id);
      dailyQuota = null;

      return res.status(429).json({
        message: "Your monthly download limit has been reached",
        monthlyLimit: limits.monthly,
        monthlyRemaining: 0,
      });
    }

    const fileSize = Number(videoFile.filesize) || 0;

    downloadRecord = await Download.create({
      userId,
      videoId,
      downloadedAt: now,
      quotaDate: keys.daily,
      countsTowardQuota: true,
      ipAddress: req.ip || "",
      userAgent: req.get("user-agent") || "",
      subscriptionPlan: plan,
      status: "pending",
      fileSize,
    });

    const response = await fetch(videoUrl);

    if (!response.ok || !response.body) {
      throw new Error(`Cloudinary download failed: ${response.status}`);
    }

    const filename = path
      .basename(videoFile.filename || "video.mp4")
      .replace(/[\r\n"]/g, "_");

    res.setHeader("Content-Type", response.headers.get("content-type") || "video/mp4");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );

    const contentLength = response.headers.get("content-length");

    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    await pipeline(Readable.fromWeb(response.body), res);

    await Download.findByIdAndUpdate(downloadRecord._id, {
      status: "completed",
      ...(contentLength ? { fileSize: Number(contentLength) } : {}),
    });

  } catch (error) {
    console.error("Download video error:", error);

    if (downloadRecord) {
      await Download.findByIdAndUpdate(downloadRecord._id, {
        status: "failed",
      }).catch(() => {});
    }

    if (dailyQuota) {
      await releaseQuota(dailyQuota._id).catch(() => {});
    }

    if (monthlyQuota) {
      await releaseQuota(monthlyQuota._id).catch(() => {});
    }

    if (!res.headersSent && !res.destroyed) {
      return res.status(500).json({
        message: "Unable to download this video",
      });
    }
  }
};
