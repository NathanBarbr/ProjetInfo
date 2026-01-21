"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface VideoPlayerProps {
    src: string;
    title?: string;
    description?: string;
}

/**
 * VideoPlayer component - Custom HTML5 video player with seek functionality
 * Dark themed, inspired by modern video players
 */
export default function VideoPlayer({ src, title, description }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const playPromiseRef = useRef<Promise<void> | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isBuffering, setIsBuffering] = useState(false);
    const [loadProgress, setLoadProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);

    // Format time in MM:SS
    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    // Handle video metadata loaded - hide loading as soon as we have metadata
    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    };

    // Handle when video has enough data to start playing
    const handleLoadedData = () => {
        setIsLoading(false); // Ready to play!
    };

    // Handle video loading states
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handlePlaying = () => {
        setIsLoading(false);
        setIsBuffering(false);
    };

    // Handle progress during loading (tracks how much has been downloaded)
    const handleProgress = () => {
        if (videoRef.current) {
            const video = videoRef.current;
            if (video.buffered.length > 0 && video.duration > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                const progress = (bufferedEnd / video.duration) * 100;
                setLoadProgress(progress);
                setBuffered(bufferedEnd);
            }
        }
    };

    // Handle time updates
    const handleTimeUpdate = () => {
        if (videoRef.current && !isSeeking) {
            setCurrentTime(videoRef.current.currentTime);

            // Update buffered
            const video = videoRef.current;
            if (video.buffered.length > 0) {
                setBuffered(video.buffered.end(video.buffered.length - 1));
            }
        }
    };

    // Toggle play/pause - properly handle the play() promise to avoid AbortError
    const togglePlay = useCallback(async () => {
        if (!videoRef.current) return;

        const video = videoRef.current;

        if (isPlaying) {
            // Wait for any pending play promise before pausing
            if (playPromiseRef.current) {
                try {
                    await playPromiseRef.current;
                } catch {
                    // Ignore errors from previous play attempt
                }
                playPromiseRef.current = null;
            }
            video.pause();
        } else {
            playPromiseRef.current = video.play();
            try {
                await playPromiseRef.current;
            } catch (error) {
                // Ignore AbortError - it happens when pause() is called before play() finishes
                if (error instanceof Error && error.name !== 'AbortError') {
                    console.error('Error playing video:', error);
                }
            }
            playPromiseRef.current = null;
        }
    }, [isPlaying]);

    // Handle play/pause events
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    // Seek to position on progress bar click
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (progressRef.current && videoRef.current) {
            const rect = progressRef.current.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const newTime = percent * duration;
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };

    // Handle drag seek on progress bar
    const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        setIsSeeking(true);
        handleProgressClick(e);
    };

    // Handle mouse move during seek
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isSeeking && progressRef.current && videoRef.current) {
                const rect = progressRef.current.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const newTime = percent * duration;
                videoRef.current.currentTime = newTime;
                setCurrentTime(newTime);
            }
        };

        const handleMouseUp = () => {
            setIsSeeking(false);
        };

        if (isSeeking) {
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
        }

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isSeeking, duration]);

    // Toggle mute
    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    // Handle volume change
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
            setIsMuted(newVolume === 0);
        }
    };

    // Toggle fullscreen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            videoRef.current?.parentElement?.parentElement?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Skip forward/backward
    const skip = (seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return;

            switch (e.key) {
                case " ":
                case "k":
                    e.preventDefault();
                    togglePlay();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    skip(-10);
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    skip(10);
                    break;
                case "m":
                    toggleMute();
                    break;
                case "f":
                    toggleFullscreen();
                    break;
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isPlaying, duration]);

    // Auto-hide controls
    useEffect(() => {
        let timeout: NodeJS.Timeout;

        const handleMouseMove = () => {
            setShowControls(true);
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                if (isPlaying) setShowControls(false);
            }, 3000);
        };

        const container = videoRef.current?.parentElement?.parentElement;
        container?.addEventListener("mousemove", handleMouseMove);

        return () => {
            container?.removeEventListener("mousemove", handleMouseMove);
            clearTimeout(timeout);
        };
    }, [isPlaying]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

    return (
        <div className="w-full max-w-4xl mx-auto">
            {/* Video container */}
            <div
                className="relative rounded-xl overflow-hidden bg-zinc-900 border border-border shadow-2xl shadow-black/50 group"
                onMouseEnter={() => setShowControls(true)}
            >
                {/* Video element */}
                <video
                    ref={videoRef}
                    src={src}
                    crossOrigin="anonymous"
                    className="w-full aspect-video bg-black cursor-pointer"
                    preload="auto"
                    onClick={togglePlay}
                    onLoadedMetadata={handleLoadedMetadata}
                    onLoadedData={handleLoadedData}
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onWaiting={handleWaiting}
                    onCanPlay={handleCanPlay}
                    onPlaying={handlePlaying}
                    onProgress={handleProgress}
                >
                    Your browser does not support the video tag.
                </video>

                {/* Loading/Buffering indicator */}
                {(isLoading || isBuffering) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <div className="flex flex-col items-center gap-4">
                            {/* Circular progress with percentage */}
                            <div className="relative w-20 h-20">
                                {/* Background circle */}
                                <svg className="w-20 h-20 transform -rotate-90">
                                    <circle
                                        cx="40"
                                        cy="40"
                                        r="36"
                                        stroke="currentColor"
                                        strokeWidth="6"
                                        fill="transparent"
                                        className="text-zinc-700"
                                    />
                                    {/* Progress circle */}
                                    <circle
                                        cx="40"
                                        cy="40"
                                        r="36"
                                        stroke="currentColor"
                                        strokeWidth="6"
                                        fill="transparent"
                                        strokeLinecap="round"
                                        className="text-purple-500 transition-all duration-300"
                                        style={{
                                            strokeDasharray: `${2 * Math.PI * 36}`,
                                            strokeDashoffset: `${2 * Math.PI * 36 * (1 - loadProgress / 100)}`,
                                        }}
                                    />
                                </svg>
                                {/* Percentage text */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-white font-bold text-lg">
                                        {Math.round(loadProgress)}%
                                    </span>
                                </div>
                            </div>
                            <p className="text-zinc-400 text-sm font-medium">
                                {isLoading ? "Chargement de la vidéo..." : "Buffering..."}
                            </p>
                        </div>
                    </div>
                )}

                {/* Play overlay (center button) - only show when not loading */}
                {!isPlaying && !isLoading && !isBuffering && (
                    <div
                        className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer"
                        onClick={togglePlay}
                    >
                        <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-all duration-200 hover:scale-110">
                            <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                )}

                {/* Controls overlay */}
                <div
                    className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-4 pt-16 transition-opacity duration-300 ${showControls || !isPlaying ? "opacity-100" : "opacity-0"
                        }`}
                >
                    {/* Progress bar */}
                    <div
                        ref={progressRef}
                        className="relative h-1.5 bg-zinc-700/50 rounded-full cursor-pointer group/progress mb-3 hover:h-2 transition-all"
                        onClick={handleProgressClick}
                        onMouseDown={handleProgressMouseDown}
                    >
                        {/* Buffered */}
                        <div
                            className="absolute inset-y-0 left-0 bg-zinc-500/50 rounded-full"
                            style={{ width: `${bufferedProgress}%` }}
                        />
                        {/* Progress */}
                        <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                            style={{ width: `${progress}%` }}
                        />
                        {/* Seek handle */}
                        <div
                            className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-transform ${isSeeking ? "scale-125" : "scale-0 group-hover/progress:scale-100"
                                }`}
                            style={{ left: `calc(${progress}% - 8px)` }}
                        />
                    </div>

                    {/* Controls row */}
                    <div className="flex items-center gap-4">
                        {/* Play/Pause */}
                        <button
                            className="text-white hover:text-zinc-300 transition-colors"
                            onClick={togglePlay}
                        >
                            {isPlaying ? (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </button>

                        {/* Skip backward 10s */}
                        <button
                            className="text-white hover:text-zinc-300 transition-colors"
                            onClick={() => skip(-10)}
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                                <text x="9" y="14" fontSize="6" fill="currentColor">10</text>
                            </svg>
                        </button>

                        {/* Skip forward 10s */}
                        <button
                            className="text-white hover:text-zinc-300 transition-colors"
                            onClick={() => skip(10)}
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
                                <text x="9" y="14" fontSize="6" fill="currentColor">10</text>
                            </svg>
                        </button>

                        {/* Time */}
                        <div className="text-sm text-zinc-300 font-mono">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>

                        <div className="flex-1" />

                        {/* Volume */}
                        <div className="flex items-center gap-2 group/volume">
                            <button
                                className="text-white hover:text-zinc-300 transition-colors"
                                onClick={toggleMute}
                            >
                                {isMuted || volume === 0 ? (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                    </svg>
                                )}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="w-0 group-hover/volume:w-20 transition-all duration-200 cursor-pointer accent-purple-500"
                            />
                        </div>

                        {/* Fullscreen */}
                        <button
                            className="text-white hover:text-zinc-300 transition-colors"
                            onClick={toggleFullscreen}
                        >
                            {isFullscreen ? (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
                <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono">Space</kbd> Play/Pause</span>
                <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono">→</kbd> Skip 10s</span>
                <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-foreground font-mono">F</kbd> Fullscreen</span>
            </div>

            {/* Metadata section */}
            {(title || description) && (
                <div className="mt-6 space-y-2">
                    {title && (
                        <h2 className="text-xl font-medium text-foreground tracking-tight">
                            {title}
                        </h2>
                    )}
                    {description && (
                        <p className="text-sm text-muted-foreground">
                            {description}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
