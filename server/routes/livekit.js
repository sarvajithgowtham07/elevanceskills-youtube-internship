import express from "express";
import { randomUUID } from "crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import verifyToken from "../middleware/authMiddleware.js";

const routes = express.Router();

const getConfig = () => {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error("LiveKit configuration is missing");
  }

  const host = LIVEKIT_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

  return {
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    roomService: new RoomServiceClient(
      host,
      LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET
    )
  };
};

const generateToken = async (identity, roomName, isHost = false) => {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = getConfig();

  const accessToken = new AccessToken(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    {
      identity,
      ttl: "15m"
    }
  );

  accessToken.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    ...(isHost ? { roomAdmin: true } : {})
  });

  return await accessToken.toJwt();
};

routes.post("/create", verifyToken, async (req, res) => {
  try {
    const { LIVEKIT_URL, roomService } = getConfig();
    const roomName = `yt-${randomUUID()}`;

    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 600,
      departureTimeout: 30,
      maxParticipants: 10
    });

    const token = await generateToken(
      req.user.id,
      roomName,
      true
    );

    res.status(201).json({
      success: true,
      roomName,
      token,
      serverUrl: LIVEKIT_URL,
      role: "host"
    });
  } catch (error) {
    console.error("LiveKit room creation error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to create meeting"
    });
  }
});

routes.post("/token", verifyToken, async (req, res) => {
  try {
    const { roomName } = req.body;

    if (
      typeof roomName !== "string" ||
      !/^yt-[0-9a-f-]{36}$/.test(roomName)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting room"
      });
    }

    const { LIVEKIT_URL, roomService } = getConfig();
    const rooms = await roomService.listRooms([roomName]);

    if (!rooms.length) {
      return res.status(404).json({
        success: false,
        message: "Meeting does not exist or has expired"
      });
    }

    const token = await generateToken(
      req.user.id,
      roomName
    );

    res.json({
      success: true,
      roomName,
      token,
      serverUrl: LIVEKIT_URL,
      role: "participant"
    });
  } catch (error) {
    console.error("LiveKit token error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to join meeting"
    });
  }
});

export default routes;
