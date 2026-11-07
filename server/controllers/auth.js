import mongoose from "mongoose";
import crypto from "crypto";
import users from "../Modals/Auth.js";
import LoginActivity from "../Modals/LoginActivity.js";
import OTP from "../Modals/OTP.js";
import TrustedDevice from "../Modals/TrustedDevice.js";
import { sendOTPEmail } from "../utils/sendEmail.js";
import { generateOTP, hashOTP } from "../utils/otp.js";
import jwt from "jsonwebtoken";
import admin from "../utils/firebaseAdmin.js";
import geoip from "geoip-lite";

const generateAuthToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { sub: user._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const getDefaultTheme = () => {
  const now = new Date();

  const istTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).format(now);

  const [hour, minute] = istTime.split(":").map(Number);
  const totalMinutes = hour * 60 + minute;

  if (totalMinutes >= 300 && totalMinutes < 720) {
    return "light";
  }

  return "dark";
};

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return (
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    req.ip ||
    "Unknown"
  );
};

const getDeviceInfo = (userAgent = "", browserName = "") => {
  let browser = "Unknown";
  let browserVersion = "Unknown";
  let operatingSystem = "Unknown";
  let deviceType = "Desktop";
  let deviceModel = "Unknown";

  if (/Edg\/([\d.]+)/i.test(userAgent)) {
    browser = "Edge";
    browserVersion = userAgent.match(/Edg\/([\d.]+)/i)?.[1] || "Unknown";
  } else if (/OPR\/([\d.]+)/i.test(userAgent)) {
    browser = "Opera";
    browserVersion = userAgent.match(/OPR\/([\d.]+)/i)?.[1] || "Unknown";
  } else if (/Firefox\/([\d.]+)/i.test(userAgent)) {
    browser = "Firefox";
    browserVersion = userAgent.match(/Firefox\/([\d.]+)/i)?.[1] || "Unknown";
  } else if (/Chrome\/([\d.]+)/i.test(userAgent)) {
    browser = "Chrome";
    browserVersion = userAgent.match(/Chrome\/([\d.]+)/i)?.[1] || "Unknown";
  } else if (/Version\/([\d.]+).*Safari/i.test(userAgent)) {
    browser = "Safari";
    browserVersion = userAgent.match(/Version\/([\d.]+)/i)?.[1] || "Unknown";
  }

  if (browserName === "Brave" && browser === "Chrome") {
    browser = "Brave";
  } else if (browserName && browserName !== "Unknown" && browser === "Unknown") {
    browser = browserName;
  }

  if (/Android/i.test(userAgent)) {
    operatingSystem = "Android";
  } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
    operatingSystem = "iOS";
  } else if (/Windows/i.test(userAgent)) {
    operatingSystem = "Windows";
  } else if (/Mac OS X/i.test(userAgent)) {
    operatingSystem = "macOS";
  } else if (/Linux/i.test(userAgent)) {
    operatingSystem = "Linux";
  }

  if (/iPad|Tablet/i.test(userAgent)) {
    deviceType = "Tablet";
  } else if (/Mobile|Android.*Mobile|iPhone|iPod/i.test(userAgent)) {
    deviceType = "Mobile";
  }

  const androidModel = userAgent.match(
    /Android[^;)]*;\s*(?:[a-z]{2}-[a-z]{2};\s*)?([^;)]+)\sBuild\//i
  );

  if (androidModel?.[1]) {
    deviceModel = androidModel[1].trim();
  } else if (/iPhone/i.test(userAgent)) {
    deviceModel = "iPhone";
  } else if (/iPad/i.test(userAgent)) {
    deviceModel = "iPad";
  }

  return {
    browser,
    browserVersion,
    operatingSystem,
    deviceType,
    deviceModel,
  };
};

