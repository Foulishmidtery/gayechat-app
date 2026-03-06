"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { DUMMY_USERS, User } from "../lib/dummyData";
import { LogIn } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface LoginScreenProps {
    onLogin: (user: User) => void;
    initialError?: string | null;
}

export default function LoginScreen({ onLogin, initialError }: LoginScreenProps) {
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [customName, setCustomName] = useState("");

    const THEME_COLORS = [
        "bg-blue-500", "bg-emerald-500", "bg-purple-500",
        "bg-rose-500", "bg-amber-500", "bg-cyan-500", "bg-orange-500"
    ];

    const handleLogin = () => {
        if (customName.trim()) {
            const newUser: User = {
                id: `user-${crypto.randomUUID()}`,
                name: customName.trim(),
                avatar: customName.trim().charAt(0).toUpperCase(),
                color: THEME_COLORS[Math.floor(Math.random() * THEME_COLORS.length)],
                bio: "Just joined the demo!"
            };
            onLogin(newUser);
        } else if (selectedUser) {
            onLogin(selectedUser);
        }
    };

    return (
        <div className="min-h-screen bg-[#0e1621] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-[#17212b] border border-[#0e1621] rounded-3xl p-8 shadow-2xl"
            >
                <div className="text-center mb-8">
                    <img src="/logo.png" alt="GayeChat" className="w-20 h-20 mx-auto mb-4 rounded-2xl shadow-lg" />
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">GayeChat</h1>
                    <p className="text-[#7f91a4]">Select a profile to join the chat</p>
                </div>

                {initialError && (
                    <div className="mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl p-4 text-sm text-center font-medium">
                        {initialError}
                    </div>
                )}

                <div className="space-y-3 mb-8">
                    {DUMMY_USERS.map((user) => (
                        <motion.button
                            key={user.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedUser(user)}
                            className={cn(
                                "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 text-left",
                                selectedUser?.id === user.id && !customName
                                    ? "bg-[#2b5278]/20 border-[#5288c1]/50 ring-1 ring-[#5288c1]"
                                    : "bg-[#242f3d]/50 border-[#0e1621] hover:bg-[#242f3d] hover:border-[#5288c1]/30"
                            )}
                        >
                            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg shadow-sm", user.color)}>
                                {user.avatar}
                            </div>
                            <div>
                                <h3 className="text-white font-medium text-lg">{user.name}</h3>
                                <p className="text-[#7f91a4] text-sm">Tap to select</p>
                            </div>
                        </motion.button>
                    ))}
                </div>

                <div className="flex items-center gap-3 mb-6">
                    <hr className="flex-1 border-[#2b5278]/50" />
                    <span className="text-xs text-[#7f91a4] uppercase font-semibold">OR ENTER CUSTOM NAME</span>
                    <hr className="flex-1 border-[#2b5278]/50" />
                </div>

                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="Type your name here..."
                        value={customName}
                        onChange={(e) => {
                            setCustomName(e.target.value);
                            setSelectedUser(null);
                        }}
                        maxLength={30}
                        className="w-full bg-[#242f3d] text-white border border-[#0e1621] rounded-xl px-4 py-3 focus:outline-none focus:border-[#5288c1] transition-colors"
                    />
                </div>

                <motion.button
                    whileHover={(selectedUser || customName.trim()) ? { scale: 1.02, backgroundColor: "#4375a8" } : {}}
                    whileTap={(selectedUser || customName.trim()) ? { scale: 0.98 } : {}}
                    disabled={!selectedUser && !customName.trim()}
                    onClick={handleLogin}
                    className={cn(
                        "w-full py-4 rounded-xl font-semibold text-white transition-all duration-300 transform mt-4",
                        (selectedUser || customName.trim())
                            ? "bg-[#5288c1] shadow-lg shadow-[#5288c1]/20"
                            : "bg-[#242f3d] text-[#7f91a4] cursor-not-allowed"
                    )}
                >
                    {customName.trim() ? `Join as ${customName.trim()}` : selectedUser ? `Continue as ${selectedUser.name}` : "Select a user or type your name"}
                </motion.button>
            </motion.div>
        </div>
    );
}
