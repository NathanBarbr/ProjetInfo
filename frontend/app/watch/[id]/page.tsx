"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import VideoPlayer from "@/components/VideoPlayer";
import ClipsSidebar from "@/components/ClipsSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import ServerProfilePanel from "@/components/ServerProfilePanel";
import PointTrajectory from "@/components/PointTrajectory";
import MomentumChart from "@/components/MomentumChart";
import { FavoriteItem, loadFavorites, upsertFavorite, removeFavorite } from "@/lib/favorites";


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

interface PointDetail {
    match_id: string;
    set_num: number;
    point_id: number;
    nb_coups?: number;
    duree_frames?: number;
    serveur?: string;
    winner?: string;
    faute_type?: string;
    dernier_coup?: string;
    service_zone?: string;
    service_lateralite?: string;
    is_set_point?: boolean;
    is_point_gagnant?: boolean;
    sequence_zones?: string;
    sequence_effets?: string;
    sequence_coups?: string;
    player_A?: string;
    player_B?: string;
    score_A?: number;
    score_B?: number;
    set_A?: number;
    set_B?: number;
}

interface ClipsData {
    video_id: string;
    sets: { [key: string]: Clip[] };
    total_clips: number;
}

interface CommentItem {
    text: string;
    createdAt: number;
}

