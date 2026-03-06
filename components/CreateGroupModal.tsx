"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, DUMMY_USERS } from "../lib/dummyData";
import { X, Check } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { cn } from "../lib/utils";

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User;
    onCreateGroup: (name: string, description: string, icon: string, memberIds: string[]) => void;
}

export default function CreateGroupModal({ isOpen, onClose, currentUser, onCreateGroup }: CreateGroupModalProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [icon, setIcon] = useState("Sparkles");
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

    const availableIcons = ["Sparkles", "Flame", "Rocket", "Lightbulb", "Pizza", "Music", "Trophy", "Code", "Coffee", "Heart"];

    const availableUsers = DUMMY_USERS.filter((u) => u.id !== currentUser.id);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        // Always include the creator in the members list
        const memberIds = Array.from(selectedUsers);
        memberIds.push(currentUser.id);

        onCreateGroup(name, description, icon, memberIds);

        // Reset form
        setName("");
        setDescription("");
        setIcon("Sparkles");
        setSelectedUsers(new Set());
        onClose();
    };

    const toggleUser = (userId: string) => {
        const newSelected = new Set(selectedUsers);
        if (newSelected.has(userId)) {
            newSelected.delete(userId);
        } else {
            newSelected.add(userId);
        }
        setSelectedUsers(newSelected);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 sticky top-0 z-10">
                                <h2 className="text-xl font-bold text-white tracking-tight">Create New Group</h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1.5">Group Icon</label>
                                        <div className="flex flex-wrap gap-2 text-2xl">
                                            {availableIcons.map((iconName) => {
                                                const IconComponent = (LucideIcons as any)[iconName];
                                                return (
                                                    <button
                                                        key={iconName}
                                                        type="button"
                                                        onClick={() => setIcon(iconName)}
                                                        className={cn(
                                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                                            icon === iconName ? "bg-indigo-500/20 ring-2 ring-indigo-500 text-indigo-400" : "bg-slate-800 hover:bg-slate-700 text-slate-400"
                                                        )}
                                                    >
                                                        {IconComponent && <IconComponent className="w-5 h-5" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="name" className="block text-sm font-medium text-slate-400 mb-1.5">Group Name *</label>
                                        <input
                                            id="name"
                                            type="text"
                                            required
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="e.g. Project Alpha"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="description" className="block text-sm font-medium text-slate-400 mb-1.5">Description</label>
                                        <input
                                            id="description"
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="What is this group about?"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <label className="block text-sm font-medium text-slate-400 mb-3">Invite Members</label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                        {availableUsers.map((user) => {
                                            const isSelected = selectedUsers.has(user.id);
                                            return (
                                                <button
                                                    key={user.id}
                                                    type="button"
                                                    onClick={() => toggleUser(user.id)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                                                        isSelected
                                                            ? "bg-indigo-500/10 border-indigo-500/50"
                                                            : "bg-slate-950 border-slate-800 hover:border-slate-700"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white", user.color)}>
                                                            {user.avatar}
                                                        </div>
                                                        <span className="text-sm font-medium text-slate-200">{user.name}</span>
                                                    </div>
                                                    <div className={cn(
                                                        "w-5 h-5 rounded-md flex items-center justify-center border",
                                                        isSelected ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-700 text-transparent"
                                                    )}>
                                                        <Check className="w-3.5 h-3.5" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </form>

                            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={!name.trim()}
                                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                                >
                                    Create Group
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
