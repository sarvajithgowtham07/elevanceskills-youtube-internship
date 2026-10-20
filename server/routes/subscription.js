import express from "express";
import { getMySubscription } from "../controllers/subscription.js";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

routes.get("/me", verifyToken, getMySubscription);

export default routes;