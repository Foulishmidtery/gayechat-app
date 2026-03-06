import { useEffect, useRef, useState } from "react";
import { User, Group } from "../lib/dummyData";
import { Phone, Video, Mic, MicOff, PhoneOff, VideoOff, MonitorUp } from "lucide-react";
import { cn } from "../lib/utils";
import { CallConfig } from "../hooks/useWebRTC";

interface CallModalProps {
    localStream: MediaStream | null;
    remoteStreams: Record<string, MediaStream>;
    activeCall: CallConfig | null;
    users: User[];
    groups: Group[];
    onHangup: () => void;
    onToggleMute: () => void;
    onToggleVideo: () => void;
    isMuted: boolean;
    isVideoOff: boolean;
    currentUser: User;
}

export default function CallModal({
    localStream,
    remoteStreams,
    activeCall,
    users,
    groups,
    onHangup,
    onToggleMute,
    onToggleVideo,
    isMuted,
    isVideoOff,
    currentUser
}: CallModalProps) {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const [callDuration, setCallDuration] = useState(0);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    // Call timer
    useEffect(() => {
        if (!activeCall) { setCallDuration(0); return; }
        const interval = setInterval(() => setCallDuration(prev => prev + 1), 1000);
        return () => clearInterval(interval);
    }, [activeCall]);

    if (!activeCall) return null;

    const isGroup = activeCall.groupId?.startsWith("group-");
    const group = isGroup ? groups.find(g => g.id === activeCall.groupId) : null;
    const dmPartner = !isGroup ? users.find(u => u.id === activeCall.targetId) : null;

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };

    const hasRemote = Object.keys(remoteStreams).length > 0;

    return (
        <div className="fixed inset-0 z-50 bg-[#0a0f18] flex flex-col">
            {/* Top Bar */}
            <div className="h-16 bg-[#17212b]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 shrink-0 z-20">
                <div className="flex items-center gap-3">
                    {isGroup ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#5288c1] to-[#2b5278] flex items-center justify-center text-white text-sm font-bold">
                            {group?.icon ? "📞" : "#"}
                        </div>
                    ) : (
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold", dmPartner?.color)}>
                            {dmPartner?.avatar}
                        </div>
                    )}
                    <div>
                        <h3 className="text-white font-semibold text-sm">
                            {isGroup ? group?.name || "Group Call" : dmPartner?.name || "Call"}
                        </h3>
                        <p className="text-xs text-[#7f91a4]">
                            {hasRemote ? (
                                <span className="text-emerald-400">{activeCall.type === 'video' ? '🎥' : '🎙️'} {formatDuration(callDuration)}</span>
                            ) : (
                                <span className="animate-pulse">Connecting...</span>
                            )}
                            {isGroup && ` · ${Object.keys(remoteStreams).length + 1} participants`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Video Area */}
            <div className="flex-1 p-3 flex items-center justify-center relative overflow-hidden">
                <div className={cn(
                    "grid w-full h-full max-w-7xl gap-3",
                    Object.keys(remoteStreams).length === 0 ? "grid-cols-1" :
                        Object.keys(remoteStreams).length === 1 ? "grid-cols-1" :
                            Object.keys(remoteStreams).length <= 4 ? "grid-cols-2" :
                                "grid-cols-3"
                )}>
                    {!hasRemote ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="relative w-28 h-28 mb-8">
                                <div className="absolute inset-0 rounded-full bg-[#2b5278]/30 animate-ping" />
                                <div className={cn("w-28 h-28 rounded-full flex items-center justify-center text-white text-4xl font-bold relative z-10 shadow-2xl", dmPartner?.color || "bg-gradient-to-br from-[#5288c1] to-[#2b5278]")}>
                                    {isGroup ? "📞" : dmPartner?.avatar || "?"}
                                </div>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">
                                {isGroup ? `Calling ${group?.name}...` : `Calling ${dmPartner?.name}...`}
                            </h2>
                            <p className="text-[#7f91a4] text-sm">Waiting for response</p>
                        </div>
                    ) : (
                        Object.entries(remoteStreams).map(([userId, stream]) => (
                            <RemoteVideoPlayer key={userId} stream={stream} user={users.find(u => u.id === userId)} isAudioOnly={activeCall.type === 'voice'} />
                        ))
                    )}
                </div>

                {/* Local Stream PIP */}
                <div className="absolute bottom-4 right-4 w-36 md:w-52 aspect-video bg-[#17212b] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 z-10 group cursor-move">
                    {activeCall.type === 'video' && !isVideoOff ? (
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover transform scale-x-[-1]"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-[#1a2332]">
                            <div className={cn("w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-2 shadow-lg", currentUser.color)}>
                                {currentUser.avatar}
                            </div>
                            <span className="text-xs text-[#7f91a4]">You{isMuted ? " (muted)" : ""}</span>
                        </div>
                    )}
                    {isMuted && (
                        <div className="absolute top-2 left-2 bg-rose-500/80 rounded-full p-1">
                            <MicOff className="w-3 h-3 text-white" />
                        </div>
                    )}
                </div>
            </div>

            {/* Call Controls Bar */}
            <div className="h-28 bg-[#17212b]/80 backdrop-blur-md border-t border-white/5 flex items-center justify-center gap-5 px-4 shrink-0">
                <button
                    onClick={onToggleMute}
                    className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg",
                        isMuted
                            ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20"
                            : "bg-[#242f3d] hover:bg-[#2b5278] text-white"
                    )}
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                {activeCall.type === 'video' && (
                    <button
                        onClick={onToggleVideo}
                        className={cn(
                            "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg",
                            isVideoOff
                                ? "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20"
                                : "bg-[#242f3d] hover:bg-[#2b5278] text-white"
                        )}
                        title={isVideoOff ? "Turn on camera" : "Turn off camera"}
                    >
                        {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                    </button>
                )}

                <button
                    onClick={onHangup}
                    className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-600 flex items-center justify-center text-white transition-all duration-200 shadow-xl shadow-rose-500/30 hover:scale-105"
                    title="End Call"
                >
                    <PhoneOff className="w-7 h-7" />
                </button>
            </div>
        </div>
    );
}

function RemoteVideoPlayer({ stream, user, isAudioOnly }: { stream: MediaStream, user?: User, isAudioOnly: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="w-full h-full bg-[#17212b] rounded-2xl overflow-hidden relative border border-white/5 flex items-center justify-center min-h-[200px]">
            {isAudioOnly ? (
                <div className="flex flex-col items-center">
                    <div className={cn("w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold mb-4 shadow-lg", user?.color || 'bg-slate-500')}>
                        {user?.avatar || '?'}
                    </div>
                    <span className="text-white font-medium text-lg">{user?.name || 'Unknown User'}</span>
                    <span className="text-xs text-emerald-400 mt-1">Connected</span>
                    <audio ref={videoRef as any} autoPlay playsInline />
                </div>
            ) : (
                <>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-sm font-medium flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {user?.name || 'Unknown User'}
                    </div>
                </>
            )}
        </div>
    );
}
