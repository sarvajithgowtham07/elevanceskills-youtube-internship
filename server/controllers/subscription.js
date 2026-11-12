import Subscription from "../Modals/Subscription.js";
import SubscriptionTransaction from "../Modals/SubscriptionTransaction.js";

const planRank = {
  Free: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3
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

const applyScheduledChange = async (subscription) => {
  if (
    !subscription ||
    !subscription.pendingPlan ||
    !subscription.pendingChangeDate ||
    subscription.pendingChangeDate > new Date()
  ) {
    return subscription;
  }

  const nextPlan = subscription.pendingPlan;

  if (nextPlan === "Free") {
    subscription.plan = "Free";
    subscription.billingCycle = "monthly";
    subscription.status = "active";
    subscription.startDate = null;
    subscription.endDate = null;
    subscription.autoRenew = false;
    subscription.cancelledAt = null;
    subscription.pendingPlan = null;
    subscription.pendingBillingCycle = null;
    subscription.pendingChangeDate = null;
  } else {
    subscription.plan = "Free";
    subscription.billingCycle = "monthly";
    subscription.status = "active";
    subscription.startDate = null;
    subscription.endDate = null;
    subscription.autoRenew = false;
    subscription.cancelledAt = null;
    subscription.pendingChangeDate = null;
  }

  await subscription.save();
  return subscription;
};

export const getMySubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      subscription = await Subscription.create({
        userId,
        plan: "Free",
        status: "active",
        autoRenew: false
      });
    }

    subscription = await applyScheduledChange(subscription);

    if (
      subscription.plan !== "Free" &&
      subscription.endDate &&
      subscription.endDate <= new Date()
    ) {
      subscription.plan = "Free";
      subscription.billingCycle = "monthly";
      subscription.status = "active";
      subscription.startDate = null;
      subscription.endDate = null;
      subscription.autoRenew = false;
      subscription.cancelledAt = null;

      if (!subscription.pendingPlan) {
        subscription.pendingBillingCycle = null;
        subscription.pendingChangeDate = null;
      }

      await subscription.save();
    }

    const billingHistory = await SubscriptionTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .select(
        "plan billingCycle paymentId orderId invoiceNumber amount currency status startDate expiryDate createdAt"
      )
      .lean();

    return res.status(200).json({
      subscription,
      billingHistory
    });
  } catch (error) {
    console.error("Get subscription error:", error);
    return res.status(500).json({
      message: "Unable to retrieve subscription"
    });
  }
};

export const scheduleSubscriptionDowngrade = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plan, billingCycle } = req.body;

    if (!Object.prototype.hasOwnProperty.call(planRank, plan)) {
      return res.status(400).json({
        message: "Invalid downgrade plan"
      });
    }

    if (
      plan !== "Free" &&
      !["monthly", "quarterly", "yearly"].includes(billingCycle)
    ) {
      return res.status(400).json({
        message: "Invalid billing cycle"
      });
    }

    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      return res.status(404).json({
        message: "No active subscription found"
      });
    }

    subscription = await applyScheduledChange(subscription);

    if (
      subscription.plan === "Free" ||
      subscription.status !== "active" ||
      !subscription.endDate ||
      subscription.endDate <= new Date()
    ) {
      return res.status(400).json({
        message: "There is no active paid subscription to downgrade"
      });
    }

    if (planRank[plan] >= planRank[subscription.plan]) {
      return res.status(400).json({
        message: "Select a lower subscription plan"
      });
    }

    subscription.pendingPlan = plan;
    subscription.pendingBillingCycle = plan === "Free" ? null : billingCycle;
    subscription.pendingChangeDate = subscription.endDate;

    await subscription.save();

    return res.status(200).json({
      message: plan === "Free"
        ? `Your subscription will change to Free on ${subscription.endDate.toISOString()}`
        : `Your current plan remains active until ${subscription.endDate.toISOString()}. After expiry, your account moves to Free and you can purchase ${plan} for the next period.`,
      subscription
    });
  } catch (error) {
    console.error("Schedule subscription downgrade error:", error);
    return res.status(500).json({
      message: "Unable to schedule subscription downgrade"
    });
  }
};

export const cancelScheduledDowngrade = async (req, res) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      {
        userId: req.user.id,
        pendingPlan: { $ne: null }
      },
      {
        $set: {
          pendingPlan: null,
          pendingBillingCycle: null,
          pendingChangeDate: null
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!subscription) {
      return res.status(404).json({
        message: "No scheduled plan change was found"
      });
    }

    return res.status(200).json({
      message: "Scheduled downgrade cancelled",
      subscription
    });
  } catch (error) {
    console.error("Cancel scheduled downgrade error:", error);
    return res.status(500).json({
      message: "Unable to cancel scheduled downgrade"
    });
  }
};