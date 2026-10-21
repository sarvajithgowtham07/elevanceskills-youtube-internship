import mongoose from "mongoose";

const downloadSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true,
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "video",
        required: true,
        index: true,
    },
    downloadedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    ipAddress: {
        type: String,
        default: "",
    },
    userAgent: {
        type: String,
        default: "",
    },
    subscriptionPlan: {
        type: String,
        enum: ["Free", "Bronze", "Silver", "Gold"],
        required: true,
    },
    status: {
        type: String,
        enum: ["pending", "completed", "failed"],
        default: "pending",
    },
    fileSize: {
        type: Number,
        default: 0,
    },
    quotaDate: {
        type: String,
        required: true,
        index: true,
    },
    countsTowardQuota: {
        type: Boolean,
        default: true,
        required: true,
    },
}, { timestamps: true });

downloadSchema.index({ userId: 1, videoId: 1, downloadedAt: -1 });

export default mongoose.model("Download", downloadSchema);