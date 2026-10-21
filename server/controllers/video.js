
import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(serverDir, "uploads");
const thumbnailsDir = path.join(serverDir, "thumbnails");

ffmpeg.setFfmpegPath("C:/ffmpeg-8.1.2-essentials_build/bin/ffmpeg.exe");

const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
  };
  return types[ext] || "application/octet-stream";
};

const generateThumbnail = async (filePath, thumbnailName) => {
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  const thumbnailPath = path.join(thumbnailsDir, thumbnailName);

  if (fs.existsSync(thumbnailPath)) {
    return `/thumbnails/${thumbnailName}`;
  }

  await new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .screenshots({
        timestamps: ["00:00:01"],
        filename: thumbnailName,
        folder: thumbnailsDir,
        size: "320x180",
      })
      .on("end", resolve)
      .on("error", reject);
  });

  return `/thumbnails/${thumbnailName}`;
};

export const uploadvideo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "Please upload a video file",
    });
  }

  try {
    const thumbnailName = `${path.parse(req.file.filename).name}.jpg`;
    let thumbnail = "";

    try {
      thumbnail = await generateThumbnail(
        path.resolve(req.file.path),
        thumbnailName
      );
    } catch (error) {
      console.error("Thumbnail generation error:", error.message);
    }

    const file = new video({
      videotitle:
        req.body.videotitle || path.parse(req.file.originalname).name,
      filename: req.file.originalname,
      filepath: req.file.path,
      thumbnail,
      filetype: req.file.mimetype,
      filesize: String(req.file.size),
      videochanel: req.body.videochanel || "Local Videos",
      uploader: req.body.uploader || "Local Uploads",
    });

    await file.save();

    return res.status(201).json({
      message: "Video uploaded successfully",
      thumbnail,
    });
  } catch (error) {
    console.error("Video upload error:", error);
    return res.status(500).json({
      message: "Unable to save video details",
    });
  }
};

export const getallvideo = async (req, res) => {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(thumbnailsDir, { recursive: true });

    const files = fs.readdirSync(uploadsDir, { withFileTypes: true });
    const supportedExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv"];

    for (const entry of files) {
      if (!entry.isFile()) continue;

      const filename = entry.name;
      const ext = path.extname(filename).toLowerCase();

      if (!supportedExtensions.includes(ext)) continue;

      const filePath = path.join(uploadsDir, filename);
      const relativePath = path.relative(serverDir, filePath).replace(/\\/g, "/");

      const existing = await video.findOne({
        $or: [{ filepath: relativePath }, { filename }],
      });

      if (existing) {
        if (!existing.thumbnail) {
          const thumbnailName = `${path.parse(filename).name}.jpg`;

          try {
            existing.thumbnail = await generateThumbnail(
              filePath,
              thumbnailName
            );
            await existing.save();
          } catch (error) {
            console.error(
              `Thumbnail generation failed for ${filename}:`,
              error.message
            );
          }
        }
        continue;
      }

      const stats = fs.statSync(filePath);
      const thumbnailName = `${path.parse(filename).name}.jpg`;
      let thumbnail = "";

      try {
        thumbnail = await generateThumbnail(filePath, thumbnailName);
      } catch (error) {
        console.error(
          `Thumbnail generation failed for ${filename}:`,
          error.message
        );
      }

      const title = path.parse(filename).name;
      const channelMatch = title.match(/\s+by\s+(.+)$/i);
      const channelName = channelMatch?.[1]?.trim() || "Unknown Channel";

      await video.create({
        videotitle: title,
        filename,
        filepath: relativePath,
        thumbnail,
        filetype: getMimeType(filename),
        filesize: String(stats.size),
        videochanel: channelName,
        uploader: "Local Uploads",
      });

      console.log(`Registered existing video: ${filename}`);
    }

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

        return {
          ...item.toObject(),
          channelImage,
        };
      })
    );

    return res.status(200).json(videosWithChannelImages);
  } catch (error) {
    console.error("Get all videos error:", error);
    return res.status(500).json({
      message: "Unable to retrieve videos",
    });
  }
};
