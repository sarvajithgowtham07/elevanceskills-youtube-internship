import mongoose from "mongoose";

const watchTimeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Auth",
    required: true
  },
  dayKey: {
    type: String,
    required: true
  },
  watchedSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  activeSessionId: {
    type: String,
    default: null
  },
  lastHeartbeatAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

watchTimeSchema.index({ userId: 1, dayKey: 1 }, { unique: true });

export default mongoose.models.WatchTime || mongoose.model("WatchTime", watchTimeSchema);
