
import Download from "../Modals/Download.js";
import DownloadQuota from "../Modals/DownloadQuota.js";
import downloadLimits from "../utils/downloadLimits.js";
import video from "../Modals/video.js";
import Subscription from "../Modals/Subscription.js";

export const getDownloadHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const dateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
    const dailyKey = `${dateValues.year}-${dateValues.month}-${dateValues.day}`;
    const monthlyKey = `${dateValues.year}-${dateValues.month}`;

    const [downloads, subscription] = await Promise.all([
      Download.find({ userId })
        .populate({
          path: "videoId",
          model: video,
          select: "videotitle filename filepath thumbnail",
        })
        .sort({ downloadedAt: -1 })
        .limit(100),
      Subscription.findOne({ userId }),
    ]);

    let plan = "Free";
    if (subscription?.status === "active") {
      if (subscription.endDate && subscription.endDate <= now) {
        subscription.status = "expired";
        await subscription.save();
      } else {
        plan = subscription.plan || "Free";
      }
    }
    const limits = downloadLimits[plan] || downloadLimits.Free;

    const [dailyQuota, monthlyQuota] = await Promise.all([
      DownloadQuota.findOne({
        userId,
        period: "daily",
        periodKey: dailyKey,
      }),
      DownloadQuota.findOne({
        userId,
        period: "monthly",
        periodKey: monthlyKey,
      }),
    ]);

    const dailyUsed = dailyQuota?.used || 0;
    const monthlyUsed = monthlyQuota?.used || 0;

    return res.status(200).json({
      downloads,
      quota: {
        plan,
        dailyLimit: limits.daily,
        dailyUsed,
        dailyRemaining: Math.max(0, limits.daily - dailyUsed),
        monthlyLimit: limits.monthly,
        monthlyUsed,
        monthlyRemaining: Math.max(0, limits.monthly - monthlyUsed),
      },
    });
  } catch (error) {
    console.error("Get download history error:", error);
    return res.status(500).json({
      message: "Unable to retrieve download history",
    });
  }
};
