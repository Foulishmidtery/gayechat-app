import { useState, useEffect } from "react";
import { User } from "../lib/dummyData";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { cn } from "../lib/utils";

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User;
    onUpdateProfile: (updatedUser: User) => void;
}

const THEME_COLORS = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-purple-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-indigo-500"
];

export default function EditProfileModal({ isOpen, onClose, currentUser, onUpdateProfile }: EditProfileModalProps) {
    const [name, setName] = useState(currentUser.name);
    const [avatar, setAvatar] = useState(currentUser.avatar);
    const [color, setColor] = useState(currentUser.color);
    const [bio, setBio] = useState(currentUser.bio || "");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(currentUser.name);
            setAvatar(currentUser.avatar);
            setColor(currentUser.color);
            setBio(currentUser.bio || "");
            setShowEmojiPicker(false);
        }
    }, [isOpen, currentUser]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onUpdateProfile({
            ...currentUser,
            name: name.trim() || currentUser.name,
            avatar: avatar.trim() || currentUser.avatar,
            color,
            bio: bio.trim()
        });
        onClose();
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#17212b] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-[#2b5278]"
                >
                    <div className="flex items-center justify-between p-4 border-b border-[#0e1621] bg-[#242f3d]">
                        <h2 className="text-lg font-bold text-white">Edit Profile</h2>
                        <button onClick={onClose} className="p-1 rounded-full text-[#7f91a4] hover:text-white hover:bg-[#2b5278] transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6">
                        <div className="flex flex-col items-center mb-6">
                            <div className="relative group cursor-pointer" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                                <div className={cn("w-20 h-20 rounded-full flex items-center justify-center text-3xl text-white shadow-lg transition-transform group-hover:scale-105", color)}>
                                    {avatar}
                                </div>
                                <div className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-xs font-semibold text-white">
                                    Change
                                </div>
                            </div>

                            {showEmojiPicker && (
                                <div className="absolute z-50 mt-2">
                                    <div className="fixed inset-0" onClick={() => setShowEmojiPicker(false)} />
                                    <div className="relative">
                                        <EmojiPicker
                                            theme={Theme.DARK}
                                            onEmojiClick={(e) => {
                                                setAvatar(e.emoji);
                                                setShowEmojiPicker(false);
                                            }}
                                            previewConfig={{ showPreview: false }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-[#5288c1] uppercase tracking-wider mb-1.5">Display Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    maxLength={30}
                                    className="w-full bg-[#242f3d] text-white border border-[#0e1621] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5288c1] transition-colors"
                                    placeholder="Your name"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[#5288c1] uppercase tracking-wider mb-1.5">Bio</label>
                                <textarea
                                    value={bio}
                                    onChange={(e) => setBio(e.target.value)}
                                    maxLength={150}
                                    rows={2}
                                    className="w-full bg-[#242f3d] text-white border border-[#0e1621] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5288c1] transition-colors resize-none"
                                    placeholder="A little bit about yourself..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[#5288c1] uppercase tracking-wider mb-2">Theme Color</label>
                                <div className="flex flex-wrap gap-2">
                                    {THEME_COLORS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setColor(c)}
                                            className={cn("w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110", c)}
                                        >
                                            {color === c && <Check className="w-4 h-4 text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-8">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-[#7f91a4] hover:bg-[#202b36] hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2 rounded-lg text-sm font-semibold bg-[#5288c1] text-white hover:bg-[#4372a3] transition-colors"
                            >
                                Save Changes
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
