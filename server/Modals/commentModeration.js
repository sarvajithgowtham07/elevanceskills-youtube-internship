import mongoose from "mongoose";

const commentModerationSchema = new mongoose.Schema(
  {
    commentid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      required: true,
    },
    action: {
      type: String,
      enum: [
        "REPORTED",
        "FLAGGED",
        "HIDDEN",
        "RESTORED",
        "DELETED",
        "REVIEWED",
      ],
      required: true,
    },
    reason: {
      type: String,
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    details: {
      type: String,
      default: "",
    },
    performedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "commentModeration",
  commentModerationSchema
);