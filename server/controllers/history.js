import video from "../Modals/video.js";
import history from "../Modals/history.js";

const configuredThreshold = Number(process.env.VIDEO_COMPLETION_THRESHOLD ?? 95);

const completionThreshold =
  Number.isFinite(configuredThreshold) &&
  configuredThreshold >= 0 &&
  configuredThreshold <= 100
    ? configuredThreshold
    : 95;

export const handlehistory = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;

  try {
    await history.findOneAndUpdate(
      { viewer: userId, videoid: videoId },
      { $set: { lastWatchedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });

    return res.status(200).json({ history: true });
  } catch (error) {
    console.error("error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const handleview = async (req, res) => {
  const { videoId } = req.params;

  try {
    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ view: true });
  } catch (error) {
    console.error("error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const saveProgress = async (req, res) => {
  const { userId, currentTime, duration } = req.body;
  const { videoId } = req.params;

  try {
    if (!userId || !videoId || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
      return res.status(400).json({ message: "Invalid progress data" });
    }

    const safeCurrentTime = Math.max(0, Math.min(currentTime, duration));
    const completionPercentage = Math.min(100, Math.round((safeCurrentTime / duration) * 100));
    const completed = completionPercentage >= completionThreshold;

    const progress = await history.findOneAndUpdate(
      { viewer: userId, videoid: videoId },
      {
        $set: {
          currentTime: safeCurrentTime,
          duration,
          completionPercentage,
          completed,
          lastWatchedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, progress });
  } catch (error) {
    console.error("error:", error);
    return res.status(500).json({ message: "Unable to save progress" });
  }
};

export const getProgress = async (req, res) => {
  const { userId, videoId } = req.params;

  try {
    const progress = await history.findOne({
      viewer: userId,
      videoid: videoId,
    });

    return res.status(200).json({
      success: true,
      progress: progress || null,
    });
  } catch (error) {
    console.error("error:", error);
    return res.status(500).json({ message: "Unable to fetch progress" });
  }
};

export const getallhistoryVideo = async (req, res) => {
  const { userId } = req.params;

  try {
    const historyvideo = await history
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .exec();

    return res.status(200).json(historyvideo);
  } catch (error) {
    console.error("error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};