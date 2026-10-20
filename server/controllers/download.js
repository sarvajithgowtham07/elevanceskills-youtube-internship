import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import video from "../Modals/video.js";
import Subscription from "../Modals/Subscription.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "../uploads");

export const downloadVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const subscription = await Subscription.findOne({
      userId: req.user.id,
      status: "active",
    });

    if (!subscription) {
      return res.status(403).json({
        message: "An active subscription is required to download videos",
      });
    }

    if (!["Basic", "Premium"].includes(subscription.plan)) {
      return res.status(403).json({
        message: "Upgrade to Basic or Premium to download videos",
      });
    }

    if (
      subscription.endDate &&
      subscription.endDate < new Date()
    ) {
      return res.status(403).json({
        message: "Your subscription has expired",
      });
    }

    const videoFile = await video.findById(videoId);

    if (!videoFile) {
      return res.status(404).json({ message: "Video not found" });
    }

    const filePath = path.resolve(uploadsDir, path.basename(videoFile.filepath));

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Video file not found" });
    }

    return res.download(filePath, videoFile.filename);
  } catch (error) {
    console.error("Download video error:", error);
    return res.status(500).json({ message: "Unable to download video" });
  }
};