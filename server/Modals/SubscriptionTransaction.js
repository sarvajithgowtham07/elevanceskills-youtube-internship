
import mongoose from "mongoose";

const subscriptionTransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: true
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subscription",
        required: true
    },
    plan: {
        type: String,
        enum: ["Bronze", "Silver", "Gold"],
        required: true
    },
    billingCycle: {
        type: String,
        enum: ["monthly", "quarterly", "yearly"],
        required: true
    },
    paymentId: {
        type: String,
        default: null
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    invoiceNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: "INR"
    },
    status: {
        type: String,
        enum: ["created", "paid", "failed", "cancelled"],
        default: "created"
    },
    failureReason: {
        type: String,
        default: null
    },
    startDate: Date,
    expiryDate: Date,
    autoRenew: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

export default mongoose.model("SubscriptionTransaction", subscriptionTransactionSchema);
