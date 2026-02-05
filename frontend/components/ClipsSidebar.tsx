"use client";

import { useState } from "react";

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

interface ClipsSidebarProps {
    videoId: string;
    clipsData: ClipsData | null;
    currentClip: string | null;
    onClipSelect: (clipId: string) => void;
    apiUrl: string;
}

export default function ClipsSidebar({
    videoId,
    clipsData,
    currentClip,
    onClipSelect,
    apiUrl,
}: ClipsSidebarProps) {
    const [selectedSet, setSelectedSet] = useState<string | null>(null); // null = All

    if (!clipsData || Object.keys(clipsData.sets).length === 0) {
        return null;
    }

    const sortedSets = Object.keys(clipsData.sets).sort((a, b) => parseInt(a) - parseInt(b));

    // Get clips to display based on selected set
    const getDisplayedClips = () => {
        if (selectedSet === null) {
            // Show all clips
            const allClips: { clip: Clip; setNum: string }[] = [];
            sortedSets.forEach(setNum => {
                clipsData.sets[setNum].forEach(clip => {
                    allClips.push({ clip, setNum });
                });
            });
            return allClips;
        } else {
            // Show only selected set
            return clipsData.sets[selectedSet]?.map(clip => ({ clip, setNum: selectedSet })) || [];
        }
    };

    const displayedClips = getDisplayedClips();

    return (
        <div className="w-full lg:w-[402px] flex-shrink-0">
            {/* Header - YouTube style */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span
                        className="text-base font-medium"
                        style={{
                            fontFamily: "'Roboto', Arial, sans-serif",
                            color: '#f5f5f7',
                        }}
                    >
                        Points du match
                    </span>
                    <span
                        className="text-sm"
                        style={{
                            fontFamily: "'Roboto', Arial, sans-serif",
                            color: '#aaaaaa',
                        }}
                    >
                        {clipsData.total_clips}
                    </span>
                </div>
            </div>

            {/* Set filter tabs - YouTube chips style */}
            <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                {/* All button */}
                <button
                    onClick={() => setSelectedSet(null)}
                    className="px-3 py-1.5 text-sm whitespace-nowrap transition-all duration-150"
                    style={{
                        fontFamily: "'Roboto', Arial, sans-serif",
                        borderRadius: '8px',
                        background: selectedSet === null ? '#f5f5f7' : 'rgba(255, 255, 255, 0.1)',
                        color: selectedSet === null ? '#0f0f0f' : '#f5f5f7',
                        border: 'none',
                        fontWeight: 500,
                    }}
                >
                    Tout
                </button>

                {/* Set buttons */}
                {sortedSets.map(setNum => (
                    <button
                        key={setNum}
                        onClick={() => setSelectedSet(setNum)}
                        className="px-3 py-1.5 text-sm whitespace-nowrap transition-all duration-150"
                        style={{
                            fontFamily: "'Roboto', Arial, sans-serif",
                            borderRadius: '8px',
                            background: selectedSet === setNum ? '#f5f5f7' : 'rgba(255, 255, 255, 0.1)',
                            color: selectedSet === setNum ? '#0f0f0f' : '#f5f5f7',
                            border: 'none',
                            fontWeight: 500,
                        }}
                    >
                        Set {setNum}
                    </button>
                ))}
            </div>

            {/* Clips list - YouTube style scrollable with fixed height */}
            <div
                className="space-y-2 overflow-y-auto pr-2"
                style={{
                    maxHeight: 'calc(100vh - 222px)',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#3a3a3c transparent',
                }}
            >
                {displayedClips.map(({ clip, setNum }, index) => {
                    const isActive = currentClip === clip.id;

                    return (
                        <button
                            key={clip.id}
                            onClick={(e) => {
                                e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                onClipSelect(clip.id);
                            }}
                            className="w-full flex gap-2 p-0 text-left transition-all duration-150 group rounded-lg"
                            style={{
                                background: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) e.currentTarget.style.background = 'transparent';
                            }}
                        >

                            <div
                                className="w-6 flex-shrink-0 flex items-center justify-center text-xs relative"
                                style={{
                                    fontFamily: "'Roboto', Arial, sans-serif",
                                    color: isActive ? '#f5f5f7' : '#aaaaaa',
                                }}
                            >
                                {isActive && (
                                    <div
                                        className="absolute left-0 top-0 h-full w-1"
                                        style={{ background: '#ffffff' }}
                                    />
                                )}
                            </div>
                                
                            {/* Thumbnail */}
                            <div
                                className="w-[120px] h-[68px] flex-shrink-0 my-2 relative overflow-hidden"
                                style={{ borderRadius: '8px' }}
                            >
                                {clip.has_thumbnail ? (
                                    <img
                                        src={`${apiUrl}/api/videos/${videoId}/clips/${clip.id}/thumbnail`}
                                        alt={`Point ${clip.point}`}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                ) : (
                                    <div
                                        className="w-full h-full flex i tems-center justify-center"
                                        style={{ background: '#2c2c2e' }}
                                    >
                                        <svg
                                            className="w-8 h-8"
                                            fill="none"
                                            stroke="#aaaaaa"
                                            strokeWidth="1"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                                        </svg>
                                    </div>
                                )}

                                
                                
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0 py-4">
                                <h4
                                    className="text-sm font-medium line-clamp-2 leading-snug mb-1"
                                    style={{
                                        fontFamily: "'Roboto', Arial, sans-serif",
                                        color: '#f5f5f7',
                                    }}
                                >
                                    Point {clip.point}
                                </h4>
                                <p
                                    className="text-xs"
                                    style={{
                                        fontFamily: "'Roboto', Arial, sans-serif",
                                        color: '#f5f5f7',
                                    }}
                                >
                                    Set {setNum}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
