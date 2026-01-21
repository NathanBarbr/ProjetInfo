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

    // ... (existing imports)

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header with back button */}
            <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <Link
                            href={backUrl ? decodeURIComponent(backUrl) : "/"}
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-sm">{backUrl ? "Back to Search" : "Back"}</span>
                        </Link>
                        <div className="h-4 w-px bg-border flex-shrink-0" />

                        {/* Breadcrumb: Match title > Clip */}
                        <div className="flex items-center gap-2 text-sm overflow-hidden text-foreground">
                            {currentClip ? (
                                <>
                                    <button
                                        onClick={() => setCurrentClip(null)}
                                        className="text-muted-foreground hover:text-foreground truncate transition-colors"
                                    >
                                        {meta?.title || "Match"}
                                    </button>
                                    <span className="text-muted-foreground">/</span>
                                    <span className="font-medium truncate">
                                        {getCurrentTitle()}
                                    </span>
                                </>
                            ) : (
                                <h1 className="text-lg font-medium truncate">
                                    {meta?.title || "Loading..."}
                                </h1>
                            )}
                        </div>
                    </div>

                    <ThemeToggle />
                </div>
            </header>

            {/* Main content */}
            <main className="pt-8 pb-16 px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Error state */}
                    {error && (
                        <div className="text-center py-20">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                                <svg className="w-10 h-10 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                                </svg>
                            </div>
                            <p className="text-muted-foreground text-lg">Video not found</p>
                            <Link
                                href="/"
                                className="mt-4 inline-block text-primary hover:text-primary/80 text-sm"
                            >
                                ← Return to gallery
                            </Link>
                        </div>
                    )}

                    {/* Video player + Sidebar layout */}
                    {!error && (
                        <div className="flex flex-col lg:flex-row gap-6">
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
