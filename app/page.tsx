"use client";

import { useState, useEffect } from "react";
import LoginScreen from "../components/LoginScreen";
import ChatLayout from "../components/ChatLayout";
import { SocketProvider, useSocket } from "../components/SocketProvider";
import { User } from "../lib/dummyData";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Load user from localStorage on initial mount
  useEffect(() => {
    const storedUser = localStorage.getItem("demo-chat-user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }
    setIsLoading(false);
  }, []);

  // Save changes to the active session
  const handleLogin = (newUser: User) => {
    setLoginError(null);
    setUser(newUser);
    localStorage.setItem("demo-chat-user", JSON.stringify(newUser));
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem("demo-chat-user", JSON.stringify(updatedUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("demo-chat-user");
  };

  if (isLoading) {
    return <div className="h-screen w-screen bg-[#0e1621] flex items-center justify-center text-white">Loading...</div>;
  }

  // To catch the socket events like login-error in page.tsx during the initialization, 
  // we would need a socket connection. But in `ChatLayout`, the user is already set.
  // The simplest solution is observing the socket directly within an intermediate Login handler
  // Actually, we pass the error down to the LoginScreen:
  if (!user) {
    return <LoginScreen onLogin={handleLogin} initialError={loginError} />;
  }

  return (
    <SocketProvider>
      <ChatSessionGuard user={user} onLoginError={setLoginError} onLogout={handleLogout}>
        <ChatLayout currentUser={user} onUpdateUser={handleUpdateUser} onLogout={handleLogout} />
      </ChatSessionGuard>
    </SocketProvider>
  );
}

// A helper wrapper to listen for initial login validation inside the SocketProvider
function ChatSessionGuard({ user, onLoginError, onLogout, children }: any) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    const handleLoginError = (data: { message: string }) => {
      onLoginError(data.message);
      onLogout();
    };

    socket.on("login-error", handleLoginError);
    return () => {
      socket.off("login-error", handleLoginError);
    };
  }, [socket, onLoginError, onLogout]);

  return children;
}
