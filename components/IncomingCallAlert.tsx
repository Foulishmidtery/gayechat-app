import { Phone, PhoneCall, Video } from "lucide-react";
import { User, Group } from "../lib/dummyData";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";

interface IncomingCallAlertProps {
    incomingCallData: any;
    users: User[];
    groups: Group[];
    onAccept: () => void;
    onReject: () => void;
}

export default function IncomingCallAlert({ incomingCallData, users, groups, onAccept, onReject }: IncomingCallAlertProps) {
    if (!incomingCallData) return null;

    const caller = users.find(u => u.id === incomingCallData.callerId);
    if (!caller) return null;

    const isVideo = incomingCallData.type === 'video';
    const isGroup = incomingCallData.groupId?.startsWith("group-");
    const group = isGroup ? groups.find(g => g.id === incomingCallData.groupId) : null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.85, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.85, opacity: 0, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="bg-[#17212b] border border-[#2b5278]/50 shadow-2xl shadow-[#5288c1]/10 rounded-3xl p-8 max-w-sm w-full text-center"
                >
                    {/* Caller Avatar with ring animation */}
                    <div className="relative mx-auto w-28 h-28 mb-6">
                        <div className="absolute inset-0 rounded-full border-4 border-[#5288c1]/30 animate-ping" />
                        <div className="absolute inset-0 rounded-full border-4 border-[#5288c1]/10 animate-pulse" style={{ animationDelay: "0.5s" }} />
                        <div className={cn(
                            "w-full h-full rounded-full flex items-center justify-center text-4xl text-white font-bold relative z-10 shadow-xl",
                            caller.color
                        )}>
                            {caller.avatar}
                        </div>
                        <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-[#242f3d] rounded-full flex items-center justify-center border-4 border-[#17212b] z-20">
                            {isVideo ? <Video className="w-4 h-4 text-[#5288c1]" /> : <Phone className="w-4 h-4 text-emerald-500" />}
                        </div>
                    </div>

                    {/* Caller Info */}
                    <h2 className="text-2xl font-bold text-white mb-1">{caller.name}</h2>
                    {isGroup && group && (
                        <p className="text-[#5288c1] text-sm font-medium mb-1">in {group.name}</p>
                    )}
                    <p className="text-[#7f91a4] mb-8 text-sm">
                        Incoming {isGroup ? "Group " : ""}{isVideo ? "Video" : "Voice"} Call...
                    </p>

                    {/* Action Buttons */}
                    <div className="flex gap-6 items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <button
                                onClick={onReject}
                                className="bg-rose-500 hover:bg-rose-600 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/20 transition-all hover:scale-110 active:scale-95"
                            >
                                <Phone className="w-7 h-7 rotate-[135deg]" />
                            </button>
                            <span className="text-xs text-[#7f91a4]">Decline</span>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <button
                                onClick={onAccept}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/20 transition-all hover:scale-110 active:scale-95 animate-bounce"
                            >
                                <PhoneCall className="w-7 h-7" />
                            </button>
                            <span className="text-xs text-[#7f91a4]">Accept</span>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
