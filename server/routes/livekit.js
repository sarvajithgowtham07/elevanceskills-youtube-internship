import express from "express";
import { randomUUID } from "crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import verifyToken from "../middleware/authMiddleware.js";
import users from "../Modals/Auth.js";

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

const generateToken = async (identity, roomName, isHost = false, participantName = "User") => {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = getConfig();

  const accessToken = new AccessToken(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    {
      identity,
      name: participantName,
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

    const user = await users.findById(req.user.id).select("name channelname");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const participantName = user.channelname || user.name || "User";
    const roomName = `yt-${randomUUID()}`;

    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 600,
      departureTimeout: 30,
      maxParticipants: 10,
      metadata: JSON.stringify({
        hostId: String(req.user.id),
        createdAt: new Date().toISOString()
      })
    });

    const token = await generateToken(
      req.user.id,
      roomName,
      true,
      participantName
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
      !/^yt-[0-9a-f-]{36}$/i.test(roomName)
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

    let metadata;

    try {
      metadata = JSON.parse(rooms[0].metadata || "{}");
    } catch {
      return res.status(403).json({
        success: false,
        message: "Meeting authorization failed"
      });
    }

    if (!metadata.hostId) {
      return res.status(403).json({
        success: false,
        message: "Meeting authorization failed"
      });
    }

    const isHost = metadata.hostId === req.user.id;
    const participants = await roomService.listParticipants(roomName);

    if (
      participants.some(
        (participant) => participant.identity === req.user.id
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "You are already connected to this meeting"
      });
    }

    if (participants.length >= 10) {
      return res.status(409).json({
        success: false,
        message: "Meeting is full"
      });
    }

    const user = await users.findById(req.user.id).select("name channelname");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const participantName = user.channelname || user.name || "User";

    const token = await generateToken(
      req.user.id,
      roomName,
      isHost,
      participantName
    );

    res.json({
      success: true,
      roomName,
      token,
      serverUrl: LIVEKIT_URL,
      role: isHost ? "host" : "participant"
    });
  } catch (error) {
    console.error("LiveKit token error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to join meeting"
    });
  }
});


routes.post("/end", verifyToken, async (req, res) => {
  try {
    const { roomName } = req.body;

    if (
      typeof roomName !== "string" ||
      !/^yt-[0-9a-f-]{36}$/i.test(roomName)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting room"
      });
    }

    const { roomService } = getConfig();
    const rooms = await roomService.listRooms([roomName]);

    if (!rooms.length) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found or already ended"
      });
    }

    let metadata;

    try {
      metadata = JSON.parse(rooms[0].metadata || "{}");
    } catch {
      return res.status(403).json({
        success: false,
        message: "Meeting authorization failed"
      });
    }

    if (String(metadata.hostId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Only the host can end this meeting"
      });
    }

    await roomService.deleteRoom(roomName);

    return res.json({
      success: true,
      message: "Meeting ended for everyone"
    });
  } catch (error) {
    console.error("LiveKit meeting end error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to end meeting"
    });
  }
});

export default routes;