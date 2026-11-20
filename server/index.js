import livekitroutes from "./routes/livekit.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import userroutes from "./routes/auth.js";
import videoroutes from "./routes/video.js";
import likeroutes from "./routes/like.js";
import watchlaterroutes from "./routes/watchlater.js";
import historyrroutes from "./routes/history.js";
import commentroutes from "./routes/comment.js";
import subscriptionroutes from "./routes/subscription.js";
import paymentroutes from "./routes/payment.js";

dotenv.config();

const app = express();
const httpServer = http.createServer(app);

app.set("trust proxy", true);

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use(bodyParser.json());
app.use("/livekit", livekitroutes);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || true,
    methods: ["GET", "POST"],
  },
});

const onlineUsers = new Map();
const pendingCalls = new Map();

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    if (!process.env.JWT_SECRET) {
      return next(new Error("Server authentication configuration error"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.sub) {
      return next(new Error("Invalid authentication token"));
    }

    socket.data.userId = decoded.sub;
    next();
  } catch (error) {
    next(new Error("Invalid or expired authentication token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId;

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }

  onlineUsers.get(userId).add(socket.id);

  console.log(`User connected: ${userId}`);

  socket.on("call-user", ({ targetUserId, roomId } = {}) => {
    if (
      typeof targetUserId !== "string" ||
      typeof roomId !== "string" ||
      !roomId.trim() ||
      roomId.length > 128 ||
      !mongoose.Types.ObjectId.isValid(targetUserId) ||
      targetUserId === userId
    ) {
      return socket.emit("call-error", {
        message: "Invalid call request",
      });
    }

    const targetSockets = onlineUsers.get(targetUserId);

    if (!targetSockets || targetSockets.size === 0) {
      return socket.emit("call-error", {
        message: "User is currently offline",
      });
    }

    for (const targetSocketId of targetSockets) {
      const invitationKey = `${targetSocketId}:${socket.id}`;

      pendingCalls.set(invitationKey, {
        roomId: roomId.trim(),
        callerUserId: userId,
        targetUserId,
      });

      io.to(targetSocketId).emit("incoming-call", {
        roomId: roomId.trim(),
        callerId: userId,
        callerSocketId: socket.id,
      });
    }
  });

  socket.on("accept-call", ({ roomId, callerSocketId } = {}) => {
    if (
      typeof roomId !== "string" ||
      typeof callerSocketId !== "string"
    ) {
      return;
    }

    const invitationKey = `${socket.id}:${callerSocketId}`;
    const invitation = pendingCalls.get(invitationKey);

    if (
      !invitation ||
      invitation.roomId !== roomId ||
      invitation.targetUserId !== userId
    ) {
      return socket.emit("call-error", {
        message: "Invalid or expired call invitation",
      });
    }

    const callerSocket = io.sockets.sockets.get(callerSocketId);

    if (
      !callerSocket ||
      callerSocket.data.userId !== invitation.callerUserId
    ) {
      pendingCalls.delete(invitationKey);

      return socket.emit("call-error", {
        message: "Caller is no longer available",
      });
    }

    for (const [key, value] of pendingCalls) {
      if (
        value.callerUserId === invitation.callerUserId &&
        value.roomId === invitation.roomId
      ) {
        pendingCalls.delete(key);
      }
    }

    socket.join(roomId);
    callerSocket.join(roomId);

    socket.emit("call-accepted", {
      roomId,
      targetSocketId: callerSocket.id,
    });

    callerSocket.emit("call-accepted", {
      roomId,
      targetSocketId: socket.id,
    });
  });

  socket.on("reject-call", ({ callerSocketId } = {}) => {
    if (typeof callerSocketId !== "string") {
      return;
    }

    const invitationKey = `${socket.id}:${callerSocketId}`;
    const invitation = pendingCalls.get(invitationKey);

    if (!invitation) {
      return;
    }

    pendingCalls.delete(invitationKey);

    io.to(callerSocketId).emit("call-rejected", {
      userId,
    });
  });

  socket.on("join-call", ({ roomId } = {}) => {
    if (
      typeof roomId !== "string" ||
      !roomId.trim() ||
      roomId.length > 128
    ) {
      return socket.emit("call-error", {
        message: "Invalid call room",
      });
    }

    const room = roomId.trim();
    const existingMembers = Array.from(
      io.sockets.adapter.rooms.get(room) || []
    );

    socket.join(room);

    socket.emit("call-joined", {
      roomId: room,
      participants: existingMembers,
    });

    socket.to(room).emit("user-joined", {
      userId,
      socketId: socket.id,
    });
  });

  socket.on("call-offer", ({ roomId, targetSocketId, offer } = {}) => {
    if (
      typeof roomId !== "string" ||
      typeof targetSocketId !== "string" ||
      !offer ||
      !socket.rooms.has(roomId) ||
      !io.sockets.adapter.rooms.get(roomId)?.has(targetSocketId)
    ) {
      return;
    }

    io.to(targetSocketId).emit("call-offer", {
      roomId,
      offer,
      fromSocketId: socket.id,
      fromUserId: userId,
    });
  });

  socket.on("call-answer", ({ roomId, targetSocketId, answer } = {}) => {
    if (
      typeof roomId !== "string" ||
      typeof targetSocketId !== "string" ||
      !answer ||
      !socket.rooms.has(roomId) ||
      !io.sockets.adapter.rooms.get(roomId)?.has(targetSocketId)
    ) {
      return;
    }

    io.to(targetSocketId).emit("call-answer", {
      roomId,
      answer,
      fromSocketId: socket.id,
    });
  });

  socket.on("ice-candidate", ({ roomId, targetSocketId, candidate } = {}) => {
    if (
      typeof roomId !== "string" ||
      typeof targetSocketId !== "string" ||
      !candidate ||
      !socket.rooms.has(roomId) ||
      !io.sockets.adapter.rooms.get(roomId)?.has(targetSocketId)
    ) {
      return;
    }

    io.to(targetSocketId).emit("ice-candidate", {
      candidate,
      fromSocketId: socket.id,
    });
  });

  socket.on("end-call", ({ roomId } = {}) => {
    if (typeof roomId !== "string" || !socket.rooms.has(roomId)) {
      return;
    }

    socket.to(roomId).emit("call-ended", {
      userId,
    });

    socket.leave(roomId);
  });

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        socket.to(room).emit("user-left", {
          userId,
          socketId: socket.id,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    const userSockets = onlineUsers.get(userId);

    if (userSockets) {
      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }

    for (const [key, invitation] of pendingCalls) {
      if (
        key.startsWith(`${socket.id}:`) ||
        key.endsWith(`:${socket.id}`)
      ) {
        pendingCalls.delete(key);
      }
    }

    console.log(`User disconnected: ${userId}`);
  });
});

app.get("/", (req, res) => {
  res.send("You tube backend is working");
});

app.get("/debug/ip", async (req, res) => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (forwarded ? forwarded.split(",")[0] : req.ip || "")
    .trim()
    .replace("::ffff:", "");

  let geo = null;

  try {
    const r = await fetch(`http://ip-api.com/json/${ip}`);
    geo = await r.json();
  } catch (e) {
    geo = { error: e.message };
  }

  res.json({ ip, forwarded, reqIp: req.ip, geo });
});

app.use("/user", userroutes);
app.use("/video", videoroutes);
app.use("/like", likeroutes);
app.use("/watch", watchlaterroutes);
app.use("/history", historyrroutes);
app.use("/comment", commentroutes);
app.use("/subscription", subscriptionroutes);
app.use("/payment", paymentroutes);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log("Mongodb connected");

    httpServer.listen(PORT, () => {
      console.log(`server running on port ${PORT}`);
      console.log("Socket.IO server ready");
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

startServer();
