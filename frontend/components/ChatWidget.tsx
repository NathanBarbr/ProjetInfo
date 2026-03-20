"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

interface Message {
    role: "user" | "assistant";
    content: string;
    points?: PointResult[];
}

interface PointResult {
    clip_id: string;
    video_id: string;
    set_number: number;
    point_number: number;
    description: string;
    winner?: string;
}

export default function ChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            role: "assistant",
            content: "Salut ! 👋 Décris-moi un point et je te le trouve. Par exemple : \"un ace au service\" ou \"un point gagné au filet\".",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput("");
        setLoading(true);

        // Add user message
        setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: userMessage,
                    history: messages.slice(-10).map((m) => ({
                        role: m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!response.ok) throw new Error("Chat error");

            const data = await response.json();

            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: data.response,
                    points: data.points,
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: "Oups, je n'ai pas pu répondre. Vérifie que le serveur est bien lancé !",
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-purple-600 hover:bg-purple-500 rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all hover:scale-110"
            >
                {isOpen ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                )}
            </button>

            {/* Chat window */}
            {isOpen && (
                <div className="fixed bottom-24 right-6 z-50 w-96 h-[500px] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-lg">🏓</span>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-zinc-100">Assistant Points</h3>
                            <p className="text-xs text-zinc-500">Trouve des points par description</p>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === "user"
                                        ? "bg-purple-600 text-white"
                                        : "bg-zinc-800 text-zinc-200"
                                        }`}
                                >
                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                                    {/* Point links */}
                                    {msg.points && msg.points.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {msg.points.slice(0, 3).map((point, j) => (
                                                <Link
                                                    key={j}
                                                    href={`/watch/${point.video_id}?clip=${point.clip_id}`}
                                                    onClick={() => setIsOpen(false)}
                                                    className="block p-2 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs px-2 py-0.5 bg-purple-500/30 text-purple-300 rounded">
                                                            Set {point.set_number}
                                                        </span>
                                                        <span className="text-xs text-zinc-300">
                                                            Point {point.point_number}
                                                        </span>
                                                    </div>
                                                    {point.description && (
                                                        <p className="text-xs text-zinc-400 mt-1 truncate">
                                                            {point.description}
                                                        </p>
                                                    )}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Loading indicator */}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                                        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                                        <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-zinc-800">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder="Décris un point..."
                                disabled={loading}
                                className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                            />
                            <button
                                onClick={sendMessage}
                                disabled={loading || !input.trim()}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
