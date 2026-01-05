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
    const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set(["1"]));

    const toggleSet = (setNum: string) => {
        setExpandedSets((prev) => {
            const next = new Set(prev);
            if (next.has(setNum)) {
                next.delete(setNum);
            } else {
                next.add(setNum);
            }
            return next;
        });
    };

    if (!clipsData || Object.keys(clipsData.sets).length === 0) {
        return (
            <div className="w-full lg:w-80 bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
                <p className="text-zinc-500 text-sm text-center">No clips available</p>
            </div>
        );
    }

    const sortedSets = Object.keys(clipsData.sets).sort((a, b) => parseInt(a) - parseInt(b));

    return (
        <div className="w-full lg:w-80 bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden flex flex-col max-h-[600px]">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 flex-shrink-0">
                <h3 className="text-sm font-medium text-zinc-300">
                    Points ({clipsData.total_clips})
                </h3>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1">
                {sortedSets.map((setNum) => (
                    <div key={setNum} className="border-b border-zinc-800 last:border-b-0">
                        {/* Set header - accordion toggle */}
                        <button
                            onClick={() => toggleSet(setNum)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
                        >
                            <span className="text-sm font-medium text-zinc-200">
                                Set {setNum}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500">
                                    {clipsData.sets[setNum].length} points
                                </span>
                                <svg
                                    className={`w-4 h-4 text-zinc-500 transition-transform ${expandedSets.has(setNum) ? "rotate-180" : ""}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </button>

                        {/* Clips list */}
                        {expandedSets.has(setNum) && (
                            <div className="pb-2">
                                {clipsData.sets[setNum].map((clip) => (
                                    <button
                                        key={clip.id}
                                        onClick={() => onClipSelect(clip.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/50 transition-colors ${currentClip === clip.id ? "bg-purple-500/10 border-l-2 border-purple-500" : ""}`}
                                    >
                                        {/* Thumbnail */}
                                        <div className="w-16 h-10 rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                                            {clip.has_thumbnail ? (
                                                <img
                                                    src={`${apiUrl}/api/videos/${videoId}/clips/${clip.id}/thumbnail`}
                                                    alt={`Point ${clip.point}`}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M8 5v14l11-7z" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>

                                        {/* Point info */}
                                        <div className="text-left">
                                            <p className={`text-sm ${currentClip === clip.id ? "text-purple-400 font-medium" : "text-zinc-300"}`}>
                                                Point {clip.point}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
