import Subscription from "../Modals/Subscription.js";

const planHierarchy = {
  Free: 0,
  Bronze: 1,
  Silver: 2,
  Gold: 3
};

const checkVideoAccess = async (req, res, next) => {
  try {
    const requiredPlan = req.video.accessLevel || "Free";

    if (requiredPlan === "Free") {
      return next();
    }

    const subscription = await Subscription.findOne({
      userId: req.user.id,
      status: "active"
    }).lean();

    if (!subscription) {
      return res.status(403).json({
        message: "An active subscription is required",
        requiredPlan
      });
    }

    if (
      subscription.plan === "Free" ||
      (subscription.endDate && subscription.endDate <= new Date()) ||
      planHierarchy[subscription.plan] < planHierarchy[requiredPlan]
    ) {
      return res.status(403).json({
        message: "Upgrade your subscription to access this video",
        requiredPlan,
        currentPlan: subscription.plan
      });
    }

    next();
  } catch (error) {
    console.error("Video access check error:", error);

    return res.status(500).json({
      message: "Unable to verify video access"
    });
  }
};

export default checkVideoAccess;