import razorpay from "../utils/razorpay.js";
import crypto from "crypto";
import Subscription from "../Modals/Subscription.js";
import SubscriptionTransaction from "../Modals/SubscriptionTransaction.js";
import User from "../Modals/Auth.js";
import PDFDocument from "pdfkit";
import { sendSubscriptionReceiptEmail } from "../utils/sendEmail.js";

const plans = {
  Bronze: {
    monthly: 9900,
    quarterly: 24900,
    yearly: 89900
  },
  Silver: {
    monthly: 19900,
    quarterly: 49900,
    yearly: 179900
  },
  Gold: {
    monthly: 29900,
    quarterly: 74900,
    yearly: 269900
  }
};

const getExpiryDate = (startDate, billingCycle) => {
  const expiryDate = new Date(startDate);
  const months = {
    monthly: 1,
    quarterly: 3,
    yearly: 12
  };

  const originalDay = expiryDate.getDate();
  expiryDate.setDate(1);
  expiryDate.setMonth(expiryDate.getMonth() + months[billingCycle]);

  const lastDay = new Date(
    expiryDate.getFullYear(),
    expiryDate.getMonth() + 1,
    0
  ).getDate();

  expiryDate.setDate(Math.min(originalDay, lastDay));
  return expiryDate;
};

const createInvoiceNumber = () => {
  return `INV-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
};

export const createSubscriptionOrder = async (req, res) => {
  try {
    const { plan, billingCycle } = req.body;
    const userId = req.user.id;

    if (
      !Object.prototype.hasOwnProperty.call(plans, plan) ||
      !Object.prototype.hasOwnProperty.call(plans[plan], billingCycle)
    ) {
      return res.status(400).json({
        message: "Invalid subscription plan or billing cycle"
      });
    }

    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      subscription = await Subscription.create({
        userId,
        plan: "Free",
        status: "active"
      });
    }

    if (
      subscription.status === "active" &&
      subscription.endDate &&
      subscription.endDate <= new Date()
    ) {
      subscription.status = "expired";
      await subscription.save();
    }

    const amount = plans[plan][billingCycle];

    const order = await razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: `sub_${userId}_${Date.now()}`,
      notes: {
        userId: String(userId),
        plan,
        billingCycle
      }
    });

    await SubscriptionTransaction.create({
      userId,
      subscriptionId: subscription._id,
      plan,
      billingCycle,
      orderId: order.id,
      amount,
      currency: "INR",
      status: "created",
      autoRenew: false
    });

    return res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      plan,
      billingCycle
    });
  } catch (error) {
    console.error("Create payment order error:", error);
    return res.status(500).json({
      message: "Unable to create payment order"
    });
  }
};

export const verifySubscriptionPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    const userId = req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        message: "Missing payment verification details"
      });
    }

    const transaction = await SubscriptionTransaction.findOne({
      orderId: razorpay_order_id,
      userId
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Payment order not found"
      });
    }

    if (transaction.status === "paid") {
      if (transaction.paymentId !== razorpay_payment_id) {
        return res.status(409).json({
          message: "This order has already been paid with another payment"
        });
      }

      const existingSubscription = await Subscription.findById(
        transaction.subscriptionId
      );

      return res.status(200).json({
        message: "Payment was already verified",
        subscription: existingSubscription,
        transaction
      });
    }

    if (transaction.status !== "created") {
      return res.status(409).json({
        message: "This payment order is no longer available for verification"
      });
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
      return res.status(400).json({
        message: "Payment signature verification failed"
      });
    }

    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(razorpay_order_id),
      razorpay.payments.fetch(razorpay_payment_id)
    ]);

    if (
      order.status !== "paid" ||
      order.amount !== transaction.amount ||
      order.currency !== transaction.currency ||
      order.notes?.userId !== String(userId) ||
      order.notes?.plan !== transaction.plan ||
      order.notes?.billingCycle !== transaction.billingCycle ||
      payment.order_id !== razorpay_order_id ||
      payment.status !== "captured" ||
      payment.amount !== transaction.amount ||
      payment.currency !== transaction.currency
    ) {
      return res.status(400).json({
        message: "Payment does not match the subscription order"
      });
    }

    const startDate = new Date();
    const expiryDate = getExpiryDate(startDate, transaction.billingCycle);

    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      {
        $set: {
          plan: transaction.plan,
          billingCycle: transaction.billingCycle,
          status: "active",
          startDate,
          endDate: expiryDate,
          autoRenew: false,
          cancelledAt: null,
          lastPaymentId: razorpay_payment_id,
          lastOrderId: razorpay_order_id,
          pendingPlan: null,
          pendingBillingCycle: null,
          pendingChangeDate: null
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    transaction.paymentId = razorpay_payment_id;
    transaction.invoiceNumber = createInvoiceNumber();
    transaction.status = "paid";
    transaction.startDate = startDate;
    transaction.expiryDate = expiryDate;
    await transaction.save();

    let emailSent = false;

    try {
      const user = await User.findById(userId).select("name email");

      if (user?.email) {
        const invoiceBuffer = await createInvoicePdfBuffer(transaction);
        await sendSubscriptionReceiptEmail(user.email, user.name, transaction, invoiceBuffer);
        emailSent = true;
      }
    } catch (emailError) {
      console.error("Subscription receipt email error:", emailError);
    }

    return res.status(200).json({
      message: "Subscription activated successfully",
      subscription,
      transaction,
      emailSent
    });
  } catch (error) {
    console.error("Verify subscription payment error:", error);
    return res.status(500).json({
      message: "Unable to verify payment"
    });
  }
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const userId = req.user.id;

    if (!orderId || !["failed", "cancelled"].includes(status)) {
      return res.status(400).json({
        message: "Invalid order ID or payment status"
      });
    }

    const transaction = await SubscriptionTransaction.findOneAndUpdate(
      {
        orderId,
        userId,
        status: "created"
      },
      {
        $set: { status }
      },
      {
        new: true
      }
    );

    if (transaction) {
      return res.status(200).json({
        message: `Payment ${status} successfully recorded`,
        transaction
      });
    }

    const existingTransaction = await SubscriptionTransaction.findOne({
      orderId,
      userId
    });

    if (!existingTransaction) {
      return res.status(404).json({
        message: "Payment order not found"
      });
    }

    if (existingTransaction.status === "paid") {
      return res.status(409).json({
        message: "A successful payment cannot be marked as failed or cancelled"
      });
    }

    return res.status(200).json({
      message: "Payment status already recorded",
      transaction: existingTransaction
    });
  } catch (error) {
    console.error("Update payment status error:", error);
    return res.status(500).json({
      message: "Unable to update payment status"
    });
  }
};

const createInvoicePdfBuffer = (transaction) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50
    });

    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(24).text("SUBSCRIPTION INVOICE", {
      align: "center"
    });

    doc.moveDown(2);

    doc.fontSize(12).text(`Invoice Number: ${transaction.invoiceNumber}`);
    doc.text(`Invoice Date: ${transaction.createdAt.toLocaleDateString("en-IN")}`);
    doc.text(`Payment Status: ${transaction.status.toUpperCase()}`);

    doc.moveDown(2);

    doc.fontSize(16).text("Subscription Details");
    doc.moveDown();

    doc.fontSize(12).text(`Plan: ${transaction.plan}`);
    doc.text(`Billing Cycle: ${transaction.billingCycle}`);
    doc.text(`Amount: INR ${(transaction.amount / 100).toFixed(2)}`);
    doc.text(`Currency: ${transaction.currency}`);
    doc.text(`Order ID: ${transaction.orderId}`);
    doc.text(`Payment ID: ${transaction.paymentId}`);

    doc.moveDown(2);

    doc.text(`Subscription Start: ${transaction.startDate?.toLocaleDateString("en-IN") || "N/A"}`);
    doc.text(`Subscription Expiry: ${transaction.expiryDate?.toLocaleDateString("en-IN") || "N/A"}`);

    doc.moveDown(3);

    doc.fontSize(10).text(
      "Thank you for subscribing. This document confirms your recorded subscription payment.",
      {
        align: "center"
      }
    );

    doc.end();
  });
};

export const downloadSubscriptionInvoice = async (req, res) => {
  try {
    const userId = req.user.id;
    const { transactionId } = req.params;

    const transaction = await SubscriptionTransaction.findOne({
      _id: transactionId,
      userId,
      status: "paid"
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Paid invoice not found"
      });
    }

    const invoiceBuffer = await createInvoicePdfBuffer(transaction);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${transaction.invoiceNumber}.pdf"`
    );

    return res.send(invoiceBuffer);
  } catch (error) {
    console.error("Invoice generation error:", error);
    return res.status(500).json({
      message: "Unable to generate invoice"
    });
  }
};
