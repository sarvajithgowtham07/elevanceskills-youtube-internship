
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  LiveKitRoom,
  VideoConference,
  useRoomContext
} from "@livekit/components-react";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface SearchUser {
  _id: string;
  name: string;
  channelname?: string;
  image?: string;
}

interface IncomingCall {
  roomId: string;
  callerId: string;
  callerSocketId: string;
}

interface MeetingConnection {
  roomName: string;
  token: string;
  serverUrl: string;
  role: string;
}
function CameraSwitchButton() {
  const room = useRoomContext();
  const [switching, setSwitching] = useState(false);

  const switchCamera = async () => {
    if (switching) return;

    try {
      setSwitching(true);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(
        device => device.kind === "videoinput"
      );

      if (cameras.length < 2) return;

      const activeDevice = await room.getActiveDevice("videoinput");
      const currentIndex = cameras.findIndex(
        device => device.deviceId === activeDevice
      );

      const nextIndex = (currentIndex + 1) % cameras.length;

      await room.switchActiveDevice(
        "videoinput",
        cameras[nextIndex].deviceId
      );
    } catch (error) {
      console.error("Camera switch error:", error);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <button
      type="button"
      onClick={switchCamera}
      disabled={switching}
      aria-label="Switch camera"
      title="Switch front/rear camera"
      className="absolute bottom-24 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-gray-800/90 text-white shadow-lg backdrop-blur transition hover:bg-gray-700 active:scale-95 disabled:opacity-50 md:hidden"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="21"
        height="21"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
        <path d="M8 2l3 3-3 3" />
      </svg>
    </button>
  );
}
export default function VideoCall() {
  const { user } = useUser();

  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [status, setStatus] = useState("Search for a user or create a meeting.");
  const [loading, setLoading] = useState(false);
  const [meetingId, setMeetingId] = useState("");
  const [connection, setConnection] = useState<MeetingConnection | null>(null);
  const [shareUrl, setShareUrl] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const incomingRef = useRef<IncomingCall | null>(null);
  const pendingMeetingRef = useRef<MeetingConnection | null>(null);
  const roomRef = useRef("");

  const getMeetingLink = useCallback((roomName: string) => {
    return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}`;
  }, []);

  const createMeeting = async () => {
    try {
      setLoading(true);
      setStatus("Creating meeting...");

      const response = await axiosInstance.post("/livekit/create", {});
      const data = response.data;

      const meeting: MeetingConnection = {
        roomName: data.roomName,
        token: data.token,
        serverUrl: data.serverUrl,
        role: data.role
      };

      setConnection(meeting);
      setMeetingId(data.roomName);
      setShareUrl(getMeetingLink(data.roomName));
      roomRef.current = data.roomName;

      window.history.replaceState(
        {},
        "",
        `?room=${encodeURIComponent(data.roomName)}`
      );

      setStatus("Meeting created successfully.");
    } catch (error: any) {
      console.error("Meeting creation error:", error);
      setStatus(
        error.response?.data?.message || "Unable to create meeting."
      );
    } finally {
      setLoading(false);
    }
  };

  const extractRoomName = (value: string) => {
    const input = value.trim();

    if (!input) return "";

    try {
      if (
        input.startsWith("http://") ||
        input.startsWith("https://")
      ) {
        const url = new URL(input);
        return url.searchParams.get("room") || "";
      }
    } catch {
      return "";
    }

    return input;
  };

  const joinMeeting = async (roomValue = meetingId) => {
    const roomName = extractRoomName(roomValue);

    if (!/^yt-[0-9a-f-]{36}$/i.test(roomName)) {
      setStatus("Enter a valid YourTube meeting ID or link.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Joining meeting...");

      const response = await axiosInstance.post("/livekit/token", {
        roomName
      });

      const data = response.data;

      const meeting: MeetingConnection = {
        roomName: data.roomName,
        token: data.token,
        serverUrl: data.serverUrl,
        role: data.role
      };

      setConnection(meeting);
      setMeetingId(data.roomName);
      setShareUrl(getMeetingLink(data.roomName));
      roomRef.current = data.roomName;

      window.history.replaceState(
        {},
        "",
        `?room=${encodeURIComponent(data.roomName)}`
      );

      setStatus("Connecting to YourTube meeting...");
    } catch (error: any) {
      console.error("Meeting join error:", error);
      setStatus(
        error.response?.data?.message || "Unable to join meeting."
      );
    } finally {
      setLoading(false);
    }
  };

  const copyMeetingLink = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Meeting link copied successfully.");
    } catch (error) {
      console.error("Copy link error:", error);
      setStatus("Unable to copy meeting link.");
    }
  };

  const leaveMeeting = useCallback(() => {
    const roomName = roomRef.current;

    if (roomName && socketRef.current?.connected) {
      socketRef.current.emit("end-call", {
        roomId: roomName
      });
    }

    roomRef.current = "";
    pendingMeetingRef.current = null;

    setConnection(null);
    setShareUrl("");
    setStatus("You left the meeting.");

    window.history.replaceState(
      {},
      "",
      window.location.pathname
    );
  }, []);


  const closeCall = useCallback(async () => {
    const roomName = roomRef.current;

    if (!roomName) return;

    try {
      setLoading(true);
      setStatus("Ending meeting for everyone...");

      await axiosInstance.post("/livekit/end", {
        roomName
      });

      if (socketRef.current?.connected) {
        socketRef.current.emit("end-call", {
          roomId: roomName
        });
      }

      roomRef.current = "";
      pendingMeetingRef.current = null;

      setConnection(null);
      setShareUrl("");
      setStatus("Meeting ended for everyone.");

      window.history.replaceState(
        {},
        "",
        window.location.pathname
      );
    } catch (error: any) {
      console.error("End meeting error:", error);

      setStatus(
        error.response?.data?.message || "Unable to end meeting."
      );
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("token");

    if (!token) {
      setStatus("Please log in again.");
      return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

    if (!backendUrl) {
      setStatus("Backend URL is not configured.");
      return;
    }

    const socket = io(backendUrl, {
      auth: { token },
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Calling server connected.");
    });

    socket.on("connect_error", (error) => {
      setStatus(
        error.message || "Unable to connect to calling server."
      );
    });

    socket.on("incoming-call", (data: IncomingCall) => {
      incomingRef.current = data;
      setIncomingCall(data);
      setStatus("Incoming video call.");
    });

    socket.on("call-accepted", ({ roomId }) => {
      const pendingMeeting = pendingMeetingRef.current;

      if (!pendingMeeting || pendingMeeting.roomName !== roomId) {
        return;
      }

      roomRef.current = roomId;

      setConnection(pendingMeeting);
      setMeetingId(roomId);
      setShareUrl(getMeetingLink(roomId));
      setStatus("Your call was accepted. Connecting...");

      pendingMeetingRef.current = null;
    });

    socket.on("call-rejected", () => {
      pendingMeetingRef.current = null;
      roomRef.current = "";

      setStatus("Your call was rejected.");
    });

    socket.on("call-ended", () => {
      roomRef.current = "";
      pendingMeetingRef.current = null;

      setConnection(null);
      setShareUrl("");
      setStatus("The other user ended the call.");

      window.history.replaceState(
        {},
        "",
        window.location.pathname
      );
    });

    socket.on("call-error", (data) => {
      pendingMeetingRef.current = null;
      roomRef.current = "";
      setStatus(data.message || "Call error.");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, getMeetingLink]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");

    if (room) {
      setMeetingId(room);
      setStatus("Meeting invitation detected. Click Join Meeting.");
    }
  }, [user]);

  const searchUsers = async (value: string) => {
    setSearch(value);

    if (value.trim().length < 2) {
      setUsers([]);
      return;
    }

    try {
      const response = await axiosInstance.get(
        `/user/search-users/${encodeURIComponent(value.trim())}`
      );

      setUsers(response.data);
    } catch (error) {
      console.error("User search error:", error);
      setUsers([]);
      setStatus("Unable to search users.");
    }
  };

  const startCall = async (targetUser: SearchUser) => {
    if (!socketRef.current?.connected) {
      setStatus("Calling server is not connected.");
      return;
    }

    try {
      setLoading(true);
      setStatus(`Creating a meeting for ${targetUser.name}...`);

      const response = await axiosInstance.post("/livekit/create", {});
      const data = response.data;

      const meeting: MeetingConnection = {
        roomName: data.roomName,
        token: data.token,
        serverUrl: data.serverUrl,
        role: data.role
      };

      pendingMeetingRef.current = meeting;
      roomRef.current = data.roomName;

      socketRef.current.emit("call-user", {
        targetUserId: targetUser._id,
        roomId: data.roomName
      });

      setMeetingId(data.roomName);
      setShareUrl(getMeetingLink(data.roomName));
      setStatus(`Calling ${targetUser.name}...`);
    } catch (error: any) {
      console.error("Start call error:", error);
      pendingMeetingRef.current = null;
      roomRef.current = "";

      setStatus(
        error.response?.data?.message || "Unable to start the call."
      );
    } finally {
      setLoading(false);
    }
  };

  const acceptCall = async () => {
    const call = incomingRef.current;

    if (!call || !socketRef.current?.connected) {
      setStatus("Calling server is not connected.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Joining incoming call...");

      const response = await axiosInstance.post("/livekit/token", {
        roomName: call.roomId
      });

      const data = response.data;

      const meeting: MeetingConnection = {
        roomName: data.roomName,
        token: data.token,
        serverUrl: data.serverUrl,
        role: data.role
      };

      socketRef.current.emit("accept-call", {
        roomId: call.roomId,
        callerSocketId: call.callerSocketId
      });

      roomRef.current = call.roomId;
      setConnection(meeting);
      setMeetingId(call.roomId);
      setShareUrl(getMeetingLink(call.roomId));
      setIncomingCall(null);
      incomingRef.current = null;

      setStatus("Connecting to the caller...");
    } catch (error: any) {
      console.error("Accept call error:", error);
      setStatus(
        error.response?.data?.message || "Unable to accept the call."
      );
    } finally {
      setLoading(false);
    }
  };

  const rejectCall = () => {
    const call = incomingRef.current;

    if (call) {
      socketRef.current?.emit("reject-call", {
        callerSocketId: call.callerSocketId
      });
    }

    incomingRef.current = null;
    setIncomingCall(null);
    setStatus("Call rejected.");
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        Please log in to use video calling.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-5">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">
          YourTube Video Calling
        </h1>

        <p className="text-gray-400 mb-6">{status}</p>

        {!connection ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-gray-900 rounded-xl p-5">
              <h2 className="text-xl font-semibold mb-4">
                Find Users
              </h2>

              <input
                value={search}
                onChange={(event) => searchUsers(event.target.value)}
                placeholder="Search by name or channel..."
                className="w-full rounded-lg bg-gray-800 border border-gray-700 p-3 outline-none"
              />

              <div className="mt-4 space-y-3">
                {users.map((item) => (
                  <div
                    key={item._id}
                    className="flex items-center justify-between gap-3 bg-gray-800 p-3 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.image || "/default-avatar.png"}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover"
                      />

                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {item.name}
                        </p>

                        <p className="text-sm text-gray-400 truncate">
                          {item.channelname || "User"}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => startCall(item)}
                      disabled={loading}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-lg"
                    >
                      Call
                    </button>
                  </div>
                ))}

                {search.trim().length >= 2 && users.length === 0 && (
                  <p className="text-gray-400">No users found.</p>
                )}
              </div>
            </section>

            <div className="space-y-6">
              <section className="bg-gray-900 rounded-xl p-5">
                <h2 className="text-xl font-semibold mb-3">
                  Create a Meeting
                </h2>

                <p className="text-gray-400 mb-4">
                  Create a meeting and invite up to 9 other participants.
                </p>

                <button
                  onClick={createMeeting}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-5 py-3 rounded-lg font-semibold"
                >
                  {loading ? "Please wait..." : "Create New Meeting"}
                </button>
              </section>

              <section className="bg-gray-900 rounded-xl p-5">
                <h2 className="text-xl font-semibold mb-3">
                  Join a Meeting
                </h2>

                <input
                  value={meetingId}
                  onChange={(event) => setMeetingId(event.target.value)}
                  placeholder="Enter meeting ID or paste meeting link"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 mb-4 outline-none"
                />

                <button
                  onClick={() => joinMeeting()}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 px-5 py-3 rounded-lg font-semibold"
                >
                  {loading ? "Joining..." : "Join Meeting"}
                </button>
              </section>
            </div>
          </div>
        ) : (
          <section className="bg-gray-900 rounded-xl p-4">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <div>
                <h2 className="text-xl font-semibold">
                  Meeting Room
                </h2>

                <p className="text-sm text-gray-400">
                  Meeting ID: {connection.roomName}
                </p>

                <p className="text-sm text-gray-400">
                  Role: {connection.role}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={copyMeetingLink}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
                >
                  Copy Meeting Link
                </button>

                <button
                  onClick={connection.role === "host" ? closeCall : leaveMeeting}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-lg"
                >
                  {connection.role === "host" ? "End Meeting" : "Leave Meeting"}
                </button>
              </div>
            </div>

            <div className="min-h-[70vh] overflow-hidden rounded-lg">
              <LiveKitRoom
                key={connection.roomName}
                token={connection.token}
                serverUrl={connection.serverUrl}
                connect={true}
                audio={true}
                video={true}
                onConnected={() => {
                  setStatus("Connected to YourTube meeting.");
                }}
                onDisconnected={() => {
                  roomRef.current = "";
                  setConnection(null);
                  setShareUrl("");
                  setStatus("Meeting disconnected.");
                  window.history.replaceState(
                    {},
                    "",
                    window.location.pathname
                  );
                }}
                onError={(error) => {
                  console.error("LiveKit connection error:", error);
                  setStatus(
                    "LiveKit connection failed. Check your camera, microphone and network."
                  );
                }}
                className="h-[70vh] bg-gray-950"
              >
                <div className="relative h-full w-full">
                  <VideoConference />
                  <CameraSwitchButton />
                </div>
              </LiveKitRoom>
            </div>
          </section>
        )}

        {shareUrl && !connection && (
          <section className="bg-gray-900 rounded-xl p-5 mt-6">
            <h2 className="font-semibold mb-2">
              Meeting Invitation
            </h2>

            <p className="text-sm text-gray-400 break-all mb-3">
              {shareUrl}
            </p>

            <button
              onClick={copyMeetingLink}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
            >
              Copy Link
            </button>
          </section>
        )}

        {incomingCall && !connection && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl p-6 w-full max-w-sm text-center">
              <h2 className="text-2xl font-bold mb-3">
                Incoming Call
              </h2>

              <p className="text-gray-400 mb-6">
                A user is trying to call you.
              </p>

              <div className="flex justify-center gap-4">
                <button
                  onClick={acceptCall}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 disabled:opacity-50 px-5 py-3 rounded-lg"
                >
                  Accept
                </button>

                <button
                  onClick={rejectCall}
                  disabled={loading}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50 px-5 py-3 rounded-lg"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
