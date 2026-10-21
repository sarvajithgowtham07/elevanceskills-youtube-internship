import razorpay from "../utils/razorpay.js";
import crypto from "crypto";
import Subscription from "../Modals/Subscription.js";

const plans = {
  Basic: 9900,
  Premium: 19900,
};

export const createSubscriptionOrder = async (req, res) => {
  try {
    const { plan } = req.body;

    if (!Object.prototype.hasOwnProperty.call(plans, plan)) {
      return res.status(400).json({ message: "Invalid subscription plan" });
    }

    const order = await razorpay.orders.create({
      amount: plans[plan],
      currency: "INR",
      receipt: `sub_${req.user.id}_${Date.now()}`,
      notes: {
        userId: req.user.id,
        plan,
      },
    });

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan,
    });
  } catch (error) {
    console.error("Create payment order error:", error);
    return res.status(500).json({ message: "Unable to create payment order" });
  }
};


export const verifySubscriptionPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !Object.prototype.hasOwnProperty.call(plans, plan)
    ) {
      return res.status(400).json({ message: "Missing or invalid payment details" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const signatureBuffer = Buffer.from(razorpay_signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    const order = await (await import("../utils/razorpay.js")).default.orders.fetch(razorpay_order_id);

    if (
      order.status !== "paid" ||
      order.amount !== plans[plan] ||
      order.currency !== "INR" ||
      order.notes?.userId !== req.user.id ||
      order.notes?.plan !== plan
    ) {
      return res.status(400).json({ message: "Payment does not match the requested subscription" });
    }

    const subscription = await Subscription.findOneAndUpdate(
      { userId: req.user.id },
      {
        $set: {
          plan,
          status: "active",
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      message: "Subscription activated successfully",
      subscription,
    });
  } catch (error) {
    console.error("Verify subscription payment error:", error);
    return res.status(500).json({ message: "Unable to verify payment" });
  }
};