import express from "express";
import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
} from "../controllers/payment.js";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

routes.post("/create-order", verifyToken, createSubscriptionOrder);
routes.post("/verify", verifyToken, verifySubscriptionPayment);

export default routes;