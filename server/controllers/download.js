
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import video from "../Modals/video.js";
import Subscription from "../Modals/Subscription.js";
import Download from "../Modals/Download.js";
import DownloadQuota from "../Modals/DownloadQuota.js";
import downloadLimits from "../utils/downloadLimits.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../uploads");

const getPeriodKeys = (date) => ({
    daily: date.toISOString().slice(0, 10),
    monthly: date.toISOString().slice(0, 7),
});



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
    let responseFinished = false;

    try {
        const { videoId } = req.params;
        const userId = req.user.id;

        if (!mongoose.isValidObjectId(videoId)) {
            return res.status(400).json({ message: "Invalid video ID" });
        }

        const subscription = await Subscription.findOne({
            userId,
            status: "active",
        });

        if (!subscription) {
            return res.status(403).json({
                message: "An active subscription is required",
            });
        }

        if (subscription.endDate && subscription.endDate <= new Date()) {
            subscription.status = "expired";
            await subscription.save();

            return res.status(403).json({
                message: "Your subscription has expired",
            });
        }

        const plan = subscription.plan;
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

        const filePath = path.resolve(
            uploadsDir,
            path.basename(videoFile.filepath)
        );

        if (
            !filePath.startsWith(uploadsDir + path.sep) ||
            !fs.existsSync(filePath)
        ) {
            return res.status(404).json({ message: "Video file not found" });
        }

        const now = new Date();
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
            fileSize: fs.statSync(filePath).size,
        });

        const reservedDailyId = dailyQuota._id;
        const reservedMonthlyId = monthlyQuota._id;

        res.download(
            filePath,
            videoFile.filename || path.basename(filePath),
            async (error) => {
                if (responseFinished) return;
                responseFinished = true;

                try {
                    if (error) {
                        await Download.findByIdAndUpdate(downloadRecord._id, {
                            status: "failed",
                        });

                        await releaseQuota(reservedDailyId);
                        await releaseQuota(reservedMonthlyId);

                        if (!res.headersSent && !res.destroyed) {
                            return res.status(500).json({
                                message: "Unable to complete the download",
                            });
                        }

                        return;
                    }

                    await Download.findByIdAndUpdate(downloadRecord._id, {
                        status: "completed",
                    });
                } catch (updateError) {
                    console.error("Download status update error:", updateError);
                }
            }
        );
    } catch (error) {
        console.error("Download video error:", error);

        if (downloadRecord) {
            await Download.findByIdAndUpdate(downloadRecord._id, {
                status: "failed",
            }).catch(() => { });
        }

        if (dailyQuota) await releaseQuota(dailyQuota._id).catch(() => { });
        if (monthlyQuota) await releaseQuota(monthlyQuota._id).catch(() => { });

        if (!res.headersSent && !res.destroyed) {
            return res.status(500).json({
                message: "Unable to download this video",
            });
        }
    }
};
