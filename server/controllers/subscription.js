import Subscription from "../Modals/Subscription.js";

export const getMySubscription = async (req, res) => {
  try {
    let subscription = await Subscription.findOne({ userId: req.user.id });

    if (!subscription) {
      subscription = await Subscription.create({
        userId: req.user.id,
        plan: "Free",
        status: "active",
      });
    }

    if (
      subscription.endDate &&
      subscription.endDate < new Date() &&
      subscription.status === "active"
    ) {
      subscription.status = "expired";
      await subscription.save();
    }

    return res.status(200).json(subscription);
  } catch (error) {
    console.error("Get subscription error:", error);
    return res.status(500).json({
      message: "Unable to retrieve subscription",
    });
  }
};