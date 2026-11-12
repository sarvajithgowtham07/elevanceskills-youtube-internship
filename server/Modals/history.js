import mongoose from "mongoose";

const historyschema = mongoose.Schema(
  {
    viewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    likedon: {
      type: Date,
      default: Date.now,
    },
    currentTime: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    completionPercentage: {
      type: Number,
      default: 0,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    lastWatchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

historyschema.index({ viewer: 1, videoid: 1 }, { unique: true });

export default mongoose.model("history", historyschema);
