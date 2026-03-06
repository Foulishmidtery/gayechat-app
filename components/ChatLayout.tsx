"use client";

import { useEffect, useState, useRef } from "react";
import { User, Group, DUMMY_GROUPS, DUMMY_USERS } from "../lib/dummyData";
import { useSocket } from "./SocketProvider";
import { motion, AnimatePresence } from "framer-motion";
import { Send, LogOut, Users, Activity, Plus, Search, Smile, Phone, Video } from "lucide-react";
import * as LucideIcons from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { cn } from "../lib/utils";
import CreateGroupModal from "./CreateGroupModal";
import EditProfileModal from "./EditProfileModal";
import CallModal from "./CallModal";
import IncomingCallAlert from "./IncomingCallAlert";
import { useWebRTC } from "../hooks/useWebRTC";

interface ChatMessage {
    id: string;
    senderId: string;
    text: string;
    timestamp: number;
    deletedFor?: string[];
    readBy?: { userId: string; timestamp: number }[];
    deliveredTo?: { userId: string; timestamp: number }[];
    starredBy?: string[];
    pinned?: boolean;
    edited?: boolean;
    replyToId?: string | null;
}

interface ChatLayoutProps {
    currentUser: User;
    onUpdateUser: (user: User) => void;
    onLogout: () => void;
}