const getLocationFromIp = async (ipAddress) => {
  const unknownLocation = {
    city: "Unknown",
    state: "Unknown",
    country: "Unknown",
    latitude: null,
    longitude: null,
  };

  if (!ipAddress || ipAddress === "Unknown") {
    return unknownLocation;
  }

  const normalizedIp = ipAddress.replace(/^::ffff:/, "");

  const data = geoip.lookup(normalizedIp);

  if (!data) {
    return unknownLocation;
  }

  let country = data.country || "Unknown";

  try {
    country = new Intl.DisplayNames(["en"], { type: "region" }).of(data.country) || country;
  } catch (error) {
    country = data.country || "Unknown";
  }

  return {
    city: data.city || "Unknown",
    state: data.region || "Unknown",
    country,
    latitude: Array.isArray(data.ll) ? data.ll[0] : null,
    longitude: Array.isArray(data.ll) ? data.ll[1] : null,
  };
};

const sanitizeClientLocation = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const clean = (text) =>
    typeof text === "string" && text.trim() ? text.trim().slice(0, 80) : null;

  const city = clean(value.city);
  const state = clean(value.state);
  const country = clean(value.country);

  if (!city || !state || !country) {
    return null;
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);

  return {
    city,
    state,
    country,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
};

const createDeviceId = (userId, deviceInfo, ipAddress) => {
  return crypto
    .createHash("sha256")
    .update(
      `${userId}-${deviceInfo.browser}-${deviceInfo.browserVersion}-${deviceInfo.operatingSystem}-${deviceInfo.deviceType}-${deviceInfo.deviceModel}-${ipAddress}`
    )
    .digest("hex");
};

