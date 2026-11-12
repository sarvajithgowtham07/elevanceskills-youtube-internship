import express from "express";
import {
  createSubscriptionOrder,
  verifySubscriptionPayment,
  updatePaymentStatus,
  downloadSubscriptionInvoice
} from "../controllers/payment.js";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

routes.post("/create-order", verifyToken, createSubscriptionOrder);
routes.post("/verify", verifyToken, verifySubscriptionPayment);
routes.post("/status", verifyToken, updatePaymentStatus);
routes.get("/invoice/:transactionId", verifyToken, downloadSubscriptionInvoice);

export default routes;