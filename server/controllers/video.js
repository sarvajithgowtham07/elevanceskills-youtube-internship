
import mongoose from "mongoose";
import users from "../Modals/Auth.js";
import video from "../Modals/video.js";
import path from "path";
import cloudinary from "../utils/cloudinary.js";

const uploadToCloudinary = (buffer, publicId) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        public_id: publicId,
        folder: "videos",
        overwrite: false,
        format: "mp4",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
};

const generateQualities = (publicId) => {
  const resolutions = [
    { label: "360p", width: 640, height: 360 },
    { label: "480p", width: 854, height: 480 },
    { label: "720p", width: 1280, height: 720 },
    { label: "1080p", width: 1920, height: 1080 },
  ];

  return resolutions.map(({ label, width, height }) => ({
    label,
    filepath: `https://res.cloudinary.com/tkqw8ckt/video/upload/w_${width},h_${height},c_limit,q_auto:good,f_mp4/${publicId}.mp4`,
  }));
};

export const uploadvideo = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "Please upload a video file",
    });
  }

  let uploadedAsset;

  try {
    const originalName = req.file.originalname;
    const title = req.body.videotitle || path.parse(originalName).name;
    const publicId = `${Date.now()}-${path.parse(originalName).name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    uploadedAsset = await uploadToCloudinary(req.file.buffer, publicId);

    const thumbnail = cloudinary.url(uploadedAsset.public_id, {
      resource_type: "video",
      format: "jpg",
      transformation: [
        { so: 1 },
        { width: 320, height: 180, crop: "fill" },
      ],
      secure: true,
    });

    const file = new video({
      videotitle: title,
      filename: originalName,
      filepath: uploadedAsset.secure_url,
      publicId: uploadedAsset.public_id,
      thumbnail,
      filetype: "video/mp4",
      filesize: String(uploadedAsset.bytes),
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

    if (uploadedAsset?.public_id) {
      try {
        await cloudinary.uploader.destroy(uploadedAsset.public_id, {
          resource_type: "video",
        });
      } catch (cleanupError) {
        console.error("Cloudinary cleanup error:", cleanupError.message);
      }
    }

    return res.status(500).json({
      message: "Unable to upload video",
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

        return {
          ...item.toObject(),
          channelImage,
          qualities: item.publicId
            ? generateQualities(item.publicId)
            : [],
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