const sendOTPForLogin = async (user, loginInfo) => {
  const otp = generateOTP();
  const otpHash = hashOTP(otp);

  await OTP.deleteMany({
    userId: user._id,
    purpose: "LOGIN_VERIFICATION",
    verified: false,
  });

  const loginActivity = await LoginActivity.create({
    userId: user._id,
    ipAddress: loginInfo.ipAddress,
    browser: loginInfo.deviceInfo.browser,
    browserVersion: loginInfo.deviceInfo.browserVersion,
    operatingSystem: loginInfo.deviceInfo.operatingSystem,
    deviceType: loginInfo.deviceInfo.deviceType,
    deviceModel: loginInfo.deviceInfo.deviceModel,
    city: loginInfo.location.city,
    state: loginInfo.location.state,
    country: loginInfo.location.country,
    latitude: loginInfo.location.latitude,
    longitude: loginInfo.location.longitude,
    loginStatus: "OTP_REQUIRED",
    otpVerified: false,
    isTrusted: false,
  });

  await OTP.create({
    userId: user._id,
    loginActivityId: loginActivity._id,
    email: user.email,
    otpHash,
    purpose: "LOGIN_VERIFICATION",
    attempts: 0,
    verified: false,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  await sendOTPEmail(user.email, otp);

  return {
    loginActivityId: loginActivity._id,
  };
};


export const login = async (req, res) => {
  const { firebaseToken, browserName, clientLocation } = req.body;

  try {
    if (!firebaseToken) {
      return res.status(401).json({ message: "Firebase token required" });
    }

    let decodedToken;

    try {
      decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    } catch {
      return res.status(401).json({ message: "Invalid Firebase token" });
    }

    if (decodedToken.aud !== process.env.FIREBASE_PROJECT_ID) {
      return res.status(401).json({ message: "Invalid Firebase project" });
    }

    const email = decodedToken.email;
    const name = decodedToken.name || email?.split("@")[0];
    const image = decodedToken.picture || "https://github.com/shadcn.png";

    if (!email || decodedToken.email_verified !== true) {
      return res.status(401).json({ message: "Verified Google account required" });
    }

    const existingUser = await users.findOne({ email });

    let user;

    if (!existingUser) {
      user = await users.create({
        email,
        name,
        image,
        themeMode: "auto",
        themePreference: getDefaultTheme(),
      });
    } else {
      user = existingUser;

      if (!user.themeMode) {
        user.themeMode = "auto";
      }

      if (user.themeMode === "auto") {
        user.themePreference = getDefaultTheme();
      } else {
        user.themePreference = user.themeMode;
      }

      if (image && user.image !== image) {
        user.image = image;
      }

      await user.save();
    }

    const userAgent = req.headers["user-agent"] || "";
    const deviceInfo = getDeviceInfo(userAgent, browserName);
    const ipAddress = getClientIp(req);
    const location =
      sanitizeClientLocation(clientLocation) || (await getLocationFromIp(ipAddress));
    const deviceId = createDeviceId(user._id, deviceInfo, ipAddress);

    const trustedDevice = await TrustedDevice.findOne({
      userId: user._id,
      deviceId,
      expiresAt: { $gt: new Date() },
    });

    if (trustedDevice) {
      await LoginActivity.create({
        userId: user._id,
        ipAddress,
        browser: deviceInfo.browser,
        browserVersion: deviceInfo.browserVersion,
        operatingSystem: deviceInfo.operatingSystem,
        deviceType: deviceInfo.deviceType,
        deviceModel: deviceInfo.deviceModel,
        city: location.city,
        state: location.state,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        loginStatus: "SUCCESS",
        otpVerified: true,
        isTrusted: true,
      });

      return res.status(existingUser ? 200 : 201).json({
        result: user,
        token: generateAuthToken(user),
        requiresOTP: false,
      });
    }

    const otpResult = await sendOTPForLogin(user, {
      ipAddress,
      deviceInfo,
      location,
    });

    return res.status(200).json({
      requiresOTP: true,
      userId: user._id,
      email: user.email,
      loginActivityId: otpResult.loginActivityId,
      message: "OTP verification required",
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};


export const verifyLoginOTP = async (req, res) => {
  const { userId, otp, trustDevice, loginActivityId, firebaseToken, browserName } = req.body;

  if (!firebaseToken) {
    return res.status(401).json({ message: "Firebase token required" });
  }

  let decodedToken;

  try {
    decodedToken = await admin.auth().verifyIdToken(firebaseToken);
  } catch {
    return res.status(401).json({ message: "Invalid Firebase token" });
  }

  if (
    decodedToken.aud !== process.env.FIREBASE_PROJECT_ID ||
    !decodedToken.email ||
    decodedToken.email_verified !== true
  ) {
    return res.status(401).json({ message: "Verified Firebase account required" });
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user" });
  }

  if (!mongoose.Types.ObjectId.isValid(loginActivityId)) {
    return res.status(400).json({ message: "Invalid login attempt" });
  }

  if (!/^\d{6}$/.test(otp || "")) {
    return res.status(400).json({ message: "Enter a valid 6-digit OTP" });
  }

  try {
    const user = await users.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.email.toLowerCase() !== decodedToken.email.toLowerCase()) {
      return res.status(403).json({
        message: "Firebase account does not match this login",
      });
    }

    const loginActivity = await LoginActivity.findOne({
      _id: loginActivityId,
      userId,
      loginStatus: "OTP_REQUIRED",
    });

    if (!loginActivity) {
      return res.status(400).json({
        message: "Login attempt not found or already processed",
      });
    }

    const otpRecord = await OTP.findOne({
      userId,
      loginActivityId,
      purpose: "LOGIN_VERIFICATION",
      verified: false,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: 5 },
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({
        message: "No active OTP found or OTP has expired",
      });
    }

    const submittedHash = hashOTP(otp);

    if (submittedHash !== otpRecord.otpHash) {
      const updatedOTP = await OTP.findOneAndUpdate(
        {
          _id: otpRecord._id,
          verified: false,
          attempts: { $lt: 5 },
          expiresAt: { $gt: new Date() },
        },
        {
          $inc: { attempts: 1 },
        },
        { new: true }
      );

      if (!updatedOTP) {
        return res.status(429).json({
          message: "Too many OTP attempts or OTP expired",
        });
      }

      await LoginActivity.findOneAndUpdate(
        {
          _id: loginActivityId,
          userId,
          loginStatus: "OTP_REQUIRED",
        },
        {
          $inc: { otpAttempts: 1 },
          ...(updatedOTP.attempts >= 5
            ? { $set: { loginStatus: "FAILED" } }
            : {}),
        }
      );

      return res.status(400).json({
        message: "Incorrect OTP",
        attemptsRemaining: Math.max(0, 5 - updatedOTP.attempts),
      });
    }

    const verifiedOTP = await OTP.findOneAndUpdate(
      {
        _id: otpRecord._id,
        userId,
        loginActivityId,
        purpose: "LOGIN_VERIFICATION",
        verified: false,
        attempts: { $lt: 5 },
        expiresAt: { $gt: new Date() },
      },
      {
        $set: { verified: true },
      },
      { new: true }
    );

    if (!verifiedOTP) {
      return res.status(400).json({
        message: "OTP has expired or has already been used",
      });
    }

    if (trustDevice === true) {
      const userAgent = req.headers["user-agent"] || "";
      const deviceInfo = getDeviceInfo(userAgent, browserName);
      const ipAddress = getClientIp(req);
      const deviceId = createDeviceId(userId, deviceInfo, ipAddress);

      await TrustedDevice.findOneAndUpdate(
        {
          userId,
          deviceId,
        },
        {
          userId,
          deviceId,
          ipAddress,
          browser: deviceInfo.browser,
          browserVersion: deviceInfo.browserVersion,
          operatingSystem: deviceInfo.operatingSystem,
          deviceType: deviceInfo.deviceType,
          deviceModel: deviceInfo.deviceModel,
          trustedAt: new Date(),
          expiresAt: new Date(Date.now() + (Number(user.trustedDeviceDuration) || 30) * 24 * 60 * 60 * 1000),
        },
        {
          upsert: true,
          new: true,
        }
      );
    }

    const updatedActivity = await LoginActivity.findOneAndUpdate(
      {
        _id: loginActivityId,
        userId,
        loginStatus: "OTP_REQUIRED",
        otpVerified: false,
      },
      {
        $set: {
          loginStatus: "OTP_VERIFIED",
          otpVerified: true,
          isTrusted: trustDevice === true,
        },
      },
      { new: true }
    );

    if (!updatedActivity) {
      return res.status(400).json({
        message: "Login attempt not found or already processed",
      });
    }

    return res.status(200).json({
      result: user,
      token: generateAuthToken(user),
      requiresOTP: false,
    });
  } catch (error) {
    console.error("OTP verification error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const resendLoginOTP = async (req, res) => {
  const { userId, loginActivityId, firebaseToken } = req.body;

  if (!firebaseToken) {
    return res.status(401).json({ message: "Firebase token required" });
  }

  if (
    !mongoose.Types.ObjectId.isValid(userId) ||
    !mongoose.Types.ObjectId.isValid(loginActivityId)
  ) {
    return res.status(400).json({ message: "Invalid login request" });
  }

  let decodedToken;

  try {
    decodedToken = await admin.auth().verifyIdToken(firebaseToken);
  } catch {
    return res.status(401).json({ message: "Invalid Firebase token" });
  }

  if (
    decodedToken.aud !== process.env.FIREBASE_PROJECT_ID ||
    !decodedToken.email ||
    decodedToken.email_verified !== true
  ) {
    return res.status(401).json({ message: "Verified Firebase account required" });
  }

  try {
    const user = await users.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.email.toLowerCase() !== decodedToken.email.toLowerCase()) {
      return res.status(403).json({
        message: "Firebase account does not match this login",
      });
    }

    const loginActivity = await LoginActivity.findOne({
      _id: loginActivityId,
      userId,
      loginStatus: "OTP_REQUIRED",
      otpVerified: false,
    });

    if (!loginActivity) {
      return res.status(400).json({
        message: "Login attempt not found or already processed",
      });
    }

    const otpRecord = await OTP.findOne({
      userId,
      loginActivityId,
      purpose: "LOGIN_VERIFICATION",
      verified: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return res.status(400).json({
        message: "No pending OTP found",
      });
    }

    const now = new Date();
    const cooldown = 60 * 1000;
    const maxResends = 3;
    const lastSentAt = otpRecord.lastSentAt || otpRecord.createdAt;
    const elapsed = now.getTime() - new Date(lastSentAt).getTime();

    if ((otpRecord.resendCount || 0) >= maxResends) {
      return res.status(429).json({
        message: "Maximum OTP resend limit reached. Please restart login.",
        resendsRemaining: 0,
      });
    }

    if (elapsed < cooldown) {
      return res.status(429).json({
        message: "Please wait before requesting another OTP",
        cooldownSeconds: Math.ceil((cooldown - elapsed) / 1000),
        resendsRemaining: maxResends - (otpRecord.resendCount || 0),
      });
    }

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const cutoff = new Date(now.getTime() - cooldown);

    const updatedOTP = await OTP.findOneAndUpdate(
      {
        _id: otpRecord._id,
        userId,
        loginActivityId,
        purpose: "LOGIN_VERIFICATION",
        verified: false,
        $and: [
          {
            $or: [
              { resendCount: { $lt: maxResends } },
              { resendCount: { $exists: false } },
            ],
          },
          {
            $or: [
              { lastSentAt: { $lte: cutoff } },
              {
                lastSentAt: { $exists: false },
                createdAt: { $lte: cutoff },
              },
            ],
          },
        ],
      },
      {
        $set: {
          otpHash,
          attempts: 0,
          verified: false,
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
          lastSentAt: now,
        },
        $inc: {
          resendCount: 1,
        },
      },
      { new: true }
    );

    if (!updatedOTP) {
      return res.status(429).json({
        message: "Please wait before requesting another OTP",
      });
    }

    await sendOTPEmail(user.email, otp);

    return res.status(200).json({
      message: "A new OTP has been sent to your registered email",
      resendsRemaining: Math.max(0, maxResends - updatedOTP.resendCount),
      cooldownSeconds: 60,
      expiresInSeconds: 600,
    });
  } catch (error) {
    console.error("Resend OTP error:", error);

    return res.status(500).json({
      message: "Unable to resend OTP. Please try again.",
    });
  }
};

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { channelname, description, channelImage } = req.body;

  if (req.user.id !== _id) {
    return res.status(403).json({
      message: "You are not authorized to access this account",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(500).json({
      message: "User unavailable...",
    });
  }

  try {
    const updatedata = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          channelname,
          description,
          channelImage,
        },
      },
      { new: true }
    );

    return res.status(201).json(updatedata);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const updatetheme = async (req, res) => {
  const { id: _id } = req.params;
  const { themeMode } = req.body;

  if (req.user.id !== _id) {
    return res.status(403).json({
      message: "You are not authorized to access this account",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({
      message: "User unavailable...",
    });
  }

  if (!["auto", "light", "dark"].includes(themeMode)) {
    return res.status(400).json({
      message: "Invalid theme mode",
    });
  }

  try {
    const themePreference =
      themeMode === "auto" ? getDefaultTheme() : themeMode;

    const updatedUser = await users.findByIdAndUpdate(
      _id,
      {
        $set: {
          themeMode,
          themePreference,
        },
      },
      { new: true }
    );

    return res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const getLoginHistory = async (req, res) => {
  const { id } = req.params;

  if (req.user.id !== id) {
    return res.status(403).json({
      message: "You are not authorized to access this account",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "Invalid user",
    });
  }

  try {
    const history = await LoginActivity.find({
      userId: id,
    })
      .sort({ loginTime: -1 })
      .limit(50);

    return res.status(200).json(history);
  } catch (error) {
    console.error("Login history error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const getTrustedDevices = async (req, res) => {
  const { id } = req.params;

  if (req.user.id !== id) {
    return res.status(403).json({
      message: "You are not authorized to access this account",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "Invalid user",
    });
  }

  try {
    const devices = await TrustedDevice.find({
      userId: id,
      expiresAt: { $gt: new Date() },
    }).sort({ trustedAt: -1 });

    return res.status(200).json(devices);
  } catch (error) {
    console.error("Trusted devices error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const updateTrustedDeviceDuration = async (req, res) => {
  const { id } = req.params;
  const { duration } = req.body;
  const allowedDurations = [7, 15, 30, 60, 90];

  if (req.user.id !== id) {
    return res.status(403).json({
      message: "You are not authorized to access this account",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      message: "Invalid user",
    });
  }

  if (!allowedDurations.includes(Number(duration))) {
    return res.status(400).json({
      message: "Invalid trusted-device duration",
    });
  }

  try {
    const updatedUser = await users.findByIdAndUpdate(
      id,
      {
        $set: {
          trustedDeviceDuration: Number(duration),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("_id trustedDeviceDuration");

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "Trusted-device duration updated successfully",
      trustedDeviceDuration: updatedUser.trustedDeviceDuration,
    });
  } catch (error) {
    console.error("Trusted-device duration update error:", error);
    return res.status(500).json({
      message: "Unable to update trusted-device duration",
    });
  }
};

export const revokeTrustedDevice = async (req, res) => {
  const { userId, deviceId } = req.params;

  if (req.user.id !== userId) {
    return res.status(403).json({
      message: "You are not authorized to access this account",
    });
  }

  if (
    !mongoose.Types.ObjectId.isValid(userId) ||
    !/^[a-fA-F0-9]{64}$/.test(deviceId)
  ) {
    return res.status(400).json({
      message: "Invalid request",
    });
  }

  try {
    const device = await TrustedDevice.findOneAndDelete({
      userId,
      deviceId,
    });

    if (!device) {
      return res.status(404).json({
        message: "Trusted device not found",
      });
    }

    return res.status(200).json({
      message: "Trusted device revoked successfully",
    });
  } catch (error) {
    console.error("Revoke trusted device error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};


export const searchUsers = async (req, res) => {
  const { query } = req.params;

  if (!query || !query.trim()) {
    return res.status(200).json([]);
  }

  try {
    const searchRegex = new RegExp(
      query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i"
    );

    const foundUsers = await users
      .find({
        $or: [{ name: searchRegex }, { channelname: searchRegex }],
      })
      .select("_id name channelname image")
      .limit(10);

    return res.status(200).json(foundUsers);
  } catch (error) {
    console.error("User search error:", error);

    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};

export const syncVerifiedPhone = async (req, res) => {
  const { firebaseToken } = req.body;

  if (!firebaseToken) {
    return res.status(401).json({
      message: "Firebase token required"
    });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken, true);

    if (
      decodedToken.aud !== process.env.FIREBASE_PROJECT_ID ||
      !decodedToken.email ||
      decodedToken.email_verified !== true
    ) {
      return res.status(401).json({
        message: "Verified Firebase account required"
      });
    }

    const firebaseUser = await admin.auth().getUser(decodedToken.uid);
    const phone = firebaseUser.phoneNumber;

    if (!phone) {
      return res.status(400).json({
        message: "No verified phone number linked to this Firebase account"
      });
    }

    const user = await users.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.email.toLowerCase() !== decodedToken.email.toLowerCase()) {
      return res.status(403).json({
        message: "Firebase account does not match this account"
      });
    }

    const existingPhone = await users.findOne({
      phone,
      _id: { $ne: user._id }
    });

    if (existingPhone) {
      return res.status(409).json({
        message: "This mobile number is already linked to another account"
      });
    }

    user.phone = phone;
    user.phoneVerified = true;

    await user.save();

    return res.status(200).json({
      message: "Mobile number verified and linked successfully",
      phone: user.phone,
      phoneVerified: user.phoneVerified
    });
  } catch (error) {
    console.error("Phone synchronization error:", error);

    return res.status(500).json({
      message: "Unable to synchronize mobile number"
    });
  }
};