import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ["Free", "Bronze", "Silver", "Gold"],
    default: "Free",
    required: true
  },
  billingCycle: {
    type: String,
    enum: ["monthly", "quarterly", "yearly"],
    default: "monthly"
  },
  status: {
    type: String,
    enum: ["active", "cancelled", "expired"],
    default: "active",
    required: true
  },
  startDate: {
    type: Date,
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  autoRenew: {
    type: Boolean,
    default: false
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  lastPaymentId: {
    type: String,
    default: null
  },
  lastOrderId: {
    type: String,
    default: null
  },
  pendingPlan: {
    type: String,
    enum: ["Free", "Bronze", "Silver", "Gold"],
    default: null
  },
  pendingBillingCycle: {
    type: String,
    enum: ["monthly", "quarterly", "yearly"],
    default: null
  },
  pendingChangeDate: {
    type: Date,
    default: null
  }
}, { timestamps: true });

export default mongoose.model("Subscription", subscriptionSchema);