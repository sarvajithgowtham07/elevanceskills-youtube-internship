import mongoose from "mongoose";

const commentRateLimitSchema = new mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      unique: true,
    },
    timestamps: {
      type: [Date],
      default: [],
    },
    blockedUntil: {
      type: Date,
      default: null,
    },
    captchaRequired: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  "commentRateLimit",
  commentRateLimitSchema
);