export default function ChatLayout({ currentUser, onUpdateUser, onLogout }: ChatLayoutProps) {
    const { socket, isConnected } = useSocket();

    // WebRTC hook for 1-1 and Group Calls
    const webrtc = useWebRTC(socket, currentUser);

    // Combine static and custom groups
    // Combine static and custom groups
    const [customGroups, setCustomGroups] = useState<Group[]>([]);
    const allGroups = [...DUMMY_GROUPS, ...customGroups];

    // Track dynamic user profiles
    const [customUsers, setCustomUsers] = useState<User[]>([]);
    const allUsers = DUMMY_USERS.map(u => customUsers.find(cu => cu.id === u.id) || u);

    const [activeChatId, setActiveChatId] = useState<string>(DUMMY_GROUPS[0].id);
    const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
    const [inputValue, setInputValue] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

    // Header actions states
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [msgSearchQuery, setMsgSearchQuery] = useState("");
    const [isInfoOpen, setIsInfoOpen] = useState(false);

    // Emoji picker state
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    // Message Actions State
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
    const [infoMessageId, setInfoMessageId] = useState<string | null>(null);

    const toggleSelection = (id: string) => {
        setSelectedMessageIds(prev =>
            prev.includes(id) ? prev.filter(mId => mId !== id) : [...prev, id]
        );
    };

    const handleBulkAction = (action: "delete" | "star") => {
        selectedMessageIds.forEach(id => {
            if (action === "delete") {
                handleDeleteMessage(id, "me");
            } else if (action === "star") {
                socket?.emit('star-message', { messageId: id, groupId: activeChatId, userId: currentUser.id });
            }
        });
        setIsSelectMode(false);
        setSelectedMessageIds([]);
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const messageActionsRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        // Clear unread count when viewing the active chat
        if (unreadCounts[activeChatId]) {
            setUnreadCounts(prev => ({ ...prev, [activeChatId]: 0 }));
        }
    }, [messages, activeChatId, unreadCounts]);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        // Register current user on connection to get their custom groups
        socket.emit("register-user", currentUser.id);

        const onConnect = () => {
            socket.emit("register-user", currentUser.id);
        };
        socket.on("connect", onConnect);

        socket.on("custom-groups-list", (groups: Group[]) => {
            setCustomGroups(groups);
        });

        socket.on("custom-users-list", (users: User[]) => {
            setCustomUsers(users);
        });

        socket.on("profile-updated", (updatedUser: User) => {
            setCustomUsers((prev) => {
                const existing = prev.find(u => u.id === updatedUser.id);
                if (existing) {
                    return prev.map(u => u.id === updatedUser.id ? updatedUser : u);
                }
                return [...prev, updatedUser];
            });
            // Update local current user state if it's us and we received it from another socket
            if (updatedUser.id === currentUser.id) {
                onUpdateUser(updatedUser);
            }
        });

        socket.on("group-created", (newGroup: Group) => {
            setCustomGroups((prev) => {
                if (!prev.find(g => g.id === newGroup.id)) {
                    return [...prev, newGroup];
                }
                return prev;
            });
            // Auto join if they are part of it
            if (newGroup.members && newGroup.members.includes(currentUser.id)) {
                socket.emit("join-group", newGroup.id);
            }
        });

        socket.on("chat-history", (history: ChatMessage[], roomId: string) => {
            // Since the server sends raw history on join, we map it to the requested room
            setMessages((prev) => ({
                ...prev,
                [activeChatId]: history,
            }));
        });

        socket.on("receive-message", (msg: ChatMessage, roomId?: string) => {
            // Find which room this message belongs to. The server currently broadcast to the room.
            // When building the backend we just passed the msg. We should update server to send roomId too.
            // For now if roomId is passed use it, else fallback to activeChatId (will fix server side next)
            const targetRoom = roomId || activeChatId;

            setMessages((prev) => {
                const groupMsgs = prev[targetRoom] || [];
                // Prevent duplicates
                if (groupMsgs.some((m) => m.id === msg.id)) {
                    return prev;
                }
                return {
                    ...prev,
                    [targetRoom]: [...groupMsgs, msg],
                };
            });

            // Update unread count if the message is for a different room and from someone else
            if (targetRoom !== activeChatId && msg.senderId !== currentUser.id) {
                setUnreadCounts(prev => ({
                    ...prev,
                    [targetRoom]: (prev[targetRoom] || 0) + 1
                }));
            } else if (targetRoom === activeChatId && msg.senderId !== currentUser.id) {
                socket.emit("mark-read", { groupId: activeChatId, userId: currentUser.id });
            }
        });

        socket.on("message-deleted", ({ messageId, groupId }: { messageId: string, groupId: string }) => {
            setMessages((prev) => ({
                ...prev,
                [groupId]: (prev[groupId] || []).filter((msg) => msg.id !== messageId),
            }));
        });

        socket.on("message-deleted-for-me", ({ messageId, groupId }: { messageId: string, groupId: string }) => {
            setMessages((prev) => ({
                ...prev,
                [groupId]: (prev[groupId] || []).filter((msg) => msg.id !== messageId),
            }));
        });

        socket.on("message-updated", ({ groupId, message }: { groupId: string, message: ChatMessage }) => {
            setMessages((prev) => {
                const groupMsgs = prev[groupId] || [];
                return {
                    ...prev,
                    [groupId]: groupMsgs.map(m => m.id === message.id ? message : m)
                };
            });
        });

        socket.on("messages-updated", ({ groupId, messages: updatedMsgs }: { groupId: string, messages: ChatMessage[] }) => {
            setMessages((prev) => {
                const groupMsgs = prev[groupId] || [];
                const msgDict = Object.fromEntries(updatedMsgs.map(m => [m.id, m]));
                return {
                    ...prev,
                    [groupId]: groupMsgs.map(m => msgDict[m.id] ? msgDict[m.id] : m)
                };
            });
        });

        socket.on("demo-reset", () => {
            setMessages({});
        });

        return () => {
            socket.off("connect", onConnect);
            socket.off("custom-groups-list");
            socket.off("custom-users-list");
            socket.off("profile-updated");
            socket.off("group-created");
            socket.off("chat-history");
            socket.off("receive-message");
            socket.off("message-deleted");
            socket.off("message-deleted-for-me");
            socket.off("message-updated");
            socket.off("messages-updated");
        };
    }, [socket, currentUser.id, activeChatId]);

    // Join group whenever activeChatId changes
    useEffect(() => {
        if (socket && isConnected) {
            socket.emit("join-group", activeChatId);
            socket.emit("mark-read", { groupId: activeChatId, userId: currentUser.id });
        }
    }, [socket, isConnected, activeChatId, currentUser.id]);

    // Reset sidebars/search and chat states when active chat changes
    useEffect(() => {
        setIsSearchOpen(false);
        setMsgSearchQuery("");
        setIsInfoOpen(false);
        setShowEmojiPicker(false);
        setEditingMessageId(null);
        setReplyingToMessageId(null);
        setIsSelectMode(false);
        setSelectedMessageIds([]);
    }, [activeChatId]);

    // Close emoji picker and message actions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
            if (messageActionsRef.current && !messageActionsRef.current.contains(event.target as Node)) {
                setSelectedMessageId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleDeleteMessage = (messageId: string, type: "me" | "everyone") => {
        if (!socket) return;
        socket.emit("delete-message", {
            messageId,
            groupId: activeChatId,
            type,
            userId: currentUser.id
        });
        setSelectedMessageId(null);
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || !socket) return;

        if (editingMessageId) {
            socket.emit("edit-message", {
                messageId: editingMessageId,
                groupId: activeChatId,
                newText: inputValue.trim()
            });
            setEditingMessageId(null);
        } else {
            socket.emit("send-message", {
                groupId: activeChatId,
                message: {
                    senderId: currentUser.id,
                    text: inputValue.trim(),
                    replyToId: replyingToMessageId
                },
            });
            setReplyingToMessageId(null);
        }

        setInputValue("");
        setShowEmojiPicker(false);
    };

    const onEmojiClick = (emojiObject: { emoji: string }) => {
        setInputValue(prevInput => prevInput + emojiObject.emoji);
    };

    const handleCreateGroup = (name: string, description: string, icon: string, memberIds: string[]) => {
        if (!socket) return;
        const newGroupId = `group-custom-${Date.now()}`;
        socket.emit("create-group", {
            id: newGroupId,
            name,
            description,
            icon,
            members: memberIds
        });
        // Optimistic UI updates are handled by the group-created socket event, but we can set active chat
        setActiveChatId(newGroupId);
    };

    const handleUpdateProfile = (updatedUser: User) => {
        if (!socket) return;
        socket.emit("update-profile", updatedUser);
        onUpdateUser(updatedUser);
    };

    const handleStartCall = (type: 'video' | 'voice') => {
        webrtc.startCall({
            type,
            targetId: isDirectMessage ? (dmPartner?.id || "") : activeChatId,
            groupId: activeChatId
        });
    };

    // Determine active chat info details (is it a group or a private chat?)
    const activeGroupInfo = allGroups.find((g) => g.id === activeChatId);
    // If no group matches, it might be a direct message. Format: dm_[sorted_ids].
    const isDirectMessage = activeChatId.startsWith("dm_");
    const dmPartnerId = isDirectMessage ? activeChatId.replace("dm_", "").split("_").find(id => id !== currentUser.id) : null;
    const dmPartner = dmPartnerId ? allUsers.find(u => u.id === dmPartnerId) : null;

    const getChatHeaderInfo = () => {
        if (activeGroupInfo) {
            return { icon: activeGroupInfo.icon, name: activeGroupInfo.name, desc: activeGroupInfo.description };
        }
        if (dmPartner) {
            return {
                icon: <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs text-white", dmPartner.color)}>{dmPartner.avatar}</div>,
                name: dmPartner.name,
                desc: "Direct Message"
            };
        }
        return { icon: "💬", name: "Select a chat", desc: "" };
    };

    // Combined chat list logic
    const chatListItems = [
        ...allGroups.map(g => ({ ...g, isGroup: true, color: undefined })),
        ...allUsers.filter(u => u.id !== currentUser.id).map(u => {
            const dmId = `dm_${[currentUser.id, u.id].sort().join("_")}`;
            return {
                id: dmId,
                name: u.name,
                description: "Direct Message",
                icon: u.avatar,
                color: u.color,
                isGroup: false,
                lastActive: 0 // Optional: implement actual sorting by last active timestamp
            };
        })
    ];

    const filteredChats = chatListItems.filter(chat => chat.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const filteredChannels = filteredChats.filter(chat => chat.isGroup);
    const filteredDMs = filteredChats.filter(chat => !chat.isGroup);

    const headerInfo = getChatHeaderInfo();
    const currentGroupMessages = messages[activeChatId] || [];
    const displayMessages = currentGroupMessages.filter(msg =>
        msg.text.toLowerCase().includes(msgSearchQuery.toLowerCase())
    );
    const pinnedMessage = currentGroupMessages.find(msg => msg.pinned);

    const renderChatItem = (chat: typeof chatListItems[0]) => {
        const IconComponent = chat.isGroup ? (LucideIcons as any)[chat.icon as string] : null;

        return (
            <button
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
                    activeChatId === chat.id
                        ? "bg-[#2b5278]"
                        : "hover:bg-[#202b36]"
                )}
            >
                <div
                    className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-sm shrink-0 text-white",
                        chat.isGroup ? "bg-gradient-to-br from-[#5288c1] to-[#2b5278]" : chat.color
                    )}
                >
                    {chat.isGroup ? (
                        IconComponent ? <IconComponent className="w-6 h-6" /> : <span>#</span>
                    ) : (
                        chat.icon
                    )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex justify-between items-baseline mb-0.5">
                        <p className="font-semibold text-[15px] text-white truncate">{chat.name}</p>
                    </div>
                    <p className="text-sm text-[#7f91a4] truncate">
                        {chat.isGroup ? chat.description : "Start messaging"}
                    </p>
                </div>
                {unreadCounts[chat.id] > 0 && (
                    <div className="w-5 h-5 rounded-full bg-[#5288c1] text-[11px] font-bold text-white flex items-center justify-center shrink-0">
                        {unreadCounts[chat.id]}
                    </div>
                )}
            </button>
        );
    };

    return (
        <div className="flex h-screen bg-[#0e1621] overflow-hidden text-slate-200 font-sans">
            {/* Sidebar */}
            <div className="w-80 md:w-96 border-r border-[#0e1621] bg-[#17212b] flex flex-col shrink-0">
                {/* App Branding */}
                <div className="px-4 pt-4 pb-2 flex items-center gap-3 border-b border-[#0e1621]">
                    <img src="/logo.png" alt="GayeChat" className="w-9 h-9 rounded-lg shadow-md" />
                    <span className="text-lg font-bold text-white tracking-tight">GayeChat</span>
                </div>
                {/* User Profile Area */}
                <div className="p-4 border-b border-[#0e1621] flex items-center justify-between bg-[#17212b]">
                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setIsEditProfileOpen(true)}>
                        <div
                            className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-md transition-transform group-hover:scale-105",
                                currentUser.color
                            )}
                        >
                            {currentUser.avatar}
                        </div>
                        <div>
                            <p className="font-semibold text-white group-hover:text-[#5288c1] transition-colors">{currentUser.name}</p>
                            <div className="flex items-center gap-1 text-xs text-slate-400">
                                <span className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-rose-500")} />
                                {isConnected ? "Connected" : "Disconnected"}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            if (socket) socket.emit("reset-demo");
                            onLogout();
                        }}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-[#0e1621] rounded-lg transition-colors"
                        title="Log out & Reset Demo"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>

                {/* Search & New Group */}
                <div className="p-3 border-b border-[#0e1621] flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#242f3d] text-sm text-slate-200 placeholder-slate-500 rounded-full pl-10 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-[#5288c1]"
                        />
                        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="p-2 bg-[#2b5278] hover:bg-[#5288c1] text-white rounded-full transition-colors shrink-0"
                        title="New Group"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>

                {/* Combined Chat List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* Channels Section */}
                    {filteredChannels.length > 0 && (
                        <div className="py-2">
                            <div className="px-4 py-1.5 flex items-center gap-2 text-[11px] font-bold text-[#7ca2ce] tracking-widest uppercase">
                                <LucideIcons.Hash className="w-3.5 h-3.5" /> Channels
                            </div>
                            {filteredChannels.map(renderChatItem)}
                        </div>
                    )}

                    {/* DMs Section */}
                    {filteredDMs.length > 0 && (
                        <div className="py-2">
                            <div className="px-4 py-1.5 flex items-center gap-2 text-[11px] font-bold text-[#7ca2ce] tracking-widest uppercase mt-2">
                                <LucideIcons.MessageCircle className="w-3.5 h-3.5" /> Direct Messages
                            </div>
                            {filteredDMs.map(renderChatItem)}
                        </div>
                    )}

                    {filteredChats.length === 0 && (
                        <div className="text-center p-6 text-[#7f91a4] text-sm">
                            No chats found
                        </div>
                    )}
                </div>          </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-[#0e1621] relative">
                {/* Chat Header */}
                <div className="h-16 border-b border-[#0e1621] px-6 flex items-center justify-between bg-[#17212b] sticky top-0 z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        {/* Dynamic Render for Group/Chat Icon */}
                        {activeGroupInfo ? (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5288c1] to-[#2b5278] flex items-center justify-center text-white">
                                {(() => {
                                    const IconNode = (LucideIcons as any)[activeGroupInfo.icon as string];
                                    return IconNode ? <IconNode className="w-5 h-5" /> : <span>#</span>;
                                })()}
                            </div>
                        ) : (
                            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white", dmPartner?.color)}>
                                {dmPartner?.avatar}
                            </div>
                        )}
                        <div>
                            <h2 className="font-bold text-[16px] text-white tracking-tight">{headerInfo.name}</h2>
                            <p className="text-[13px] text-[#7f91a4]">{headerInfo.desc || "online"}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-5 text-[#7f91a4]">
                        <button onClick={() => handleStartCall('voice')} className="transition-colors hover:text-emerald-400" title="Voice Call"><Phone className="w-5 h-5" /></button>
                        <button onClick={() => handleStartCall('video')} className="transition-colors hover:text-[#5288c1]" title="Video Call"><Video className="w-5 h-5" /></button>
                        <button onClick={() => setIsSearchOpen(!isSearchOpen)} className={cn("transition-colors", isSearchOpen ? "text-[#5288c1]" : "hover:text-white")}><Search className="w-5 h-5" /></button>
                        <button onClick={() => setIsInfoOpen(!isInfoOpen)} className={cn("transition-colors", isInfoOpen ? "text-[#5288c1]" : "hover:text-white")}><Users className="w-5 h-5" /></button>
                    </div>
                </div>

                {/* Pinned Message Banner */}
                {pinnedMessage && (
                    <div className="bg-[#17212b] border-b border-[#0e1621] px-6 py-2 flex items-center gap-3 shrink-0 cursor-pointer hover:bg-[#202b36] transition-colors" onClick={() => {
                        const el = document.getElementById(`msg-${pinnedMessage.id}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}>
                        <div className="text-[#5288c1]"><LucideIcons.Pin className="w-4 h-4" /></div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-[#5288c1]">Pinned Message</p>
                            <p className="text-sm text-slate-300 truncate">{pinnedMessage.text}</p>
                        </div>
                    </div>
                )}

                {/* Msg Search Bar */}
                {isSearchOpen && (
                    <div className="p-3 bg-[#17212b] border-b border-[#0e1621] shrink-0">
                        <div className="relative">
                            <input
                                type="text"
                                autoFocus
                                value={msgSearchQuery}
                                onChange={(e) => setMsgSearchQuery(e.target.value)}
                                placeholder="Search messages..."
                                className="w-full bg-[#242f3d] text-sm text-slate-200 placeholder-slate-500 rounded-full pl-10 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-[#5288c1]"
                            />
                            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
                        </div>
                    </div>
                )}

                {/* Select Mode Banner */}
                {isSelectMode && (
                    <div className="bg-[#242f3d] border-b border-[#0e1621] px-6 py-3 flex items-center justify-between shadow-md z-20 shrink-0">
                        <div className="flex items-center gap-4 text-white">
                            <button onClick={() => { setIsSelectMode(false); setSelectedMessageIds([]); }} className="p-1 hover:bg-[#17212b] rounded-full transition-colors"><LucideIcons.X className="w-5 h-5" /></button>
                            <span className="font-semibold">{selectedMessageIds.length} Selected</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => handleBulkAction("star")} className="text-white hover:text-[#5288c1] flex flex-col items-center gap-1"><LucideIcons.Star className="w-5 h-5" /><span className="text-[10px]">Star</span></button>
                            <button onClick={() => handleBulkAction("delete")} className="text-rose-400 hover:text-rose-500 flex flex-col items-center gap-1"><LucideIcons.Trash2 className="w-5 h-5" /><span className="text-[10px]">Delete</span></button>
                        </div>
                    </div>
                )}

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-6 scroll-smooth custom-scrollbar">
                    <div className="space-y-6">
                        <AnimatePresence initial={false}>
                            {displayMessages.map((msg, index) => {
                                const isMine = msg.senderId === currentUser.id;
                                const sender = allUsers.find((u) => u.id === msg.senderId);
                                const showHeader = index === 0 || displayMessages[index - 1].senderId !== msg.senderId;

                                return (
                                    <motion.div
                                        key={msg.id}
                                        id={`msg-${msg.id}`}
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        className={cn("flex flex-col", isMine ? "items-end" : "items-start")}
                                    >
                                        {/* Message Header (Avatar + Name) */}
                                        {showHeader && !isMine && sender && (
                                            <div className="flex items-center gap-2 mb-1.5 px-1">
                                                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white", sender.color)}>
                                                    {sender.avatar}
                                                </div>
                                                <span className="text-xs font-semibold text-slate-300">{sender.name}</span>
                                                <span className="text-[10px] text-slate-500">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        )}

                                        {showHeader && isMine && (
                                            <div className="flex items-center gap-2 mb-1.5 px-1">
                                                <span className="text-[10px] text-slate-500">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-xs font-semibold text-slate-300">You</span>
                                            </div>
                                        )}

                                        {/* Message Bubble container with Select Mode layout */}
                                        <div className="flex items-center gap-3 w-full mt-0.5" style={{ flexDirection: isMine ? 'row-reverse' : 'row' }} onClick={() => isSelectMode ? toggleSelection(msg.id) : null}>
                                            {isSelectMode && (
                                                <div className="cursor-pointer shrink-0 py-2">
                                                    <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors", selectedMessageIds.includes(msg.id) ? "bg-[#5288c1] border-[#5288c1]" : "border-[#7f91a4]")}>
                                                        {selectedMessageIds.includes(msg.id) && <LucideIcons.Check className="w-3 h-3 text-white" />}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="relative group/msg inline-flex items-center gap-2" style={{ pointerEvents: isSelectMode ? 'none' : 'auto' }}>
                                                {isMine && (
                                                    <div
                                                        className={cn(
                                                            "opacity-0 group-hover/msg:opacity-100 transition-opacity relative",
                                                            selectedMessageId === msg.id && "opacity-100 z-10"
                                                        )}
                                                        ref={selectedMessageId === msg.id ? messageActionsRef : null}
                                                    >
                                                        <button
                                                            onClick={() => setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id)}
                                                            className="p-1 rounded hover:bg-[#202b36] text-[#7f91a4] hover:text-white"
                                                        >
                                                            <LucideIcons.MoreHorizontal className="w-4 h-4" />
                                                        </button>

                                                        {/* Action Menu */}
                                                        <AnimatePresence>
                                                            {selectedMessageId === msg.id && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                                    className="absolute right-0 top-full mt-1 bg-[#17212b] border border-[#2b5278] shadow-lg rounded-lg py-1 w-40 z-20"
                                                                >
                                                                    <button onClick={() => { setReplyingToMessageId(msg.id); setSelectedMessageId(null); document.querySelector('input')?.focus(); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2"><LucideIcons.Reply className="w-4 h-4" /> Reply</button>
                                                                    <button onClick={() => { setEditingMessageId(msg.id); setInputValue(msg.text); setSelectedMessageId(null); document.querySelector('input')?.focus(); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2"><LucideIcons.Edit2 className="w-4 h-4" /> Edit</button>
                                                                    <button onClick={() => { socket?.emit('star-message', { messageId: msg.id, groupId: activeChatId, userId: currentUser.id }); setSelectedMessageId(null); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2">
                                                                        <LucideIcons.Star className="w-4 h-4" /> {msg.starredBy?.includes(currentUser.id) ? "Unstar" : "Star"}
                                                                    </button>
                                                                    <button onClick={() => { socket?.emit('pin-message', { messageId: msg.id, groupId: activeChatId, pinned: !msg.pinned }); setSelectedMessageId(null); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2">
                                                                        <LucideIcons.Pin className="w-4 h-4" /> {msg.pinned ? "Unpin" : "Pin"}
                                                                    </button>
                                                                    <button onClick={() => { setIsSelectMode(true); setSelectedMessageIds([msg.id]); setSelectedMessageId(null); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2">
                                                                        <LucideIcons.CheckSquare className="w-4 h-4" /> Select
                                                                    </button>
                                                                    <button onClick={() => { setInfoMessageId(msg.id); setSelectedMessageId(null); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2">
                                                                        <LucideIcons.Info className="w-4 h-4" /> Message Info
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteMessage(msg.id, "everyone")}
                                                                        className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2"
                                                                    >
                                                                        <LucideIcons.Trash2 className="w-4 h-4 text-rose-400" /> Undo / Delete
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteMessage(msg.id, "me")}
                                                                        className="w-full text-left px-4 py-2 text-sm text-[#7f91a4] hover:bg-[#202b36] flex items-center gap-2"
                                                                    >
                                                                        <LucideIcons.EyeOff className="w-4 h-4" /> Delete for me
                                                                    </button>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )}

                                                <div
                                                    className={cn(
                                                        "max-w-[75%] min-w-[120px] px-3.5 py-2 rounded-2xl text-[15px] leading-relaxed shadow-sm flex flex-col relative",
                                                        isMine
                                                            ? "bg-[#2b5278] text-[#e4ecf2] rounded-br-[4px]"
                                                            : "bg-[#182533] text-[#e4ecf2] rounded-bl-[4px]"
                                                    )}
                                                >
                                                    {msg.replyToId && (() => {
                                                        const replyMsg = currentGroupMessages.find(m => m.id === msg.replyToId);
                                                        const replySender = allUsers.find(u => u.id === replyMsg?.senderId) || currentUser;
                                                        if (!replyMsg) return null;
                                                        return (
                                                            <div className="bg-[#17212b]/50 p-2 rounded-lg mb-1.5 border-l-4 border-[#5288c1] text-xs cursor-pointer hover:bg-[#17212b]/70 transition-colors" onClick={() => {
                                                                const el = document.getElementById(`msg-${replyMsg.id}`);
                                                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                                                            }}>
                                                                <div className="font-semibold text-[#5288c1] mb-0.5">{replySender.name}</div>
                                                                <div className="text-slate-300 truncate">{replyMsg.text}</div>
                                                            </div>
                                                        );
                                                    })()}

                                                    <div>{msg.text}</div>

                                                    <div className={cn(
                                                        "text-[10px] flex items-center justify-end gap-1 mt-1",
                                                        isMine ? "text-[#7ca2ce]" : "text-[#7f91a4]"
                                                    )}>
                                                        {msg.starredBy?.includes(currentUser.id) && <LucideIcons.Star className="w-2.5 h-2.5 fill-current" />}
                                                        {msg.edited && <span className="italic opacity-80">(edited)</span>}
                                                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        {isMine && (
                                                            <span>
                                                                {msg.readBy && msg.readBy.filter(r => r.userId !== currentUser.id).length > 0 ? (
                                                                    <LucideIcons.CheckCheck className="w-3.5 h-3.5 text-[#52c178]" />
                                                                ) : msg.deliveredTo && msg.deliveredTo.filter(d => d.userId !== currentUser.id).length > 0 ? (
                                                                    <LucideIcons.CheckCheck className="w-3.5 h-3.5 text-[#7ca2ce]" />
                                                                ) : (
                                                                    <LucideIcons.Check className="w-3.5 h-3.5 text-[#7ca2ce]" />
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {!isMine && (
                                                    <div
                                                        className={cn(
                                                            "opacity-0 group-hover/msg:opacity-100 transition-opacity relative",
                                                            selectedMessageId === msg.id && "opacity-100 z-10"
                                                        )}
                                                        ref={selectedMessageId === msg.id ? messageActionsRef : null}
                                                    >
                                                        <button
                                                            onClick={() => setSelectedMessageId(selectedMessageId === msg.id ? null : msg.id)}
                                                            className="p-1 rounded hover:bg-[#202b36] text-[#7f91a4] hover:text-white"
                                                        >
                                                            <LucideIcons.MoreHorizontal className="w-4 h-4" />
                                                        </button>

                                                        {/* Action Menu */}
                                                        <AnimatePresence>
                                                            {selectedMessageId === msg.id && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                                    className="absolute left-0 top-full mt-1 bg-[#17212b] border border-[#2b5278] shadow-lg rounded-lg py-1 w-40 z-20"
                                                                >
                                                                    <button onClick={() => { setReplyingToMessageId(msg.id); setSelectedMessageId(null); document.querySelector('input')?.focus(); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2"><LucideIcons.Reply className="w-4 h-4" /> Reply</button>
                                                                    <button onClick={() => { socket?.emit('star-message', { messageId: msg.id, groupId: activeChatId, userId: currentUser.id }); setSelectedMessageId(null); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2">
                                                                        <LucideIcons.Star className="w-4 h-4" /> {msg.starredBy?.includes(currentUser.id) ? "Unstar" : "Star"}
                                                                    </button>
                                                                    <button onClick={() => { setIsSelectMode(true); setSelectedMessageIds([msg.id]); setSelectedMessageId(null); }} className="w-full text-left px-4 py-2 text-sm text-[#e4ecf2] hover:bg-[#202b36] flex items-center gap-2">
                                                                        <LucideIcons.CheckSquare className="w-4 h-4" /> Select
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteMessage(msg.id, "me")}
                                                                        className="w-full text-left px-4 py-2 text-sm text-[#7f91a4] hover:bg-[#202b36] flex items-center gap-2"
                                                                    >
                                                                        <LucideIcons.EyeOff className="w-4 h-4" /> Delete for me
                                                                    </button>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input Area */}
                <div className="flex flex-col bg-[#0e1621] relative">
                    {(editingMessageId || replyingToMessageId) && (
                        <div className="bg-[#17212b] rounded-t-xl mx-4 mt-2 p-3 px-4 border-l-4 border-[#5288c1] flex items-center justify-between shadow-sm relative z-10 bottom-[-10px] sm:max-w-4xl sm:mx-auto w-full box-border">
                            <div className="flex-1 min-w-0 pr-4">
                                <p className="text-xs font-semibold text-[#5288c1] mb-0.5 flex items-center gap-1.5">
                                    {editingMessageId ? <LucideIcons.Edit2 className="w-3 h-3" /> : <LucideIcons.Reply className="w-3 h-3" />}
                                    {editingMessageId ? "Edit message" : "Replying to message"}
                                </p>
                                <p className="text-sm text-slate-300 truncate">
                                    {editingMessageId
                                        ? currentGroupMessages.find(m => m.id === editingMessageId)?.text
                                        : currentGroupMessages.find(m => m.id === replyingToMessageId)?.text}
                                </p>
                            </div>
                            <button type="button" onClick={() => { setEditingMessageId(null); setReplyingToMessageId(null); setInputValue(""); }} className="text-[#7f91a4] hover:text-white p-1.5 rounded-full hover:bg-[#202b36] transition-colors">
                                <LucideIcons.X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <div className="p-4 z-20">
                        {/* Emoji Picker Popup */}
                        <AnimatePresence>
                            {showEmojiPicker && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute bottom-20 left-4 z-50 shadow-2xl"
                                    ref={emojiPickerRef}
                                >
                                    <EmojiPicker
                                        theme={Theme.DARK}
                                        onEmojiClick={onEmojiClick}
                                        style={{
                                            backgroundColor: '#17212b',
                                            borderColor: '#0e1621',
                                        }}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <form
                            onSubmit={handleSendMessage}
                            className="flex items-center gap-3 max-w-4xl mx-auto relative"
                        >
                            <div className="relative flex-1">
                                <button
                                    type="button"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    className={cn(
                                        "absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors",
                                        showEmojiPicker ? "text-[#5288c1] bg-[#2b5278]/20" : "text-[#7f91a4] hover:text-[#e4ecf2] hover:bg-[#202b36]"
                                    )}
                                >
                                    <Smile className="w-6 h-6" />
                                </button>
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={`Write a message...`}
                                    className="w-full bg-[#17212b] text-white placeholder-[#7f91a4] pl-12 pr-5 py-3.5 rounded-xl focus:outline-none transition-all shadow-sm"
                                />
                            </div>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                type="submit"
                                disabled={!inputValue.trim()}
                                className="p-3.5 bg-[#5288c1] disabled:bg-[#17212b] disabled:text-[#7f91a4] text-white rounded-full transition-colors flex items-center justify-center shrink-0 shadow-sm"
                            >
                                <Send className="w-5 h-5 -ml-0.5 mt-0.5" />
                            </motion.button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Info Sidebar */}
            {isInfoOpen && (
                <div className="w-80 border-l border-[#0e1621] bg-[#17212b] flex flex-col shrink-0">
                    <div className="h-16 border-b border-[#0e1621] px-6 flex items-center justify-between shrink-0">
                        <h3 className="font-semibold text-white">{activeGroupInfo ? "Group Info" : "User Info"}</h3>
                        <button onClick={() => setIsInfoOpen(false)} className="text-[#7f91a4] hover:text-[#e4ecf2] transition-colors p-1.5 rounded-full hover:bg-[#202b36]">
                            <LucideIcons.X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col items-center">
                        {activeGroupInfo ? (
                            <>
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#5288c1] to-[#2b5278] flex items-center justify-center text-white mb-4 shadow-lg text-4xl">
                                    {(() => {
                                        const IconNode = (LucideIcons as any)[activeGroupInfo.icon as string];
                                        return IconNode ? <IconNode className="w-12 h-12" /> : <span>#</span>;
                                    })()}
                                </div>
                                <h2 className="text-xl font-bold text-white mb-1 text-center">{activeGroupInfo.name}</h2>
                                <p className="text-[#7f91a4] text-sm text-center mb-6">{activeGroupInfo.description}</p>

                                <div className="w-full">
                                    <h4 className="text-xs font-semibold text-[#5288c1] uppercase tracking-widest mb-3">Members</h4>
                                    <div className="space-y-3">
                                        {allUsers.filter(u => activeGroupInfo.members ? activeGroupInfo.members.includes(u.id) || u.id === currentUser.id : true).map(user => (
                                            <div key={user.id} className="flex items-center gap-3">
                                                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white", user.color)}>
                                                    {user.avatar}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{user.name}</p>
                                                    <p className="text-xs text-[#7f91a4] capitalize">online</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={cn("w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white mb-4 shadow-lg", dmPartner?.color)}>
                                    {dmPartner?.avatar}
                                </div>
                                <h2 className="text-xl font-bold text-white mb-1 text-center">{dmPartner?.name}</h2>
                                <p className="text-[#7f91a4] text-sm text-center mb-6">{dmPartner?.bio || "No bio yet"}</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Message Info Modal */}
            <AnimatePresence>
                {infoMessageId && (
                    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#17212b] w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-[#2b5278]"
                        >
                            <div className="p-4 border-b border-[#0e1621] flex justify-between items-center bg-[#242f3d]">
                                <h2 className="text-lg font-bold text-white">Message Info</h2>
                                <button onClick={() => setInfoMessageId(null)} className="text-[#7f91a4] hover:text-[#e4ecf2] transition-colors">
                                    <LucideIcons.X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <p className="text-xs font-semibold text-[#5288c1] uppercase tracking-wider mb-2">Read by</p>
                                    <div className="space-y-2">
                                        {(() => {
                                            const msgInfo = currentGroupMessages.find(m => m.id === infoMessageId);
                                            if (!msgInfo?.readBy || msgInfo.readBy.length === 0) return <p className="text-sm text-slate-400">—</p>;
                                            return msgInfo.readBy.map((readObj: any) => {
                                                const uId = typeof readObj === 'string' ? readObj : readObj.userId;
                                                const timestampStr = typeof readObj !== 'string' ? new Date(readObj.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                                const u = allUsers.find(user => user.id === uId);
                                                if (!u) return null;
                                                return (
                                                    <div key={uId} className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white", u.color)}>{u.avatar}</div>
                                                            <span className="text-sm text-slate-200">{u.name}</span>
                                                        </div>
                                                        {timestampStr && <span className="text-xs text-slate-500">{timestampStr}</span>}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                                <div className="border-t border-[#0e1621] pt-4">
                                    <p className="text-xs font-semibold text-[#5288c1] uppercase tracking-wider mb-2">Delivered to</p>
                                    <div className="space-y-2">
                                        {(() => {
                                            const msgInfo = currentGroupMessages.find(m => m.id === infoMessageId);
                                            if (!msgInfo?.deliveredTo || msgInfo.deliveredTo.length === 0) {
                                                return <p className="text-sm text-slate-400">
                                                    {isDirectMessage && dmPartner ? dmPartner.name : "All group members"}
                                                </p>;
                                            }
                                            return msgInfo.deliveredTo.map((delObj: any) => {
                                                const uId = typeof delObj === 'string' ? delObj : delObj.userId;
                                                if (uId === currentUser.id) return null; // Don't show delivered to self
                                                const timestampStr = typeof delObj !== 'string' ? new Date(delObj.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                                const u = allUsers.find(user => user.id === uId);
                                                if (!u) return null;
                                                return (
                                                    <div key={`del-${uId}`} className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white", u.color)}>{u.avatar}</div>
                                                            <span className="text-sm text-slate-200">{u.name}</span>
                                                        </div>
                                                        {timestampStr && <span className="text-xs text-slate-500">{timestampStr}</span>}
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modals */}
            <CreateGroupModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                currentUser={currentUser}
                onCreateGroup={handleCreateGroup}
            />
            <EditProfileModal
                isOpen={isEditProfileOpen}
                onClose={() => setIsEditProfileOpen(false)}
                currentUser={currentUser}
                onUpdateProfile={handleUpdateProfile}
            />

            {/* WebRTC Call Interfaces */}
            <IncomingCallAlert
                incomingCallData={webrtc.incomingCallData}
                users={allUsers}
                groups={allGroups}
                onAccept={webrtc.acceptCall}
                onReject={webrtc.rejectCall}
            />

            <CallModal
                localStream={webrtc.localStream}
                remoteStreams={webrtc.remoteStreams}
                activeCall={webrtc.activeCall}
                users={allUsers}
                groups={allGroups}
                onHangup={webrtc.endCall}
                onToggleMute={webrtc.toggleMute}
                onToggleVideo={webrtc.toggleVideo}
                isMuted={webrtc.isMuted}
                isVideoOff={webrtc.isVideoOff}
                currentUser={currentUser}
            />
        </div>
    );
}
