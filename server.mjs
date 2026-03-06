import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);

  const io = new Server(httpServer, {
    path: "/api/socketio", // Changed path to avoid Next.js routing conflicts
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // In-memory store for chat messages
  // Structure: { groupId: [ { id, senderId, text, timestamp, deletedFor: [userIds], ... }, ... ] }
  const groupMessages = {
    "group-1": [],
    "group-2": [],
    "group-3": [],
  };

  // Keep track of online users: { socketId: userId } and { userId: socketId }
  const userSocketMap = new Map();
  const socketUserMap = new Map();

  // Track the IP associated with each userId for single-device restriction
  const userIpMap = new Map();

  // Custom groups tracking: { id, name, description, icon, members: [userIds] }
  const customGroups = new Map();

  // Active Group Calls: { groupId: [userId1, userId2, ...] }
  const activeGroupCalls = new Map();

  // Custom users tracking (edited profiles): { id: userObj }
  const customUsers = new Map();

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);
    const clientIp = socket.handshake.address;

    // Register user when they log in
    socket.on("register-user", (userId) => {
      // Single-Device restriction logic
      const existingIp = userIpMap.get(userId);
      if (existingIp && existingIp !== clientIp) {
        socket.emit("login-error", {
          message: "Account is already logged in securely on another device.",
        });
        return; // Reject registration
      }
      userIpMap.set(userId, clientIp);

      userSocketMap.set(userId, socket.id);
      socketUserMap.set(socket.id, userId);
      socket.join(`user_${userId}`);
      console.log(
        `User ${userId} registered with socket ${socket.id} from IP ${clientIp}`,
      );

      // Send them the list of custom groups they belong to
      const userCustomGroups = Array.from(customGroups.values()).filter((g) =>
        g.members.includes(userId),
      );
      socket.emit("custom-groups-list", userCustomGroups);

      // Send the list of customized user profiles
      socket.emit("custom-users-list", Array.from(customUsers.values()));
    });

    // Join group
    socket.on("join-group", (groupId) => {
      // Leave all other groups (except their own socket ID room and personal room)
      const userId = socketUserMap.get(socket.id);
      const personalRoom = `user_${userId}`;
      const rooms = Array.from(socket.rooms);
      rooms.forEach((room) => {
        if (room !== socket.id && room !== personalRoom) {
          socket.leave(room);
        }
      });

      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}`);

      // Send chat history for this group
      if (!groupMessages[groupId]) {
        groupMessages[groupId] = [];
      }

      // Filter deleted messages for specific user requesting the history
      const filteredHistory = groupMessages[groupId].filter(
        (msg) => !msg.deletedFor?.includes(socketUserMap.get(socket.id)),
      );

      // Format DM history properly if this is a DM room
      socket.emit("chat-history", filteredHistory, groupId);
    });

    // Handle incoming messages
    socket.on("send-message", (messageData) => {
      const { groupId, message } = messageData;

      // Ensure group exists
      if (!groupMessages[groupId]) {
        groupMessages[groupId] = [];
      }

      // Add timestamp and id if missing
      const newMessage = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        deletedFor: [],
        readBy: [], // Now stores: { userId: string, timestamp: number }
        deliveredTo: [], // Now stores: { userId: string, timestamp: number }
        starredBy: [],
        pinned: false,
        edited: false,
        replyToId: message.replyToId || null,
        ...message,
      };

      // Auto-mark as delivered to the sender immediately
      newMessage.deliveredTo.push({
        userId: message.senderId,
        timestamp: Date.now(),
      });

      // Save to memory
      groupMessages[groupId].push(newMessage);

      // Keep only last 100 messages to prevent memory leak
      if (groupMessages[groupId].length > 100) {
        groupMessages[groupId].shift();
      }

      // Check if it's a direct message (dm_user1_user2)
      if (groupId.startsWith("dm_")) {
        // Extract both users from dm_user1_user2
        const users = groupId.replace("dm_", "").split("_");

        // Find if they are online and send specifically to them
        users.forEach((userId) => {
          io.to(`user_${userId}`).emit("receive-message", newMessage, groupId);
        });
      } else {
        // Normal group broadcast
        io.to(groupId).emit("receive-message", newMessage, groupId);
      }
    });

    // Handle delete messages
    socket.on("delete-message", ({ messageId, groupId, type, userId }) => {
      // Find the group and message
      if (!groupMessages[groupId]) return;

      const messageIndex = groupMessages[groupId].findIndex(
        (msg) => msg.id === messageId,
      );

      if (messageIndex === -1) return;

      const message = groupMessages[groupId][messageIndex];

      if (type === "everyone") {
        // Verify the user owns the message before deleting for everyone
        if (message.senderId === userId) {
          // Remove message completely
          groupMessages[groupId].splice(messageIndex, 1);

          if (groupId.startsWith("dm_")) {
            // In DMs emit to both parties
            const users = groupId.replace("dm_", "").split("_");
            users.forEach((uId) => {
              io.to(`user_${uId}`).emit("message-deleted", {
                messageId,
                groupId,
              });
            });
          } else {
            // Broadcast to the whole group
            io.to(groupId).emit("message-deleted", { messageId, groupId });
          }
        }
      } else if (type === "me") {
        // Track that this user deleted it for themselves
        if (!message.deletedFor) {
          message.deletedFor = [];
        }

        if (!message.deletedFor.includes(userId)) {
          message.deletedFor.push(userId);
        }

        // Let the specific user's socket know to remove it
        io.to(`user_${userId}`).emit("message-deleted-for-me", {
          messageId,
          groupId,
        });
      }
    });

    // Handle Edit Message
    socket.on("edit-message", ({ messageId, groupId, newText }) => {
      if (!groupMessages[groupId]) return;
      const msg = groupMessages[groupId].find((m) => m.id === messageId);
      if (msg) {
        msg.text = newText;
        msg.edited = true;

        if (groupId.startsWith("dm_")) {
          const users = groupId.replace("dm_", "").split("_");
          users.forEach((uId) => {
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

    // Handle Star Message
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

    // Handle Pin Message
    socket.on("pin-message", ({ messageId, groupId, pinned }) => {
      if (!groupMessages[groupId]) return;
      const msg = groupMessages[groupId].find((m) => m.id === messageId);
      if (msg) {
        msg.pinned = pinned;

        if (groupId.startsWith("dm_")) {
          const users = groupId.replace("dm_", "").split("_");
          users.forEach((uId) => {
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

    // Handle Mark Delivered
    socket.on("mark-delivered", ({ groupId, userId }) => {
      if (!groupMessages[groupId]) return;
      let updated = false;
      const updatedMessages = [];

      groupMessages[groupId].forEach((msg) => {
        // Only mark if we haven't marked as delivered yet
        if (!msg.deliveredTo) msg.deliveredTo = [];
        if (!msg.deliveredTo.find((d) => d.userId === userId)) {
          msg.deliveredTo.push({ userId, timestamp: Date.now() });
          updated = true;
          updatedMessages.push(msg);
        }
      });

      if (updated) {
        if (groupId.startsWith("dm_")) {
          const users = groupId.replace("dm_", "").split("_");
          users.forEach((uId) => {
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

    // Handle Read Receipts
    socket.on("mark-read", ({ groupId, userId }) => {
      if (!groupMessages[groupId]) return;
      let updated = false;
      const updatedMessages = [];

      groupMessages[groupId].forEach((msg) => {
        // Only mark if we didn't send it, and haven't read it yet
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
          const users = groupId.replace("dm_", "").split("_");
          users.forEach((uId) => {
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

    // Create a new custom group
    socket.on("create-group", (groupData) => {
      const { id, name, description, icon, members } = groupData;

      const newGroup = { id, name, description, icon, members };
      customGroups.set(id, newGroup);
      groupMessages[id] = []; // Initialize empty message list

      // Notify all invited members
      members.forEach((userId) => {
        io.to(`user_${userId}`).emit("group-created", newGroup);
      });
    });

    // --- WebRTC Signaling ---

    // Initiating a call
    socket.on("call-user", ({ targetId, callerId, type, groupId }) => {
      if (groupId && groupId.startsWith("group-")) {
        // Initialize active call tracking
        activeGroupCalls.set(groupId, [callerId]);
        // Broadcast to group members, excluding self
        socket
          .to(groupId)
          .emit("incoming-call", { callerId, type, groupId, targetId: null });
      } else {
        // DM
        io.to(`user_${targetId}`).emit("incoming-call", {
          callerId,
          type,
          groupId,
          targetId,
        });
      }
    });

    socket.on("join-group-call", ({ joinerId, groupId }) => {
      // Append user to active call
      let members = activeGroupCalls.get(groupId) || [];
      if (!members.includes(joinerId)) {
        members.push(joinerId);
        activeGroupCalls.set(groupId, members);
      }
      // Inform everyone ELSE already in the call to send an offer to the joiner
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
      // DM only. Group calls use join-group-call.
      io.to(`user_${targetId}`).emit("call-accepted", {
        targetId,
        answererId,
        groupId,
      });
    });

    socket.on("call-rejected", ({ targetId, rejecterId, groupId }) => {
      // Typically DM only, but we could broadcast it.
      if (groupId && groupId.startsWith("group-")) {
        io.to(`user_${targetId}`).emit("call-rejected", {
          targetId: callerId,
          rejecterId,
          groupId,
        }); // Wait, targeted to Caller
      } else {
        io.to(`user_${targetId}`).emit("call-rejected", {
          targetId,
          rejecterId,
          groupId,
        });
      }
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
        // Remove from active call
        let members = activeGroupCalls.get(groupId) || [];
        members = members.filter((id) => id !== humperId);
        if (members.length === 0) {
          activeGroupCalls.delete(groupId); // Call ends globally
        } else {
          activeGroupCalls.set(groupId, members);
        }
        io.to(groupId).emit("call-hungup", {
          targetId: null,
          humperId: humperId,
          groupId,
        });
      } else if (targetId) {
        io.to(`user_${targetId}`).emit("call-hungup", {
          targetId,
          humperId: humperId,
          groupId,
        });
      }
    });

    // Handle Edit Profile updates
    socket.on("update-profile", (userProfile) => {
      customUsers.set(userProfile.id, userProfile);
      // Broadcast to everyone connected
      io.emit("profile-updated", userProfile);
    });

    // Handle Demo Reset
    socket.on("reset-demo", () => {
      // Clear all messages
      for (const groupId in groupMessages) {
        groupMessages[groupId] = [];
      }
      // Clear custom users
      customUsers.clear();
      userIpMap.clear();

      console.log("Demo reset initiated. All messages cleared.");
      // Tell all clients to wipe their screens
      io.emit("demo-reset");
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
      const userId = socketUserMap.get(socket.id);
      if (userId) {
        userSocketMap.delete(userId);
        socketUserMap.delete(socket.id);
        // Note: we don't drop the userIpMap automatically so they can reload safely over their own IP
      }
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