const API_URL = "http://localhost:8001";          // vidéos/streams
const SEARCH_API_URL = "http://localhost:8001";   // FastAPI + ES

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
    const [isFavorite, setIsFavorite] = useState(false);
    const [pointDetail, setPointDetail] = useState<PointDetail | null>(null);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [newComment, setNewComment] = useState("");
    const [queue, setQueue] = useState<{ videoSlug: string; clipId: string }[]>([]);
    const [autoNext, setAutoNext] = useState(false);
    const [skipSeconds, setSkipSeconds] = useState(1);
    const videoWrapRef = useRef<HTMLDivElement>(null);
    const [isMiniPlayer, setIsMiniPlayer] = useState(false);
    const [miniPlayerDismissed, setMiniPlayerDismissed] = useState(false);
    const [videoHeight, setVideoHeight] = useState<number | null>(null);

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

    // Fetch point detail for current clip
    useEffect(() => {
        if (!currentClip) {
            setPointDetail(null);
            return;
        }

        // extract point number
        const match = currentClip.match(/point_(\d+)/);
        if (!match) {
            setPointDetail(null);
            return;
        }
        const pointId = Number(match[1]);

        const matchId = slugToMatchId(videoId.toString());

        fetch(`${API_URL}/api/search/point/${matchId}/${pointId}`)
            .then((res) => res.ok ? res.json() : null)
            .then((data) => setPointDetail(data))
            .catch(() => setPointDetail(null));
    }, [videoId, currentClip]);

    // Load queue if coming from "queue" param
    useEffect(() => {
        if (typeof window === "undefined") return;
        const hasQueue = searchParams.get("queue");
        if (hasQueue) {
            try {
                const raw = localStorage.getItem("pp_queue");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) setQueue(parsed);
                }
            } catch {
                setQueue([]);
            }
        }
    }, [searchParams]);

    const getCommentKey = () => `pp_comments_${videoId}_${currentClip || "main"}`;

    // Load comments for this video/clip
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(getCommentKey());
            if (!raw) {
                setComments([]);
                return;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) setComments(parsed);
            else setComments([]);
        } catch {
            setComments([]);
        }
    }, [videoId, currentClip]);

    // Update URL when clip changes (without full navigation)
    // We want to preserve backUrl if it exists!
    const handleClipSelect = (clipId: string) => {
        setCurrentClip(clipId);
        // Update URL without reload
        const newParams = new URLSearchParams(window.location.search);
        newParams.set("clip", clipId);
        window.history.pushState({}, "", `/watch/${videoId}?${newParams.toString()}`);
    };

    // Sync favorite state with localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        const favId = `${videoId}_${currentClip || "main"}`;
        const exists = loadFavorites().some((f) => f.id === favId);
        setIsFavorite(exists);
    }, [videoId, currentClip]);

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

    const slugToMatchId = (slug: string) => {
        const mapping: Record<string, string> = {
            "fan-zhendong-vs-moregard": "FAN-ZHENDONG_vs_TRULS-MOREGARD",
            "hugo-calderano-vs-felix-lebrun": "HUGO-CALDERANO_vs_FELIX-LEBRUN",
        };
        if (mapping[slug]) return mapping[slug];
        const parts = slug.split("-vs-");
        if (parts.length === 2) {
            const left = parts[0].replace(/-/g, "-").toUpperCase();
            const right = parts[1].replace(/-/g, "-").toUpperCase();
            return `${left}_vs_${right}`;
        }
        return slug;
    };

    const toggleFavorite = () => {
        const favId = `${videoId}_${currentClip || "main"}`;
        const item: FavoriteItem = {
            id: favId,
            videoSlug: videoId,
            clipId: currentClip,
            title: getCurrentTitle(),
            matchLabel: meta?.title,
            thumbnail: currentClip ? `${API_URL}/api/videos/${videoId}/clips/${currentClip}/thumbnail` : undefined,
            addedAt: Date.now()
        };

        if (isFavorite) {
            removeFavorite(favId);
            setIsFavorite(false);
        } else {
            upsertFavorite(item);
            setIsFavorite(true);
        }
    };

    const addComment = () => {
        const text = newComment.trim();
        if (!text) return;
        const next: CommentItem[] = [{ text, createdAt: Date.now() }, ...comments];
        setComments(next);
        setNewComment("");
        if (typeof window !== "undefined") {
            localStorage.setItem(getCommentKey(), JSON.stringify(next));
        }
    };

    // Auto-next handler based on duration
    useEffect(() => {
        if (!autoNext || queue.length === 0 || !currentClip) return;
        const currentIndex = queue.findIndex(q => q.clipId === currentClip);
        if (currentIndex === -1 || currentIndex === queue.length - 1) return; // no next
        const durationSec = pointDetail?.duree_frames ? pointDetail.duree_frames / 25 : null;
        if (!durationSec) return;
        const ms = Math.max(1000, (durationSec - skipSeconds) * 1000);
        const timer = setTimeout(() => {
            const next = queue[currentIndex + 1];
            if (next) {
                const newParams = new URLSearchParams(window.location.search);
                newParams.set("clip", next.clipId);
                newParams.set("queue", "1");
                window.location.href = `/watch/${next.videoSlug}?${newParams.toString()}`;
            }
        }, ms);
        return () => clearTimeout(timer);
    }, [autoNext, queue, currentClip, pointDetail, skipSeconds]);

    useEffect(() => {
        const hasStats = Boolean(currentClip);
        if (typeof window === "undefined" || !hasStats) {
            setIsMiniPlayer(false);
            return;
        }

        const updateHeight = () => {
            if (videoWrapRef.current) {
                setVideoHeight(videoWrapRef.current.offsetHeight);
            }
        };

        const onScroll = () => {
            if (!videoWrapRef.current) return;
            const rect = videoWrapRef.current.getBoundingClientRect();
            const shouldMini = rect.bottom < 12;
            setIsMiniPlayer(shouldMini);
        };

        updateHeight();
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", updateHeight);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", updateHeight);
        };
    }, [currentClip]);

    useEffect(() => {
        if (!isMiniPlayer) {
            setMiniPlayerDismissed(false);
        }
    }, [isMiniPlayer]);


    const buildDescription = () => {
        const p = pointDetail;
        if (!p) return "Point complet.";
        const parts: string[] = [];
        parts.push(`Set ${p.set_num ?? "?"} · Point ${p.point_id ?? "?"}`);
        if (p.nb_coups !== undefined) parts.push(`${p.nb_coups} coups`);
        if (p.duree_frames !== undefined) parts.push(`~${Math.max(1, Math.round(p.duree_frames / 25))}s`);
        if (p.serveur) {
            parts.push(`Service ${p.serveur}${p.service_zone ? ` (${p.service_zone})` : ""}${p.service_lateralite ? ` main ${p.service_lateralite.replace("_", " ")}` : ""}`);
        }
        if (p.winner) parts.push(`Point remporté par ${p.winner}${p.is_point_gagnant ? " (gagnant direct)" : ""}`);
        if (p.faute_type && p.faute_type !== "pt_gagne") parts.push(`Fin sur faute : ${p.faute_type}`);
        if (p.dernier_coup) parts.push(`Dernier coup : ${p.dernier_coup}`);
        if (p.is_set_point) parts.push("Balle de set");
        return parts.join(". ") + ".";
    };

    const handleMomentumPointSelect = (pointId: number, setNum: number) => {
        const clipId = `set_${setNum}_point_${pointId}`;
        setCurrentClip(clipId);
        const newParams = new URLSearchParams(window.location.search);
        newParams.set("clip", clipId);
        window.history.pushState({}, "", `/watch/${videoId}?${newParams.toString()}`);
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

                    <div className="flex items-center gap-3">

                        {queue.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={autoNext}
                                        onChange={(e) => setAutoNext(e.target.checked)}
                                    />
                                    Auto-next
                                </label>
                                <label className="flex items-center gap-1">
                                    Skip
                                    <input
                                        type="number"
                                        min={0}
                                        max={10}
                                        value={skipSeconds}
                                        onChange={(e) => setSkipSeconds(Number(e.target.value) || 0)}
                                        className="w-12 px-1 py-0.5 bg-card border border-input rounded text-xs"
                                    />
                                    s avant fin
                                </label>
                            </div>
                        )}
                        <ThemeToggle />
                    </div>
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
                                <div
                                    ref={videoWrapRef}
                                    style={isMiniPlayer && videoHeight ? { height: videoHeight } : undefined}
                                >
                                    <div
                                        className={
                                            isMiniPlayer && !miniPlayerDismissed
                                                ? "fixed bottom-6 right-6 z-50 w-[420px] md:w-[480px] max-w-[92vw] shadow-2xl"
                                                : ""
                                        }
                                        style={isMiniPlayer && !miniPlayerDismissed ? { background: "#000", borderRadius: 12, border: "1px solid #3a3a3c", overflow: "hidden" } : undefined}
                                    >
                                        {isMiniPlayer && !miniPlayerDismissed && (
                                            <button
                                                type="button"
                                                onClick={() => setMiniPlayerDismissed(true)}
                                                className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center"
                                                style={{ background: "rgba(28, 28, 30, 0.7)", border: "1px solid #3a3a3c", color: "#f5f5f7" }}
                                                aria-label="Fermer le mini lecteur"
                                            >
                                                ×
                                            </button>
                                        )}
                                        <VideoPlayer
                                            key={currentClip || "main"} // Force remount when clip changes
                                            src={getVideoSrc()}
                                            title={getCurrentTitle()}
                                            description={currentClip ? undefined : meta?.description}
                                            minimalUi={isMiniPlayer && !miniPlayerDismissed}
                                        />
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center gap-3">
                                    <button
                                        onClick={toggleFavorite}
                                        className={`flex items-center gap-2 px-4 py-2 text-sm rounded-full border transition-colors ${isFavorite
                                            ? "border-amber-400 bg-amber-400 text-black"
                                            : "border-input bg-card text-foreground hover:bg-muted"
                                            }`}
                                    >
                                        <svg
                                            className="w-4 h-4"
                                            viewBox="0 0 24 24"
                                            fill={isFavorite ? "currentColor" : "none"}
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M12 17.27l5.18 3.14-1.4-5.98L20 9.24l-6.18-.52L12 3l-1.82 5.72L4 9.24l4.22 5.19-1.4 5.98L12 17.27z"
                                            />
                                        </svg>
                                        <span>{isFavorite ? "Favori" : "Ajouter"}</span>
                                    </button>
                                </div>


                                {/* Description */}
                                {currentClip && (
                                    <div className="mt-4 p-4 border border-input rounded-lg bg-card">
                                        <h3 className="text-sm font-semibold mb-1">Description du point</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {buildDescription()}
                                        </p>
                                    </div>
                                )}

                                {/* Commentaires */}
                                <div className="mt-4 p-4 border border-input rounded-lg bg-card">
                                    <h3 className="text-sm font-semibold mb-3">Commentaires</h3>
                                    <div className="flex flex-col sm:flex-row gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            placeholder="Écris un commentaire…"
                                            className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") addComment();
                                            }}
                                        />
                                        <button
                                            onClick={addComment}
                                            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                                        >
                                            Envoyer
                                        </button>
                                    </div>
                                    {comments.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">Aucun commentaire pour l’instant.</p>
                                    ) : (
                                        <div className="space-y-3 max-h-64 overflow-auto pr-1">
                                            {comments.map((c, idx) => (
                                                <div key={idx} className="p-2 bg-background border border-input rounded-lg">
                                                    <p className="text-sm text-foreground">{c.text}</p>
                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                        {new Date(c.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right sidebar: clips */}
                            <div className="w-full lg:w-80 flex flex-col gap-6 flex-shrink-0">
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
                        </div>
                    )}

                    {/* Point Trajectory Animation */}
                    {currentClip && pointDetail?.sequence_zones && pointDetail?.sequence_effets && (
                        <div className="mt-8 max-w-5xl mx-auto">
                            <PointTrajectory
                                sequenceZones={pointDetail.sequence_zones}
                                sequenceEffets={pointDetail.sequence_effets}
                                serveur={pointDetail.serveur || ""}
                                winner={pointDetail.winner || ""}
                                playerA={pointDetail.player_A || ""}
                                playerB={pointDetail.player_B || ""}
                            />
                        </div>
                    )}

                    {/* Server Profile Panel — full width below video */}
                    {currentClip && pointDetail?.serveur && (
                        <div className="mt-8 max-w-5xl mx-auto">
                            <ServerProfilePanel
                                serverName={pointDetail.serveur}
                                matchId={pointDetail.match_id || null}
                                apiUrl={API_URL}
                            />
                        </div>
                    )}

                    {/* Momentum Chart */}
                    {currentClip && pointDetail?.match_id && (
                        <div className="mt-8 max-w-5xl mx-auto">
                            <MomentumChart
                                matchId={pointDetail.match_id}
                                apiUrl={SEARCH_API_URL}
                                currentPointId={pointDetail.point_id}
                                onPointSelect={(point) => handleMomentumPointSelect(point.point_id, point.set_num)}
                            />
                            <div className="mt-3 text-center">
                                <Link
                                    href={`/compare?match_id=${encodeURIComponent(pointDetail.match_id)}`}
                                    className="text-xs px-4 py-2 rounded-lg inline-flex items-center gap-1.5 transition-colors"
                                    style={{ background: "#2c2c2e", color: "#0a84ff", border: "1px solid #3a3a3c" }}
                                >
                                    Voir la comparaison complète des joueurs
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
