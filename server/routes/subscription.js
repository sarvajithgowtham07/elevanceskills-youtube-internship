import express from "express";
import {
  getMySubscription,
  scheduleSubscriptionDowngrade,
  cancelScheduledDowngrade
} from "../controllers/subscription.js";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

routes.get("/me", verifyToken, getMySubscription);
routes.post("/downgrade", verifyToken, scheduleSubscriptionDowngrade);
routes.delete("/downgrade", verifyToken, cancelScheduledDowngrade);

export default routes;