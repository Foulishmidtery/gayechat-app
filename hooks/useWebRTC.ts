import { useState, useEffect, useRef, useCallback } from "react";
import { Socket } from "socket.io-client";

export interface CallConfig {
  type: "video" | "voice";
  targetId: string; // The person we are calling OR the group ID
  groupId: string | null; // The associated group or dm ID context
}

export function useWebRTC(socket: Socket | null, currentUser: any) {
  // Streams mapped by User ID
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Call States
  const [isCalling, setIsCalling] = useState(false);
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [activeCall, setActiveCall] = useState<CallConfig | null>(null);
  const [incomingCallData, setIncomingCallData] = useState<any>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // RTCPeerConnections mapped by remote User ID for mesh networking
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // Turn servers would go here in production
    ],
  };

  const getLocalMedia = async (type: "video" | "voice") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === "video",
        audio: true,
      });
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error("Failed to get local media", err);
      return null;
    }
  };

  const createPeerConnection = (
    targetUserId: string,
    groupId: string | null,
  ) => {
    if (peerConnections.current[targetUserId])
      return peerConnections.current[targetUserId];

    const pc = new RTCPeerConnection(iceServers);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit("webrtc-ice-candidate", {
          targetId: targetUserId,
          senderId: currentUser.id,
          candidate: event.candidate,
          groupId,
        });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams((prev) => ({
        ...prev,
        [targetUserId]: event.streams[0],
      }));
    };

    pc.oniceconnectionstatechange = () => {
      if (
        pc.iceConnectionState === "disconnected" ||
        pc.iceConnectionState === "failed" ||
        pc.iceConnectionState === "closed"
      ) {
        endCall();
      }
    };

    peerConnections.current[targetUserId] = pc;
    return pc;
  };

  const startCall = async (config: CallConfig) => {
    const stream = await getLocalMedia(config.type);
    if (!stream) return;

    setActiveCall(config);
    setIsCalling(true);

    if (socket) {
      socket.emit("call-user", {
        targetId: config.targetId,
        callerId: currentUser.id,
        type: config.type,
        groupId: config.groupId,
      });
    }
  };

  const acceptCall = async () => {
    if (!incomingCallData) return;

    const stream = await getLocalMedia(incomingCallData.type);
    if (!stream) return;

    setActiveCall({
      type: incomingCallData.type,
      targetId: incomingCallData.callerId,
      groupId: incomingCallData.groupId,
    });

    setIsReceivingCall(false);

    if (socket) {
      if (
        incomingCallData.groupId &&
        incomingCallData.groupId.startsWith("group-")
      ) {
        socket.emit("join-group-call", {
          joinerId: currentUser.id,
          groupId: incomingCallData.groupId,
        });
      } else {
        socket.emit("call-accepted", {
          targetId: incomingCallData.callerId,
          answererId: currentUser.id,
          groupId: incomingCallData.groupId,
        });
      }
    }
  };

  const rejectCall = () => {
    if (socket && incomingCallData) {
      socket.emit("call-rejected", {
        targetId: incomingCallData.callerId,
        rejecterId: currentUser.id,
        groupId: incomingCallData.groupId,
      });
    }
    setIsReceivingCall(false);
    setIncomingCallData(null);
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const endCall = useCallback(() => {
    // Close all peer connections
    Object.values(peerConnections.current).forEach((pc) => pc.close());
    peerConnections.current = {};

    // Stop local media
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    if (socket && activeCall) {
      socket.emit("call-hungup", {
        targetId: activeCall.targetId,
        humperId: currentUser.id,
        groupId: activeCall.groupId,
      });
    }

    setLocalStream(null);
    setRemoteStreams({});
    setActiveCall(null);
    setIsCalling(false);
    setIsReceivingCall(false);
    setIncomingCallData(null);
    setIsMuted(false);
    setIsVideoOff(false);
  }, [localStream, socket, activeCall, currentUser.id]);

  // Handle Signaling
  useEffect(() => {
    if (!socket) return;

    socket.on("incoming-call", (data) => {
      setIncomingCallData(data);
      setIsReceivingCall(true);
    });

    socket.on("call-accepted", async ({ answererId, groupId }) => {
      // The person we called accepted. We must create the Offer.
      const pc = createPeerConnection(answererId, groupId);

      if (localStream) {
        localStream
          .getTracks()
          .forEach((track) => pc.addTrack(track, localStream));
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", {
          targetId: answererId,
          callerId: currentUser.id,
          sdp: offer,
          groupId,
        });
      } catch (e) {
        console.error("Error creating offer", e);
      }
    });

    socket.on("user-joined-call", async ({ newUserId, groupId }) => {
      // In a group, someone joined our active call. Act as Caller and send them an offer.
      const pc = createPeerConnection(newUserId, groupId);

      if (localStream) {
        localStream
          .getTracks()
          .forEach((track) => pc.addTrack(track, localStream));
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc-offer", {
          targetId: newUserId,
          callerId: currentUser.id,
          sdp: offer,
          groupId,
        });
      } catch (e) {
        console.error("Error creating offer", e);
      }
    });

    socket.on("webrtc-offer", async ({ callerId, sdp, groupId }) => {
      // If we accepted the call, we'll receive an offer to answer.
      const pc = createPeerConnection(callerId, groupId);

      if (localStream) {
        localStream
          .getTracks()
          .forEach((track) => pc.addTrack(track, localStream));
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("webrtc-answer", {
          targetId: callerId,
          answererId: currentUser.id,
          sdp: answer,
          groupId,
        });
      } catch (e) {
        console.error("Error handling offer", e);
      }
    });

    socket.on("webrtc-answer", async ({ answererId, sdp }) => {
      // We made the offer, and they replied with an answer.
      const pc = peerConnections.current[answererId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (e) {
          console.error("Error setting remote desc", e);
        }
      }
    });

    socket.on("webrtc-ice-candidate", async ({ senderId, candidate }) => {
      const pc = peerConnections.current[senderId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding ice candidate", e);
        }
      }
    });

    socket.on("call-rejected", () => {
      endCall();
      alert("Call was declined.");
    });

    socket.on("call-hungup", ({ humperId }) => {
      // If a specific user hung up, close their PC
      if (humperId && peerConnections.current[humperId]) {
        peerConnections.current[humperId].close();
        delete peerConnections.current[humperId];
        setRemoteStreams((prev) => {
          const newStreams = { ...prev };
          delete newStreams[humperId];
          return newStreams;
        });
        // If it was a 1-1 call and they hung up, end the call
        if (activeCall && !activeCall.groupId?.startsWith("group-")) {
          endCall();
        }
      } else {
        endCall();
      }
    });

    return () => {
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("user-joined-call");
      socket.off("call-rejected");
      socket.off("webrtc-offer");
      socket.off("webrtc-answer");
      socket.off("webrtc-ice-candidate");
      socket.off("call-hungup");
    };
  }, [socket, localStream, currentUser.id, endCall, activeCall]);

  return {
    localStream,
    remoteStreams,
    isCalling,
    isReceivingCall,
    activeCall,
    incomingCallData,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  };
}
