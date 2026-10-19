import mongoose from "mongoose";

const loginActivitySchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
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
    enum: ["Desktop", "Mobile", "Tablet", "Unknown"],
    default: "Unknown",
  },
  deviceModel: {
    type: String,
    default: "Unknown",
  },
  city: {
    type: String,
    default: "Unknown",
  },
  state: {
    type: String,
    default: "Unknown",
  },
  country: {
    type: String,
    default: "Unknown",
  },
  latitude: {
    type: Number,
    default: null,
  },
  longitude: {
    type: Number,
    default: null,
  },
  loginTime: {
    type: Date,
    default: Date.now,
  },
  loginStatus: {
    type: String,
    enum: ["SUCCESS", "FAILED", "OTP_REQUIRED", "OTP_VERIFIED"],
    default: "SUCCESS",
  },
  otpAttempts: {
    type: Number,
    default: 0,
  },
  otpVerified: {
    type: Boolean,
    default: false,
  },
  isTrusted: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.model("LoginActivity", loginActivitySchema);