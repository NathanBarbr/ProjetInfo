"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import VideoPlayer from "@/components/VideoPlayer";
import ClipsSidebar from "@/components/ClipsSidebar";
import ThemeToggle from "@/components/ThemeToggle";

interface VideoMeta {
    id: string;
    title: string;
    description?: string;
}

interface Clip {
    id: string;
    point: number;
    has_thumbnail: boolean;
}

interface ClipsData {
    video_id: string;
    sets: { [key: string]: Clip[] };
    total_clips: number;
}

const API_URL = "http://localhost:8000";

export default function WatchPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const backUrl = searchParams.get("backUrl");
    const videoId = params.id as string;
    const clipParam = searchParams.get("clip");

    const [meta, setMeta] = useState<VideoMeta | null>(null);
    const [clipsData, setClipsData] = useState<ClipsData | null>(null);
    const [currentClip, setCurrentClip] = useState<string | null>(clipParam);
    const [error, setError] = useState<string | null>(null);

    // Fetch video metadata
    useEffect(() => {
        if (!videoId) return;

        fetch(`${API_URL}/api/videos/${videoId}/meta`)
            .then((res) => {
                if (!res.ok) throw new Error("Video not found");
                return res.json();
            })
            .then((data) => setMeta(data))
            .catch((err) => setError(err.message));
    }, [videoId]);

    // Fetch clips data
    useEffect(() => {
        if (!videoId) return;

        fetch(`${API_URL}/api/videos/${videoId}/clips`)
            .then((res) => res.json())
            .then((data) => {
                setClipsData(data);
            })
            .catch(() => {
                // No clips available, that's fine
            });
    }, [videoId]);

    // Update URL when clip changes (without full navigation)
    // We want to preserve backUrl if it exists!
    const handleClipSelect = (clipId: string) => {
        setCurrentClip(clipId);
        // Update URL without reload
        const newParams = new URLSearchParams(window.location.search);
        newParams.set("clip", clipId);
        window.history.pushState({}, "", `/watch/${videoId}?${newParams.toString()}`);
    };

    // Get current video source
    const getVideoSrc = () => {
        if (currentClip) {
            return `${API_URL}/api/videos/${videoId}/clips/${currentClip}`;
        }
        return `${API_URL}/api/videos/${videoId}`;
    };

    // Get current title
    const getCurrentTitle = () => {
        if (currentClip) {
            // Extract point number from clip id (e.g., "set_1_point_5" -> "Point 5")
            const match = currentClip.match(/point_(\d+)/);
            if (match) {
                return `Point ${match[1]}`;
            }
            return currentClip;
        }
        return meta?.title || "Loading...";
    };

    return (
        <div
            className="min-h-screen"
            style={{
                background: '#1c1c1e',
                color: '#f5f5f7',
            }}
        >
            {/* Header - Glassmorphism with fine border */}
            <header
                className="sticky top-0 z-50"
                style={{
                    background: 'rgba(44, 44, 46, 0.8)',
                    backdropFilter: 'blur(15px)',
                    WebkitBackdropFilter: 'blur(15px)',
                    borderBottom: '1px solid #3a3a3c',
                }}
            >
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <Link
                            href={backUrl ? decodeURIComponent(backUrl) : "/"}
                            className="flex items-center gap-2 transition-colors flex-shrink-0"
                            style={{ color: '#86868b' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#f5f5f7'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#86868b'}
                        >
                            <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            <span
                                className="text-sm"
                                style={{ fontFamily: "'Inter', sans-serif" }}
                            >
                                {backUrl ? "Back to Search" : "Back"}
                            </span>
                        </Link>
                        <div
                            className="h-4 w-px flex-shrink-0"
                            style={{ background: '#3a3a3c' }}
                        />

                        {/* Breadcrumb: Match title > Clip */}
                        <div
                            className="flex items-center gap-2 text-sm overflow-hidden"
                            style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                            {currentClip ? (
                                <>
                                    <button
                                        onClick={() => setCurrentClip(null)}
                                        className="truncate transition-colors"
                                        style={{ color: '#86868b' }}
                                        onMouseEnter={(e) => e.currentTarget.style.color = '#f5f5f7'}
                                        onMouseLeave={(e) => e.currentTarget.style.color = '#86868b'}
                                    >
                                        {meta?.title || "Match"}
                                    </button>
                                    <span style={{ color: '#3a3a3c' }}>/</span>
                                    <span
                                        className="font-medium truncate"
                                        style={{
                                            fontFamily: "'Playfair Display', Georgia, serif",
                                            color: '#f5f5f7',
                                        }}
                                    >
                                        {getCurrentTitle()}
                                    </span>
                                </>
                            ) : (
                                <h1
                                    className="text-lg font-medium truncate"
                                    style={{
                                        fontFamily: "'Playfair Display', Georgia, serif",
                                        color: '#f5f5f7',
                                        letterSpacing: '-0.02em',
                                    }}
                                >
                                    {meta?.title || "Loading..."}
                                </h1>
                            )}
                        </div>
                    </div>

                    <ThemeToggle />
                </div>
            </header>

            {/* Main content */}
            <main className="pt-10 pb-20 px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Error state */}
                    {error && (
                        <div className="text-center py-20">
                            <div
                                className="w-20 h-20 mx-auto mb-4 flex items-center justify-center"
                                style={{
                                    borderRadius: '16px',
                                    background: 'rgba(44, 44, 46, 0.8)',
                                    border: '1px solid #3a3a3c',
                                }}
                            >
                                <svg
                                    className="w-10 h-10"
                                    fill="none"
                                    stroke="#86868b"
                                    strokeWidth="1.25"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                            </div>
                            <p
                                className="text-lg"
                                style={{
                                    fontFamily: "'Playfair Display', Georgia, serif",
                                    color: '#86868b',
                                }}
                            >
                                Video not found
                            </p>
                            <Link
                                href="/"
                                className="mt-4 inline-block text-sm transition-colors"
                                style={{
                                    fontFamily: "'Inter', sans-serif",
                                    color: '#0a84ff',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                                ← Return to gallery
                            </Link>
                        </div>
                    )}

                    {/* Video player + Sidebar layout */}
                    {!error && (
                        <div className="flex flex-col lg:flex-row gap-8">
                            {/* Video player - takes remaining space */}
                            <div className="flex-1 min-w-0">
                                <VideoPlayer
                                    key={currentClip || "main"} // Force remount when clip changes
                                    src={getVideoSrc()}
                                    title={getCurrentTitle()}
                                    description={currentClip ? undefined : meta?.description}
                                />
                            </div>

                            {/* Clips sidebar */}
                            {clipsData && clipsData.total_clips > 0 && (
                                <ClipsSidebar
                                    videoId={videoId}
                                    clipsData={clipsData}
                                    currentClip={currentClip}
                                    onClipSelect={handleClipSelect}
                                    apiUrl={API_URL}
                                />
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

