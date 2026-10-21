import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication token required",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.sub || !mongoose.Types.ObjectId.isValid(decoded.sub)) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    req.user = { id: decoded.sub };
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
};

export default verifyToken;