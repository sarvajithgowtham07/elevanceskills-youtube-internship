import express from "express";
import {
  login,
  updateprofile,
  updatetheme,
  verifyLoginOTP,
  resendLoginOTP,
  getLoginHistory,
  getTrustedDevices,
  revokeTrustedDevice,
  searchUsers,
  syncVerifiedPhone
} from "../controllers/auth.js";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

routes.post("/login", login);
routes.post("/verify-otp", verifyLoginOTP);
routes.post("/resend-otp", resendLoginOTP);

routes.post("/phone/sync", verifyToken, syncVerifiedPhone);

routes.patch("/update/:id", verifyToken, updateprofile);
routes.patch("/theme/:id", verifyToken, updatetheme);
routes.get("/login-history/:id", verifyToken, getLoginHistory);
routes.get("/trusted-devices/:id", verifyToken, getTrustedDevices);
routes.delete(
  "/trusted-devices/:userId/:deviceId",
  verifyToken,
  revokeTrustedDevice
);

routes.get("/search-users/:query", searchUsers);

export default routes;