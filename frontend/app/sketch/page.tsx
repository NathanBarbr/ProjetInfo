"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import PointTrajectory from "@/components/PointTrajectory";

const API_URL = "http://localhost:8001";
const TABLE_WIDTH = 612;
const TABLE_HEIGHT = 367;
const DISPLAY_WIDTH = TABLE_HEIGHT;
const DISPLAY_HEIGHT = TABLE_WIDTH;
const TABLE_LEFT = 63;
const TABLE_TOP = 56;
const TABLE_INNER_WIDTH = 486;
const TABLE_INNER_HEIGHT = 268;
const HALF_WIDTH = TABLE_INNER_WIDTH / 2;

type EffectKey = "service" | "poussette" | "topspin" | "bloc" | "flip" | "coupe" | "lob";

interface DrawnShot {
    zone: string;
    effect: EffectKey;
    renderX: number;
    renderY: number;
}

interface SearchMatch {
    id: string;
    match_id: string;
    point_id: number;
    winner?: string;
    serveur?: string;
    player_A?: string;
    player_B?: string;
    sequence_zones?: string;
    sequence_effets?: string;
    description?: string;
    similarity_score?: number;
    clip_path?: string;
}

interface SketchResponse {
    best_match: SearchMatch | null;
    matches: SearchMatch[];
    total_candidates: number;
}

const EFFECT_OPTIONS: { key: EffectKey; label: string; color: string }[] = [
    { key: "service", label: "Service", color: "#0a84ff" },
    { key: "poussette", label: "Poussette", color: "#30d158" },
    { key: "topspin", label: "Topspin", color: "#ff453a" },
    { key: "bloc", label: "Bloc", color: "#bf5af2" },
    { key: "flip", label: "Flip", color: "#ff9f0a" },
    { key: "coupe", label: "Coupe", color: "#64d2ff" },
    { key: "lob", label: "Lob", color: "#ffd60a" },
];

const ZONE_LABELS = [
    { zone: "g3", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.12, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.14 },
    { zone: "g2", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.25, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.14 },
    { zone: "g1", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.38, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.14 },
    { zone: "m3", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.12, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.50 },
    { zone: "m2", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.25, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.50 },
    { zone: "m1", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.38, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.50 },
    { zone: "d3", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.12, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.86 },
    { zone: "d2", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.25, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.86 },
    { zone: "d1", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.38, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.86 },
    { zone: "d1", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.62, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.14 },
    { zone: "d2", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.75, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.14 },
    { zone: "d3", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.88, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.14 },
    { zone: "m1", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.62, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.50 },
    { zone: "m2", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.75, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.50 },
    { zone: "m3", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.88, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.50 },
    { zone: "g1", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.62, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.86 },
    { zone: "g2", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.75, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.86 },
    { zone: "g3", x: TABLE_LEFT + TABLE_INNER_WIDTH * 0.88, y: TABLE_TOP + TABLE_INNER_HEIGHT * 0.86 },
];

function inferZoneFromBoardClick(boardX: number, boardY: number): { zone: string; renderX: number; renderY: number } | null {
    if (
        boardX < TABLE_LEFT ||
        boardX > TABLE_LEFT + TABLE_INNER_WIDTH ||
        boardY < TABLE_TOP ||
        boardY > TABLE_TOP + TABLE_INNER_HEIGHT
    ) {
        return null;
    }

    const localX = boardX - TABLE_LEFT;
    const localY = boardY - TABLE_TOP;
    const isRightHalf = localX >= HALF_WIDTH;
    const halfX = isRightHalf ? localX - HALF_WIDTH : localX;
    const normalizedX = halfX / HALF_WIDTH;
    const normalizedY = localY / TABLE_INNER_HEIGHT;
    const depth = isRightHalf ? normalizedX : 1 - normalizedX;
    const lateral = isRightHalf ? 1 - normalizedY : normalizedY;

    const col = lateral < 1 / 3 ? "g" : lateral < 2 / 3 ? "m" : "d";
    const row = depth < 1 / 3 ? "1" : depth < 2 / 3 ? "2" : "3";

    return {
        zone: `${col}${row}`,
        renderX: boardX,
        renderY: boardY,
    };
}

function displayToBoard(displayX: number, displayY: number) {
    return {
        x: displayY,
        y: TABLE_HEIGHT - displayX,
    };
}

function boardToDisplay(boardX: number, boardY: number) {
    return {
        x: TABLE_HEIGHT - boardY,
        y: boardX,
    };
}

