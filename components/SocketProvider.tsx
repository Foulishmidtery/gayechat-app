"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
});

export function useSocket() {
    return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // NEXT_PUBLIC_SOCKET_URL: set on Vercel to the external socket server URL (e.g. Render).
        // Locally, this is undefined = connects to same origin (custom server.mjs).
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_SITE_URL || undefined;
        const socketInstance = io(socketUrl, {
            path: "/api/socketio",
            addTrailingSlash: false,
            transports: ["websocket", "polling"],
        });

        socketInstance.on("connect", () => {
            setIsConnected(true);
            console.log("Connected to Socket.io server");
        });

        socketInstance.on("disconnect", () => {
            setIsConnected(false);
            console.log("Disconnected from Socket.io server");
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
}
