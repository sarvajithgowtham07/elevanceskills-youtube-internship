import mongoose from "mongoose";

const trustedDeviceSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  deviceId: {
    type: String,
    required: true,
    unique: true,
  },
  ipAddress: {
    type: String,
    default: "Unknown",
  },
  browser: {
    type: String,
    default: "Unknown",
  },
  browserVersion: {
    type: String,
    default: "Unknown",
  },
  operatingSystem: {
    type: String,
    default: "Unknown",
  },
  deviceType: {
    type: String,
    default: "Unknown",
  },
  deviceModel: {
    type: String,
    default: "Unknown",
  },
  trustedAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

export default mongoose.model("TrustedDevice", trustedDeviceSchema);