function getSlug(matchId: string) {
    const mapping: Record<string, string> = {
        "FAN-ZHENDONG_vs_TRULS-MOREGARD": "fan-zhendong-vs-moregard",
        "HUGO-CALDERANO_vs_FELIX-LEBRUN": "hugo-calderano-vs-felix-lebrun",
    };
    return mapping[matchId] || matchId.toLowerCase().replace(/_/g, "-");
}

function getClipId(match: SearchMatch) {
    if (match.clip_path) {
        const parts = match.clip_path.split("/");
        if (parts.length >= 2) return parts[1];
    }
    return `set_1_point_${match.point_id}`;
}

export default function SketchPage() {
    const [shots, setShots] = useState<DrawnShot[]>([]);
    const [selectedEffect, setSelectedEffect] = useState<EffectKey>("service");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SketchResponse | null>(null);

    const activeEffect = EFFECT_OPTIONS.find((option) => option.key === selectedEffect) ?? EFFECT_OPTIONS[0];

    const paths = useMemo(() => {
        return shots.slice(1).map((shot, index) => ({
            from: shots[index],
            to: shot,
        }));
    }, [shots]);

    const handleBoardClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const displayX = ((event.clientX - bounds.left) / bounds.width) * DISPLAY_WIDTH;
        const displayY = ((event.clientY - bounds.top) / bounds.height) * DISPLAY_HEIGHT;
        const boardPoint = displayToBoard(displayX, displayY);
        const mapped = inferZoneFromBoardClick(boardPoint.x, boardPoint.y);
        if (!mapped) return;
        const displayPoint = boardToDisplay(mapped.renderX, mapped.renderY);

        setShots((prev) => [
            ...prev,
            {
                zone: mapped.zone,
                effect: selectedEffect,
                renderX: displayPoint.x,
                renderY: displayPoint.y,
            },
        ]);

        if (selectedEffect === "service") {
            setSelectedEffect("topspin");
        }
    };

    const handleSearch = async () => {
        if (shots.length === 0) {
            setError("Dessine au moins un rebond sur la table.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${API_URL}/api/semantic/sketch-search`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    zones: shots.map((shot) => shot.zone),
                    effets: shots.map((shot) => shot.effect),
                    top_k: 5,
                }),
            });

            if (!response.ok) {
                const payload = await response.text();
                throw new Error(payload || "Recherche impossible");
            }

            const data: SketchResponse = await response.json();
            setResult(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Recherche impossible";
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
            <header
                className="sticky top-0 z-50"
                style={{
                    background: "color-mix(in srgb, var(--card) 80%, transparent)",
                    backdropFilter: "blur(15px)",
                    WebkitBackdropFilter: "blur(15px)",
                    borderBottom: "1px solid var(--border)",
                }}
            >
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="text-sm" style={{ color: "var(--muted-foreground)", fontFamily: "'Inter', sans-serif" }}>
                            Back
                        </Link>
                        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif" }} className="text-xl font-semibold">
                            Sketch Search
                        </h1>
                    </div>
                    <ThemeToggle />
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
                <section
                    className="rounded-3xl p-6"
                    style={{
                        background: "color-mix(in srgb, var(--card) 70%, transparent)",
                        border: "1px solid var(--border)",
                        backdropFilter: "blur(20px)",
                    }}
                >
                    <div className="flex items-start justify-between gap-4 mb-5">
                        <div>
                            <h2 className="text-lg font-semibold" style={{ fontFamily: "'Inter', sans-serif" }}>
                                Dessine le point
                            </h2>
                            <p className="text-sm mt-1" style={{ color: "#86868b" }}>
                                Clique sur la table pour placer les rebonds dans l ordre. Le haut est le joueur adverse, le bas ton serveur.
                            </p>
                        </div>
                        <div
                            className="rounded-2xl px-3 py-2 text-xs"
                            style={{ background: "rgba(8,12,18,0.4)", border: "1px solid #3a3a3c", color: activeEffect.color }}
                        >
                            Prochain coup: {activeEffect.label}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-5">
                        {EFFECT_OPTIONS.map((option) => (
                            <button
                                key={option.key}
                                onClick={() => setSelectedEffect(option.key)}
                                className="px-3 py-2 rounded-full text-xs transition-colors"
                                style={{
                                    border: `1px solid ${selectedEffect === option.key ? option.color : "#3a3a3c"}`,
                                    background: selectedEffect === option.key ? `${option.color}22` : "rgba(44,44,46,0.6)",
                                    color: selectedEffect === option.key ? "#f5f5f7" : "#c7c7cc",
                                }}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div
                        onClick={handleBoardClick}
                        className="relative w-full overflow-hidden rounded-[28px] cursor-crosshair select-none"
                        style={{
                            maxWidth: 440,
                            margin: "0 auto",
                            aspectRatio: "367 / 612",
                            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)",
                        }}
                    >
                        <svg viewBox={`0 0 ${DISPLAY_WIDTH} ${DISPLAY_HEIGHT}`} className="absolute inset-0 h-full w-full">
                            <g transform={`translate(${DISPLAY_WIDTH} 0) rotate(90)`}>
                                <image href="/table-tennis-table-user.jpg" x="0" y="0" width={TABLE_WIDTH} height={TABLE_HEIGHT} preserveAspectRatio="none" />
                                <rect x="0" y="0" width={TABLE_WIDTH} height={TABLE_HEIGHT} fill="rgba(7,11,17,0.08)" />
                                {[1 / 6, 2 / 6, 4 / 6, 5 / 6].map((ratio) => (
                                    <line
                                        key={`v-${ratio}`}
                                        x1={TABLE_LEFT + TABLE_INNER_WIDTH * ratio}
                                        y1={TABLE_TOP}
                                        x2={TABLE_LEFT + TABLE_INNER_WIDTH * ratio}
                                        y2={TABLE_TOP + TABLE_INNER_HEIGHT}
                                        stroke="rgba(255,255,255,0.18)"
                                        strokeWidth={1}
                                        strokeDasharray="5 6"
                                    />
                                ))}
                                {[1 / 3, 2 / 3].map((ratio) => (
                                    <line
                                        key={`h-${ratio}`}
                                        x1={TABLE_LEFT}
                                        y1={TABLE_TOP + TABLE_INNER_HEIGHT * ratio}
                                        x2={TABLE_LEFT + TABLE_INNER_WIDTH}
                                        y2={TABLE_TOP + TABLE_INNER_HEIGHT * ratio}
                                        stroke="rgba(255,255,255,0.18)"
                                        strokeWidth={1}
                                        strokeDasharray="5 6"
                                    />
                                ))}
                                {ZONE_LABELS.map((zone, index) => (
                                    <g key={`${zone.zone}-${index}`}>
                                        <rect
                                            x={zone.x - 12}
                                            y={zone.y - 8}
                                            width={24}
                                            height={16}
                                            rx={8}
                                            fill="rgba(8, 12, 18, 0.36)"
                                            stroke="rgba(255,255,255,0.12)"
                                            strokeWidth={0.8}
                                        />
                                        <text
                                            x={zone.x}
                                            y={zone.y + 3}
                                            textAnchor="middle"
                                            fill="rgba(245,245,247,0.9)"
                                            style={{ fontSize: "8px", fontWeight: 600 }}
                                        >
                                            {zone.zone}
                                        </text>
                                    </g>
                                ))}
                            </g>
                            {paths.map((path, index) => {
                                const color = EFFECT_OPTIONS.find((option) => option.key === path.to.effect)?.color ?? "#f5f5f7";
                                return (
                                    <line
                                        key={`${path.from.zone}-${path.to.zone}-${index}`}
                                        x1={path.from.renderX}
                                        y1={path.from.renderY}
                                        x2={path.to.renderX}
                                        y2={path.to.renderY}
                                        stroke={color}
                                        strokeWidth={3}
                                        strokeLinecap="round"
                                        opacity={0.95}
                                    />
                                );
                            })}
                            {shots.map((shot, index) => {
                                const color = EFFECT_OPTIONS.find((option) => option.key === shot.effect)?.color ?? "#f5f5f7";
                                return (
                                    <g key={`${shot.zone}-${index}`}>
                                        <circle cx={shot.renderX} cy={shot.renderY} r={index === shots.length - 1 ? 11 : 8} fill={color} stroke="#fff" strokeWidth={2} />
                                        <text x={shot.renderX} y={shot.renderY + 3.5} textAnchor="middle" fill="#fff" style={{ fontSize: "9px", fontWeight: 700 }}>
                                            {index + 1}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                        {shots.map((shot, index) => (
                            <span
                                key={`${shot.zone}-${index}`}
                                className="px-2.5 py-1.5 rounded-full text-xs"
                                style={{
                                    background: "rgba(58,58,60,0.7)",
                                    border: "1px solid #3a3a3c",
                                    color: "#f5f5f7",
                                }}
                            >
                                {index + 1}. {shot.effect} {"->"} {shot.zone}
                            </span>
                        ))}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                        <button
                            onClick={handleSearch}
                            disabled={loading || shots.length === 0}
                            className="px-4 py-2 rounded-xl text-sm font-medium"
                            style={{
                                background: loading || shots.length === 0 ? "#3a3a3c" : "#0a84ff",
                                color: "#fff",
                                opacity: loading || shots.length === 0 ? 0.6 : 1,
                            }}
                        >
                            {loading ? "Recherche..." : "Trouver le point le plus proche"}
                        </button>
                        <button
                            onClick={() => setShots((prev) => prev.slice(0, -1))}
                            disabled={shots.length === 0}
                            className="px-4 py-2 rounded-xl text-sm font-medium"
                            style={{ background: "#2c2c2e", color: "#f5f5f7", opacity: shots.length === 0 ? 0.5 : 1 }}
                        >
                            Annuler le dernier
                        </button>
                        <button
                            onClick={() => {
                                setShots([]);
                                setResult(null);
                                setError(null);
                                setSelectedEffect("service");
                            }}
                            className="px-4 py-2 rounded-xl text-sm font-medium"
                            style={{ background: "#2c2c2e", color: "#f5f5f7" }}
                        >
                            Effacer
                        </button>
                    </div>

                    {error && (
                        <p className="mt-4 text-sm" style={{ color: "#ff9f0a" }}>
                            {error}
                        </p>
                    )}
                </section>

                <section className="space-y-6">
                    <div
                        className="rounded-3xl p-6"
                        style={{
                            background: "rgba(44, 44, 46, 0.6)",
                            border: "1px solid #3a3a3c",
                            backdropFilter: "blur(20px)",
                        }}
                    >
                        <h2 className="text-lg font-semibold mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>
                            Meilleur match
                        </h2>
                        {!result?.best_match && (
                            <p className="text-sm" style={{ color: "#86868b" }}>
                                Lance une recherche pour voir le point le plus proche de ton dessin.
                            </p>
                        )}

                        {result?.best_match && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold">{result.best_match.match_id}</div>
                                        <div className="text-xs" style={{ color: "#86868b" }}>
                                            Point {result.best_match.point_id} · similarite {(Number(result.best_match.similarity_score || 0) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                    <Link
                                        href={`/watch/${getSlug(result.best_match.match_id)}?clip=${getClipId(result.best_match)}`}
                                        className="px-3 py-2 rounded-xl text-xs"
                                        style={{ background: "#0a84ff", color: "#fff" }}
                                    >
                                        Ouvrir
                                    </Link>
                                </div>

                                {result.best_match.description && (
                                    <p className="text-sm" style={{ color: "#d1d1d6" }}>
                                        {result.best_match.description}
                                    </p>
                                )}

                                {result.best_match.sequence_zones && result.best_match.sequence_effets && (
                                    <PointTrajectory
                                        sequenceZones={result.best_match.sequence_zones}
                                        sequenceEffets={result.best_match.sequence_effets}
                                        serveur={result.best_match.serveur || ""}
                                        winner={result.best_match.winner || ""}
                                        playerA={result.best_match.player_A || "Player A"}
                                        playerB={result.best_match.player_B || "Player B"}
                                    />
                                )}
                            </div>
                        )}
                    </div>

                </section>

                <section
                    className="rounded-3xl p-6"
                    style={{
                        background: "rgba(44, 44, 46, 0.6)",
                        border: "1px solid #3a3a3c",
                        backdropFilter: "blur(20px)",
                    }}
                >
                    <h2 className="text-lg font-semibold mb-4" style={{ fontFamily: "'Inter', sans-serif" }}>
                        Top correspondances
                    </h2>
                    <div className="space-y-3">
                        {result?.matches?.map((match) => (
                            <div
                                key={match.id}
                                className="rounded-2xl p-4 flex items-center justify-between gap-4"
                                style={{ background: "rgba(28,28,30,0.88)", border: "1px solid #3a3a3c" }}
                            >
                                <div>
                                    <div className="text-sm font-medium">{match.match_id}</div>
                                    <div className="text-xs" style={{ color: "#86868b" }}>
                                        Point {match.point_id} · {(Number(match.similarity_score || 0) * 100).toFixed(1)}%
                                    </div>
                                </div>
                                <Link
                                    href={`/watch/${getSlug(match.match_id)}?clip=${getClipId(match)}`}
                                    className="text-xs px-3 py-2 rounded-xl"
                                    style={{ background: "#2c2c2e", color: "#f5f5f7" }}
                                >
                                    Voir
                                </Link>
                            </div>
                        ))}
                        {!result?.matches?.length && (
                            <p className="text-sm" style={{ color: "#86868b" }}>
                                Aucune correspondance pour l instant.
                            </p>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}
