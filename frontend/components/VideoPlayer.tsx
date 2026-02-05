"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface VideoPlayerProps {
    src: string;
    title?: string;
    description?: string;
}

/**
 * VideoPlayer component - Custom HTML5 video player
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
    const [isHovered, setIsHovered] = useState(false);

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

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

    return (
        <div className="w-full max-w-4xl mx-auto">
            {/* Video container - Glassmorphism with fine border */}
            <div
                className="relative overflow-hidden group"
                style={{
                    borderRadius: '16px',
                    background: 'rgba(44, 44, 46, 0.8)',
                    backdropFilter: 'blur(15px)',
                    WebkitBackdropFilter: 'blur(15px)',
                    border: '1px solid #3a3a3c',
                }}
                onMouseEnter={() => {
                    setShowControls(true);
                    setIsHovered(true);
                }}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Video element */}
                <video
                    ref={videoRef}
                    src={src}
                    crossOrigin="anonymous"
                    className="w-full cursor-pointer"
                    style={{ background: '#1c1c1e' }}
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

                {/* Loading/Buffering indicator - Refined */}
                {(isLoading || isBuffering) && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(28, 28, 30, 0.6)' }}
                    >
                        <div className="flex flex-col items-center gap-4">
                            {/* Circular progress with percentage */}
                            <div className="relative w-20 h-20">
                                {/* Background circle */}
                                <svg className="w-20 h-20 transform -rotate-90">
                                    <circle
                                        cx="40"
                                        cy="40"
                                        r="36"
                                        stroke="#3a3a3c"
                                        strokeWidth="2"
                                        fill="transparent"
                                    />
                                    {/* Progress circle  */}
                                    <circle
                                        cx="40"
                                        cy="40"
                                        r="36"
                                        stroke="#0a84ff"
                                        strokeWidth="2"
                                        fill="transparent"
                                        strokeLinecap="round"
                                        className="transition-all duration-300"
                                        style={{
                                            strokeDasharray: `${2 * Math.PI * 36}`,
                                            strokeDashoffset: `${2 * Math.PI * 36 * (1 - loadProgress / 100)}`,
                                        }}
                                    />
                                </svg>
                                {/* Percentage text  */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span
                                        className="font-medium text-lg"
                                        style={{
                                            color: '#f5f5f7'
                                        }}
                                    >
                                        {Math.round(loadProgress)}%
                                    </span>
                                </div>
                            </div>
                            <p
                                className="text-sm font-normal"
                                style={{
                                    fontFamily: "'Inter', sans-serif",
                                    color: '#86868b'
                                }}
                            >
                                {isLoading ? "Chargement de la vidéo..." : "Buffering..."}
                            </p>
                        </div>
                    </div>
                )}

                {/* Controls overlay - Glass effect */}
                <div
                    className={`absolute bottom-0 left-0 right-0 px-5 pb-3 transition-opacity duration-300 ${isHovered ? "opacity-100" : "opacity-0"}`}
                    style={{
                        background: 'linear-gradient(to top, rgba(28, 28, 30, 0.95) 0%, rgba(28, 28, 30, 0.6) 50%, transparent 100%)',
                    }}
                >
                    {/* Progress bar - Minimal 3px, thickens on hover */}
                    <div
                        ref={progressRef}
                        className="relative cursor-pointer group/progress mb-4 transition-all duration-200"
                        style={{
                            height: '3px',
                            borderRadius: '2px',
                            background: 'rgba(58, 58, 60, 0.6)',
                        }}
                        onClick={handleProgressClick}
                        onMouseDown={handleProgressMouseDown}
                        onMouseEnter={(e) => e.currentTarget.style.height = '5px'}
                        onMouseLeave={(e) => e.currentTarget.style.height = '3px'}
                    >
                        {/* Buffered */}
                        <div
                            className="absolute inset-y-0 left-0"
                            style={{
                                width: `${bufferedProgress}%`,
                                background: 'rgba(134, 134, 139, 0.4)',
                                borderRadius: '2px',
                            }}
                        />
                        {/* Progress - j'ai rajouté un gradient orange un peu a la yt */}
                        <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500 via-orange-600 to-red-600 transition-all duration-300"
                            style={{
                                width: `${progress}%`,
                                borderRadius: '2px',
                            }}
                        />
                        {/* Seek handle */}
                        <div
                            className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 transition-transform duration-200 ${isSeeking ? "scale-125" : "scale-0 group-hover/progress:scale-100"}`}
                            style={{
                                left: `calc(${progress}% - 6px)`,
                                background: '#f5f5f7',
                                borderRadius: '50%',
                            }}
                        />
                    </div>

                    {/* Controls row */}
                    <div className="flex items-center gap-5"> 
                        
                        {/* Play/Pause - Plus grand et trait plus affirmé */}
                        <button
                            className="transition-colors duration-200 text-[#f5f5f7] hover:text-[#86868b]"
                            onClick={togglePlay}
                        >
                            {isPlaying ? (
                                <svg className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
                                </svg>
                            ) : (
                                <svg className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                                </svg>
                            )}
                        </button>

                        {/* Skip backward - w-5 -> w-7 */}
                        <button
                            className="transition-colors duration-200 text-[#f5f5f7] hover:text-[#86868b]"
                            onClick={() => skip(-10)}
                        >
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.334 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                            </svg>
                        </button>

                        {/* Skip forward - w-5 -> w-7 */}
                        <button
                            className="transition-colors duration-200 text-[#f5f5f7] hover:text-[#86868b]"
                            onClick={() => skip(10)}
                        >
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                            </svg>
                        </button>

                        {/* Time - text-sm -> text-base (16px) */}
                        <div
                            className="text-base tracking-wide flex items-center"
                            style={{
                                fontFamily: "'Inter', sans-serif",
                                color: '#86868b',
                            }}
                        >
                            <span className="min-w-[45px] text-right" style={{ fontFamily: "'Playfair Display', serif", color: '#f5f5f7' }}>
                                {formatTime(currentTime)}
                            </span>
                            <span className="mx-2 opacity-50">/</span>
                            <span className="min-w-[45px]">{formatTime(duration)}</span>
                        </div>

                        <div className="flex-1" />

                        {/* Volume - Plus grand et slider plus large */}
                        <div className="flex items-center gap-3 group/volume">
                            <button
                                className="transition-colors duration-200 text-[#f5f5f7] hover:text-[#86868b]"
                                onClick={toggleMute}
                            >
                                {isMuted || volume === 0 ? (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
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
                                className="w-24 h-1.5 transition-all duration-300 cursor-pointer accent-[#f97316]"
                                style={{
                                    background: `linear-gradient(to right, #f97316 0%, #dc2626 ${volume * 100}%, #3a3a3c ${volume * 100}%)`,
                                    borderRadius: '999px',
                                    WebkitAppearance: 'none' 
                                }}
                            />
                        </div>

                        {/* Fullscreen - w-5 -> w-6 */}
                        <button
                            className="transition-colors duration-200 text-[#f5f5f7] hover:text-[#86868b]"
                            onClick={toggleFullscreen}
                        >
                            {isFullscreen ? (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Keyboard shortcuts hint - Refined styling */}
            <div
                className="mt-5 flex items-center justify-center gap-8 text-xs"
                style={{
                    fontFamily: "'Inter', sans-serif",
                    color: '#86868b',
                }}
            >
                <span>
                    <kbd
                        className="px-2 py-1 font-mono"
                        style={{
                            background: 'rgba(44, 44, 46, 0.8)',
                            borderRadius: '6px',
                            border: '1px solid #3a3a3c',
                            color: '#f5f5f7',
                        }}
                    >Space</kbd> Play/Pause
                </span>
                <span>
                    <kbd
                        className="px-2 py-1 font-mono"
                        style={{
                            background: 'rgba(44, 44, 46, 0.8)',
                            borderRadius: '6px',
                            border: '1px solid #3a3a3c',
                            color: '#f5f5f7',
                        }}
                    >←</kbd> <kbd
                        className="px-2 py-1 font-mono"
                        style={{
                            background: 'rgba(44, 44, 46, 0.8)',
                            borderRadius: '6px',
                            border: '1px solid #3a3a3c',
                            color: '#f5f5f7',
                        }}
                    >→</kbd> Skip 10s
                </span>
                <span>
                    <kbd
                        className="px-2 py-1 font-mono"
                        style={{
                            background: 'rgba(44, 44, 46, 0.8)',
                            borderRadius: '6px',
                            border: '1px solid #3a3a3c',
                            color: '#f5f5f7',
                        }}
                    >F</kbd> Fullscreen
                </span>
            </div>

            {/* Metadata section - Editorial typography */}
            {(title || description) && (
                <div className="mt-8 space-y-3">
                    {title && (
                        <h2
                            className="text-2xl font-medium tracking-tight"
                            style={{
                                fontFamily: "'Playfair Display', Georgia, serif",
                                color: '#f5f5f7',
                                letterSpacing: '-0.02em',
                            }}
                        >
                            {title}
                        </h2>
                    )}
                    {description && (
                        <p
                            className="text-sm leading-relaxed"
                            style={{
                                fontFamily: "'Inter', sans-serif",
                                color: '#86868b',
                            }}
                        >
                            {description}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

