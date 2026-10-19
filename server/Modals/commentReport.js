import mongoose from "mongoose";

const commentReportSchema = new mongoose.Schema(
  {
    commentid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      required: true,
    },
    reporterid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    reason: {
      type: String,
      enum: ["SPAM", "HARASSMENT", "OFFENSIVE_CONTENT"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED", "RESOLVED", "REJECTED"],
      default: "PENDING",
    },
    reportedon: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

commentReportSchema.index(
  { commentid: 1, reporterid: 1 },
  { unique: true }
);

export default mongoose.model("commentReport", commentReportSchema);