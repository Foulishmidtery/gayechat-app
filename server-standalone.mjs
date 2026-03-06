/**
 * Standalone Socket.IO server for deployment on Render/Railway.
 * This is a pure Node.js HTTP server (no Next.js).
 * Deploy this separately, then set NEXT_PUBLIC_SOCKET_URL on Vercel
 * to the Render URL (e.g. https://gayechat-server.onrender.com).
 *
 * Local dev still uses server.mjs (which includes Next.js).
 */
import { createServer } from "node:http";
import { Server } from "socket.io";
import crypto from "node:crypto";

const port = process.env.PORT || 4000;

const httpServer = createServer((req, res) => {
  // Simple health check endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }
  res.writeHead(200);
  res.end("GayeChat Socket Server is running.");
});

const io = new Server(httpServer, {
  path: "/api/socketio",
  addTrailingSlash: false,
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ===== In-memory stores (same as server.mjs) =====
const groupMessages = {
  "group-1": [],
  "group-2": [],
  "group-3": [],
};

const userSocketMap = new Map();
const socketUserMap = new Map();
const userIpMap = new Map();
const customGroups = new Map();
const activeGroupCalls = new Map();
const customUsers = new Map();

// ===== Socket.IO Logic =====
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);
  const clientIp = socket.handshake.address;

  socket.on("register-user", (userId) => {
    const existingIp = userIpMap.get(userId);
    if (existingIp && existingIp !== clientIp) {
      socket.emit("login-error", {
        message: "Account is already logged in on another device.",
      });
      return;
    }
    userIpMap.set(userId, clientIp);
    userSocketMap.set(userId, socket.id);
    socketUserMap.set(socket.id, userId);
    socket.join(`user_${userId}`);
    console.log(`User ${userId} registered from IP ${clientIp}`);

    const userCustomGroups = Array.from(customGroups.values()).filter((g) =>
      g.members.includes(userId),
    );
    socket.emit("custom-groups-list", userCustomGroups);
    socket.emit("custom-users-list", Array.from(customUsers.values()));
  });

  socket.on("join-group", (groupId) => {
    const userId = socketUserMap.get(socket.id);
    const personalRoom = `user_${userId}`;
    const rooms = Array.from(socket.rooms);
    rooms.forEach((room) => {
      if (room !== socket.id && room !== personalRoom) socket.leave(room);
    });
    socket.join(groupId);
    if (!groupMessages[groupId]) groupMessages[groupId] = [];
    const filteredHistory = groupMessages[groupId].filter(
      (msg) => !msg.deletedFor?.includes(socketUserMap.get(socket.id)),
    );
    socket.emit("chat-history", filteredHistory, groupId);
  });

  socket.on("send-message", (messageData) => {
    const { groupId, message } = messageData;
    if (!groupMessages[groupId]) groupMessages[groupId] = [];
    const newMessage = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      deletedFor: [],
      readBy: [],
      deliveredTo: [],
      starredBy: [],
      pinned: false,
      edited: false,
      replyToId: message.replyToId || null,
      ...message,
    };
    newMessage.deliveredTo.push({
      userId: message.senderId,
      timestamp: Date.now(),
    });
    groupMessages[groupId].push(newMessage);
    if (groupMessages[groupId].length > 100) groupMessages[groupId].shift();

    if (groupId.startsWith("dm_")) {
      const users = groupId.replace("dm_", "").split("_");
      users.forEach((userId) => {
        io.to(`user_${userId}`).emit("receive-message", newMessage, groupId);
      });
    } else {
      io.to(groupId).emit("receive-message", newMessage, groupId);
    }
  });

  socket.on("delete-message", ({ messageId, groupId, type, userId }) => {
    if (!groupMessages[groupId]) return;
    const messageIndex = groupMessages[groupId].findIndex(
      (msg) => msg.id === messageId,
    );
    if (messageIndex === -1) return;
    const message = groupMessages[groupId][messageIndex];

    if (type === "everyone" && message.senderId === userId) {
      groupMessages[groupId].splice(messageIndex, 1);
      if (groupId.startsWith("dm_")) {
        groupId
          .replace("dm_", "")
          .split("_")
          .forEach((uId) => {
            io.to(`user_${uId}`).emit("message-deleted", {
              messageId,
              groupId,
            });
          });
      } else {
        io.to(groupId).emit("message-deleted", { messageId, groupId });
      }
    } else if (type === "me") {
      if (!message.deletedFor) message.deletedFor = [];
      if (!message.deletedFor.includes(userId)) message.deletedFor.push(userId);
      io.to(`user_${userId}`).emit("message-deleted-for-me", {
        messageId,
        groupId,
      });
    }
  });

  socket.on("edit-message", ({ messageId, groupId, newText }) => {
    if (!groupMessages[groupId]) return;
    const msg = groupMessages[groupId].find((m) => m.id === messageId);
    if (msg) {
      msg.text = newText;
      msg.edited = true;
      if (groupId.startsWith("dm_")) {
        groupId
          .replace("dm_", "")
          .split("_")
          .forEach((uId) => {
            io.to(`user_${uId}`).emit("message-updated", {
              groupId,
              message: msg,
            });
          });
      } else {
        io.to(groupId).emit("message-updated", { groupId, message: msg });
      }
    }
  });

  socket.on("star-message", ({ messageId, groupId, userId }) => {
    if (!groupMessages[groupId]) return;
    const msg = groupMessages[groupId].find((m) => m.id === messageId);
    if (msg) {
      if (!msg.starredBy) msg.starredBy = [];
      if (msg.starredBy.includes(userId)) {
        msg.starredBy = msg.starredBy.filter((id) => id !== userId);
      } else {
        msg.starredBy.push(userId);
      }
      io.to(`user_${userId}`).emit("message-updated", {
        groupId,
        message: msg,
      });
    }
  });

  socket.on("pin-message", ({ messageId, groupId, pinned }) => {
    if (!groupMessages[groupId]) return;
    const msg = groupMessages[groupId].find((m) => m.id === messageId);
    if (msg) {
      msg.pinned = pinned;
      if (groupId.startsWith("dm_")) {
        groupId
          .replace("dm_", "")
          .split("_")
          .forEach((uId) => {
            io.to(`user_${uId}`).emit("message-updated", {
              groupId,
              message: msg,
            });
          });
      } else {
        io.to(groupId).emit("message-updated", { groupId, message: msg });
      }
    }
  });

  socket.on("mark-delivered", ({ groupId, userId }) => {
    if (!groupMessages[groupId]) return;
    let updated = false;
    const updatedMessages = [];
    groupMessages[groupId].forEach((msg) => {
      if (!msg.deliveredTo) msg.deliveredTo = [];
      if (!msg.deliveredTo.find((d) => d.userId === userId)) {
        msg.deliveredTo.push({ userId, timestamp: Date.now() });
        updated = true;
        updatedMessages.push(msg);
      }
    });
    if (updated) {
      if (groupId.startsWith("dm_")) {
        groupId
          .replace("dm_", "")
          .split("_")
          .forEach((uId) => {
            io.to(`user_${uId}`).emit("messages-updated", {
              groupId,
              messages: updatedMessages,
            });
          });
      } else {
        io.to(groupId).emit("messages-updated", {
          groupId,
          messages: updatedMessages,
        });
      }
    }
  });

  socket.on("mark-read", ({ groupId, userId }) => {
    if (!groupMessages[groupId]) return;
    let updated = false;
    const updatedMessages = [];
    groupMessages[groupId].forEach((msg) => {
      if (msg.senderId !== userId) {
        if (!msg.readBy) msg.readBy = [];
        if (!msg.readBy.find((r) => r.userId === userId)) {
          msg.readBy.push({ userId, timestamp: Date.now() });
          updated = true;
          updatedMessages.push(msg);
        }
      }
    });
    if (updated) {
      if (groupId.startsWith("dm_")) {
        groupId
          .replace("dm_", "")
          .split("_")
          .forEach((uId) => {
            io.to(`user_${uId}`).emit("messages-updated", {
              groupId,
              messages: updatedMessages,
            });
          });
      } else {
        io.to(groupId).emit("messages-updated", {
          groupId,
          messages: updatedMessages,
        });
      }
    }
  });

  socket.on("create-group", (groupData) => {
    const { id, name, description, icon, members } = groupData;
    const newGroup = { id, name, description, icon, members };
    customGroups.set(id, newGroup);
    groupMessages[id] = [];
    members.forEach((userId) => {
      io.to(`user_${userId}`).emit("group-created", newGroup);
    });
  });

  // --- WebRTC Signaling ---
  socket.on("call-user", ({ targetId, callerId, type, groupId }) => {
    if (groupId && groupId.startsWith("group-")) {
      activeGroupCalls.set(groupId, [callerId]);
      socket
        .to(groupId)
        .emit("incoming-call", { callerId, type, groupId, targetId: null });
    } else {
      io.to(`user_${targetId}`).emit("incoming-call", {
        callerId,
        type,
        groupId,
        targetId,
      });
    }
  });

  socket.on("join-group-call", ({ joinerId, groupId }) => {
    let members = activeGroupCalls.get(groupId) || [];
    if (!members.includes(joinerId)) {
      members.push(joinerId);
      activeGroupCalls.set(groupId, members);
    }
    members.forEach((userId) => {
      if (userId !== joinerId) {
        io.to(`user_${userId}`).emit("user-joined-call", {
          newUserId: joinerId,
          groupId,
        });
      }
    });
  });

  socket.on("call-accepted", ({ targetId, answererId, groupId }) => {
    io.to(`user_${targetId}`).emit("call-accepted", {
      targetId,
      answererId,
      groupId,
    });
  });

  socket.on("call-rejected", ({ targetId, rejecterId, groupId }) => {
    io.to(`user_${targetId}`).emit("call-rejected", {
      targetId,
      rejecterId,
      groupId,
    });
  });

  socket.on("webrtc-offer", ({ targetId, callerId, sdp, groupId }) => {
    io.to(`user_${targetId}`).emit("webrtc-offer", {
      targetId,
      callerId,
      sdp,
      groupId,
    });
  });

  socket.on("webrtc-answer", ({ targetId, answererId, sdp, groupId }) => {
    io.to(`user_${targetId}`).emit("webrtc-answer", {
      targetId,
      answererId,
      sdp,
      groupId,
    });
  });

  socket.on(
    "webrtc-ice-candidate",
    ({ targetId, senderId, candidate, groupId }) => {
      io.to(`user_${targetId}`).emit("webrtc-ice-candidate", {
        targetId,
        senderId,
        candidate,
        groupId,
      });
    },
  );

  socket.on("call-hungup", ({ targetId, humperId, groupId }) => {
    if (groupId && groupId.startsWith("group-")) {
      let members = activeGroupCalls.get(groupId) || [];
      members = members.filter((id) => id !== humperId);
      if (members.length === 0) activeGroupCalls.delete(groupId);
      else activeGroupCalls.set(groupId, members);
      io.to(groupId).emit("call-hungup", { targetId: null, humperId, groupId });
    } else if (targetId) {
      io.to(`user_${targetId}`).emit("call-hungup", {
        targetId,
        humperId,
        groupId,
      });
    }
  });

  socket.on("update-profile", (userProfile) => {
    customUsers.set(userProfile.id, userProfile);
    io.emit("profile-updated", userProfile);
  });

  socket.on("reset-demo", () => {
    for (const groupId in groupMessages) groupMessages[groupId] = [];
    customUsers.clear();
    userIpMap.clear();
    console.log("Demo reset initiated.");
    io.emit("demo-reset");
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const userId = socketUserMap.get(socket.id);
    if (userId) {
      userSocketMap.delete(userId);
      socketUserMap.delete(socket.id);
    }
  });
});

httpServer.listen(port, () => {
  console.log(`> GayeChat Socket Server running on port ${port}`);
});
