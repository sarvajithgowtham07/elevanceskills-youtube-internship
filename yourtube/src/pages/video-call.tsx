
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
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

export default function VideoCall() {
  const { user } = useUser();

  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [status, setStatus] = useState("Search for a user to start a video call");
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [loading, setLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const roomRef = useRef("");
  const targetSocketRef = useRef("");
  const incomingRef = useRef<IncomingCall | null>(null);
  const initiatorRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const createPeer = useCallback(() => {
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    peerRef.current = peer;

    localStreamRef.current?.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current!);
    });

    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomRef.current) {
        socketRef.current.emit("ice-candidate", {
          roomId: roomRef.current,
          targetSocketId: targetSocketRef.current,
          candidate: event.candidate,
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStatus("Connected");
      }

      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "disconnected"
      ) {
        setStatus("Connection interrupted");
      }
    };

    return peer;
  }, []);

  const getMedia = async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    return stream;
  };

  const closeCall = useCallback((notify = true) => {
    if (notify && socketRef.current && roomRef.current) {
      socketRef.current.emit("end-call", {
        roomId: roomRef.current,
      });
    }

    peerRef.current?.close();
    peerRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    roomRef.current = "";
    targetSocketRef.current = "";
    pendingCandidatesRef.current = [];
    incomingRef.current = null;
    initiatorRef.current = false;

    setIncomingCall(null);
    setInCall(false);
    setMuted(false);
    setCameraOff(false);
    setStatus("Call ended");
  }, []);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("token");

    if (!token) {
      setStatus("Please log in again");
      return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

    if (!backendUrl) {
      setStatus("Backend URL is not configured");
      return;
    }

    const socket = io(backendUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("Ready to make a call");
    });

    socket.on("connect_error", (error) => {
      setStatus(error.message || "Unable to connect to calling server");
    });

    socket.on("incoming-call", (data: IncomingCall) => {
      incomingRef.current = data;
      setIncomingCall(data);
      setStatus("Incoming video call");
    });

    socket.on("call-accepted", async ({ roomId, targetSocketId }) => {
      roomRef.current = roomId;
      targetSocketRef.current = targetSocketId;

      if (!initiatorRef.current) return;

      try {
        const peer = createPeer();
        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("call-offer", {
          roomId,
          targetSocketId,
          offer,
        });

        setStatus("Calling...");
      } catch (error) {
        console.error("Offer creation error:", error);
        setStatus("Could not start the call");
      }
    });

    socket.on("call-offer", async ({ offer, fromSocketId, roomId }) => {
      try {
        roomRef.current = roomId;
        targetSocketRef.current = fromSocketId;

        const peer = peerRef.current || createPeer();

        await peer.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("call-answer", {
          roomId,
          targetSocketId: fromSocketId,
          answer,
        });

        for (const candidate of pendingCandidatesRef.current) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }

        pendingCandidatesRef.current = [];
        setStatus("Connecting...");
      } catch (error) {
        console.error("Answer creation error:", error);
        setStatus("Could not answer the call");
      }
    });

    socket.on("call-answer", async ({ answer }) => {
      try {
        const peer = peerRef.current;

        if (!peer || peer.signalingState !== "have-local-offer") {
          return;
        }

        await peer.setRemoteDescription(
          new RTCSessionDescription(answer)
        );

        for (const candidate of pendingCandidatesRef.current) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }

        pendingCandidatesRef.current = [];
        setStatus("Connecting...");
      } catch (error) {
        console.error("Remote answer error:", error);
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (!peerRef.current?.remoteDescription) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }

        await peerRef.current.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error("ICE candidate error:", error);
      }
    });

    socket.on("call-rejected", () => {
      closeCall(false);
      setStatus("Your call was rejected");
    });

    socket.on("call-ended", () => {
      closeCall(false);
      setStatus("The other user ended the call");
    });

    socket.on("call-error", (data) => {
      setStatus(data.message || "Call error");
    });

    return () => {
      closeCall(false);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, closeCall, createPeer]);

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
      setStatus("Unable to search users");
    }
  };

  const startCall = async (targetUser: SearchUser) => {
    if (!socketRef.current?.connected) {
      setStatus("Calling server is not connected");
      return;
    }

    try {
      setLoading(true);
      await getMedia();

      roomRef.current = crypto.randomUUID();
      initiatorRef.current = true;
      setInCall(true);
      setStatus(`Calling ${targetUser.name}...`);

      socketRef.current.emit("call-user", {
        targetUserId: targetUser._id,
        roomId: roomRef.current,
      });
    } catch (error) {
      console.error("Media access error:", error);
      setStatus("Allow camera and microphone access to make a call");
      closeCall(false);
    } finally {
      setLoading(false);
    }
  };

  const acceptCall = async () => {
    const call = incomingRef.current;

    if (!call || !socketRef.current?.connected) return;

    try {
      setLoading(true);
      await getMedia();

      roomRef.current = call.roomId;
      targetSocketRef.current = call.callerSocketId;
      initiatorRef.current = false;
      setIncomingCall(null);
      setInCall(true);

      socketRef.current.emit("accept-call", {
        roomId: call.roomId,
        callerSocketId: call.callerSocketId,
      });

      setStatus("Joining call...");
    } catch (error) {
      console.error("Accept call error:", error);
      setStatus("Allow camera and microphone access to accept");
      closeCall(false);
    } finally {
      setLoading(false);
    }
  };

  const rejectCall = () => {
    const call = incomingRef.current;

    if (call) {
      socketRef.current?.emit("reject-call", {
        callerSocketId: call.callerSocketId,
      });
    }

    incomingRef.current = null;
    setIncomingCall(null);
    setStatus("Call rejected");
  };

  const toggleMute = () => {
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    audioTracks.forEach((track) => {
      track.enabled = muted;
    });
    setMuted(!muted);
  };

  const toggleCamera = () => {
    const videoTracks = localStreamRef.current?.getVideoTracks() || [];
    videoTracks.forEach((track) => {
      track.enabled = cameraOff;
    });
    setCameraOff(!cameraOff);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Please log in to use video calling.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-5">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Video Calling</h1>
        <p className="text-gray-400 mb-6">{status}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-xl font-semibold mb-4">Find Users</h2>

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
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-sm text-gray-400 truncate">
                        {item.channelname || "User"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => startCall(item)}
                    disabled={loading || inCall}
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

          <section className="bg-gray-900 rounded-xl p-5">
            <h2 className="text-xl font-semibold mb-4">Call Window</h2>

            <div className="grid grid-cols-1 gap-4">
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded">
                  Remote User
                </span>
              </div>

              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded">
                  You
                </span>
              </div>
            </div>

            {inCall && (
              <div className="flex flex-wrap justify-center gap-3 mt-5">
                <button
                  onClick={toggleMute}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>

                <button
                  onClick={toggleCamera}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-lg"
                >
                  {cameraOff ? "Camera On" : "Camera Off"}
                </button>

                <button
                  onClick={() => closeCall()}
                  className="bg-red-600 hover:bg-red-700 px-5 py-3 rounded-lg"
                >
                  End Call
                </button>
              </div>
            )}
          </section>
        </div>

        {incomingCall && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl p-6 w-full max-w-sm text-center">
              <h2 className="text-2xl font-bold mb-3">Incoming Call</h2>
              <p className="text-gray-400 mb-6">
                A user is trying to call you.
              </p>

              <div className="flex justify-center gap-4">
                <button
                  onClick={acceptCall}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 px-5 py-3 rounded-lg"
                >
                  Accept
                </button>

                <button
                  onClick={rejectCall}
                  className="bg-red-600 hover:bg-red-700 px-5 py-3 rounded-lg"
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
