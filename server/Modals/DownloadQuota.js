import mongoose from "mongoose";

const downloadQuotaSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  period: {
    type: String,
    enum: ["daily", "monthly"],
    required: true,
  },
  periodKey: {
    type: String,
    required: true,
  },
  plan: {
    type: String,
    enum: ["Free", "Bronze", "Silver", "Gold"],
    required: true,
  },
  used: {
    type: Number,
    default: 0,
    min: 0,
    required: true,
  },
}, { timestamps: true });

downloadQuotaSchema.index(
  { userId: 1, period: 1, periodKey: 1 },
  { unique: true }
);

export default mongoose.model("DownloadQuota", downloadQuotaSchema);