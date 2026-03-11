"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import MomentumChart from "@/components/MomentumChart";

const API_URL = "http://localhost:8001"; // search/backend API
const DEFAULT_MATCHES = [
    "FAN-ZHENDONG_vs_TRULS-MOREGARD",
    "HUGO-CALDERANO_vs_FELIX-LEBRUN",
];
const SAMPLE_POINTS = [
    { match_id: "FAN-ZHENDONG_vs_TRULS-MOREGARD", player_A: "FAN-ZHENDONG", player_B: "TRULS-MOREGARD", winner: "FAN-ZHENDONG", serveur: "FAN-ZHENDONG", nb_coups: 4, faute_type: "pt_gagne", dernier_coup: "topspin" },
    { match_id: "FAN-ZHENDONG_vs_TRULS-MOREGARD", player_A: "FAN-ZHENDONG", player_B: "TRULS-MOREGARD", winner: "TRULS-MOREGARD", serveur: "TRULS-MOREGARD", nb_coups: 3, faute_type: "out", dernier_coup: "poussette" },
    { match_id: "FAN-ZHENDONG_vs_TRULS-MOREGARD", player_A: "FAN-ZHENDONG", player_B: "TRULS-MOREGARD", winner: "FAN-ZHENDONG", serveur: "FAN-ZHENDONG", nb_coups: 7, faute_type: "pt_gagne", dernier_coup: "topspin" },
];

interface PlayerStats {
    player: string;
    points_won: number;
    points_lost: number;
    win_rate: number;
    service_total: number;
    service_won: number;
    service_win_rate: number;
    receive_total: number;
    receive_won: number;
    receive_win_rate: number;
    avg_rally_length_when_winning: number;
    avg_service_rally: number;
    winning_shots: { shot: string; count: number }[];
    faults: { type: string; count: number }[];
}

interface CompareData {
    match_id: string;
    total_points: number;
    player_A: PlayerStats;
    player_B: PlayerStats;
    __sample__?: boolean;
}

// Build minimal compare data from momentum/points when dedicated API fails
function buildFromPoints(matchId: string, points: any[]): CompareData | null {
    if (!points || points.length === 0) return null;
    const playerA = points[0].player_A || "Player A";
    const playerB = points[0].player_B || "Player B";

    const base = {
        points_won: 0,
        points_lost: 0,
        win_rate: 0,
        service_total: 0,
        service_won: 0,
        service_win_rate: 0,
        receive_total: 0,
        receive_won: 0,
        receive_win_rate: 0,
        avg_rally_length_when_winning: 0,
        avg_service_rally: 0,
        winning_shots: [] as { shot: string; count: number }[],
        faults: [] as { type: string; count: number }[],
    };

    const statA = { ...base, player: playerA };
    const statB = { ...base, player: playerB };

    const winShotsA: Record<string, number> = {};
    const winShotsB: Record<string, number> = {};
    const faultsA: Record<string, number> = {};
    const faultsB: Record<string, number> = {};

    points.forEach((p) => {
        const winner = p.winner;
        const srv = p.serveur;
        const nb = p.nb_coups || 0;
        const fault = p.faute_type;
        const lastShot = p.dernier_coup;

        if (winner === playerA) {
            statA.points_won += 1;
            statB.points_lost += 1;
            if (srv === playerA) {
                statA.service_won += 1;
            } else {
                statA.receive_won += 1;
            }
            if (lastShot) winShotsA[lastShot] = (winShotsA[lastShot] || 0) + 1;
            statA.avg_rally_length_when_winning += nb;
        } else if (winner === playerB) {
            statB.points_won += 1;
            statA.points_lost += 1;
            if (srv === playerB) {
                statB.service_won += 1;
            } else {
                statB.receive_won += 1;
            }
            if (lastShot) winShotsB[lastShot] = (winShotsB[lastShot] || 0) + 1;
            statB.avg_rally_length_when_winning += nb;
        }

        if (srv === playerA) statA.service_total += 1; else statB.service_total += 1;
        if (srv !== playerA) statA.receive_total += 1; else statB.receive_total += 1;

        if (fault && winner !== playerA) {
            faultsA[fault] = (faultsA[fault] || 0) + 1;
        }
        if (fault && winner !== playerB) {
            faultsB[fault] = (faultsB[fault] || 0) + 1;
        }
    });

    const total = points.length;
    const finalize = (s: any, winsShots: Record<string, number>, faults: Record<string, number>) => {
        s.win_rate = total ? Math.round((s.points_won / total) * 1000) / 10 : 0;
        s.service_win_rate = s.service_total ? Math.round((s.service_won / s.service_total) * 1000) / 10 : 0;
        s.receive_win_rate = s.receive_total ? Math.round((s.receive_won / s.receive_total) * 1000) / 10 : 0;
        s.avg_rally_length_when_winning = s.points_won ? Math.round((s.avg_rally_length_when_winning / s.points_won) * 10) / 10 : 0;
        s.avg_service_rally = s.service_total ? Math.round(((s.avg_service_rally || 0) / s.service_total) * 10) / 10 : 0;
        s.winning_shots = Object.entries(winsShots).map(([shot, count]) => ({ shot, count })).sort((a, b) => b.count - a.count);
        s.faults = Object.entries(faults).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    };
    finalize(statA, winShotsA, faultsA);
    finalize(statB, winShotsB, faultsB);

    return {
        match_id: matchId,
        total_points: total,
        player_A: statA,
        player_B: statB,
    };
}
// Stat bar that shows two players side by side — interactive
function DualBar({ label, valA, valB, maxVal, colorA, colorB }: {
    label: string; valA: number; valB: number; maxVal: number;
    colorA: string; colorB: string;
}) {
    const [hover, setHover] = useState(false);
    const pctA = maxVal > 0 ? (valA / maxVal) * 100 : 0;
    const pctB = maxVal > 0 ? (valB / maxVal) * 100 : 0;
    const diff = valA - valB;
    const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;

    return (
        <div className="flex items-center gap-3 py-2 px-2 rounded-lg transition-colors"
            style={{ background: hover ? "rgba(58,58,60,0.4)" : "transparent" }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
        >
            {/* Player A value */}
            <span className="text-sm font-semibold w-12 text-right" style={{ color: colorA, fontFamily: "'Playfair Display', serif" }}>
                {valA}
            </span>
            {/* Bars */}
            <div className="flex-1 flex gap-0.5 relative">
                {/* A bar (right-aligned) */}
                <div className="flex-1 h-5 rounded-l-md overflow-hidden flex justify-end" style={{ background: "#2c2c2e" }}>
                    <div className="h-full rounded-l-md" style={{
                        width: `${pctA}%`, background: colorA,
                        opacity: hover ? 1 : 0.8,
                        transition: "width 1s ease, opacity 0.2s"
                    }} />
                </div>
                {/* B bar (left-aligned) */}
                <div className="flex-1 h-5 rounded-r-md overflow-hidden" style={{ background: "#2c2c2e" }}>
                    <div className="h-full rounded-r-md" style={{
                        width: `${pctB}%`, background: colorB,
                        opacity: hover ? 1 : 0.8,
                        transition: "width 1s ease, opacity 0.2s"
                    }} />
                </div>
                {/* Diff badge on hover */}
                {hover && diff !== 0 && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-5 px-2 py-0.5 rounded text-[9px] font-bold"
                        style={{
                            background: diff > 0 ? colorA : colorB,
                            color: "#fff",
                        }}>
                        {diffLabel}
                    </div>
                )}
            </div>
            {/* Player B value */}
            <span className="text-sm font-semibold w-12" style={{ color: colorB, fontFamily: "'Playfair Display', serif" }}>
                {valB}
            </span>
            {/* Label */}
            <span className="text-[11px] w-28" style={{ color: hover ? "#f5f5f7" : "#86868b", fontFamily: "'Inter', sans-serif", transition: "color 0.2s" }}>
                {label}
            </span>
        </div>
    );
}

// Radar chart for player styles — interactive
function RadarChart({ statsA, statsB, playerA, playerB }: {
    statsA: PlayerStats; statsB: PlayerStats; playerA: string; playerB: string;
}) {
    const [hovered, setHovered] = useState<number | null>(null);

    const axes = [
        { label: "Win%", a: statsA.win_rate, b: statsB.win_rate, max: 100, unit: "%" },
        { label: "Svc Win%", a: statsA.service_win_rate, b: statsB.service_win_rate, max: 100, unit: "%" },
        { label: "Rcv Win%", a: statsA.receive_win_rate, b: statsB.receive_win_rate, max: 100, unit: "%" },
        { label: "Rally moy.", a: statsA.avg_service_rally, b: statsB.avg_service_rally, max: Math.max(statsA.avg_service_rally, statsB.avg_service_rally, 1), unit: "" },
        { label: "Pts Won", a: statsA.points_won, b: statsB.points_won, max: Math.max(statsA.points_won, statsB.points_won, 1), unit: "" },
    ];

    const cx = 150, cy = 140, maxR = 95;
    const n = axes.length;

    const getPoint = (index: number, val: number, max: number) => {
        const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
        const r = (val / max) * maxR;
        return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    };

    const polyA = axes.map((ax, i) => {
        const pt = getPoint(i, ax.a, ax.max);
        return `${pt.x},${pt.y}`;
    }).join(" ");

    const polyB = axes.map((ax, i) => {
        const pt = getPoint(i, ax.b, ax.max);
        return `${pt.x},${pt.y}`;
    }).join(" ");

    return (
        <div className="flex flex-col items-center">
            <h4 className="text-xs font-semibold mb-3" style={{ color: "#f5f5f7", fontFamily: "'Inter', sans-serif" }}>
                Profil de jeu
            </h4>
            <svg viewBox="0 0 300 300" className="w-full" style={{ maxWidth: 380 }}>
                {/* Grid rings with % labels */}
                {[0.25, 0.5, 0.75, 1].map(pct => {
                    const r = maxR * pct;
                    const gridPoints = axes.map((_, i) => {
                        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                        return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
                    }).join(" ");
                    return (
                        <g key={pct}>
                            <polygon points={gridPoints} fill="none" stroke="#3a3a3c" strokeWidth={0.5} />
                            <text x={cx + 4} y={cy - r + 3} fill="#555" style={{ fontSize: "7px", fontFamily: "'Inter', sans-serif" }}>
                                {Math.round(pct * 100)}%
                            </text>
                        </g>
                    );
                })}

                {/* Axis lines + labels (clickable zones) */}
                {axes.map((ax, i) => {
                    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
                    const endX = cx + (maxR + 8) * Math.cos(angle);
                    const endY = cy + (maxR + 8) * Math.sin(angle);
                    const labelX = cx + (maxR + 24) * Math.cos(angle);
                    const labelY = cy + (maxR + 24) * Math.sin(angle);
                    const isHovered = hovered === i;
                    return (
                        <g key={i}
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                            style={{ cursor: "pointer" }}
                        >
                            {/* Invisible wider hit area */}
                            <line x1={cx} y1={cy} x2={endX} y2={endY}
                                stroke="transparent" strokeWidth={16} />
                            <line x1={cx} y1={cy} x2={endX} y2={endY}
                                stroke={isHovered ? "#f5f5f7" : "#3a3a3c"} strokeWidth={isHovered ? 1 : 0.5}
                                style={{ transition: "stroke 0.2s" }} />
                            <text x={labelX} y={labelY + 3} textAnchor="middle"
                                fill={isHovered ? "#f5f5f7" : "#86868b"}
                                style={{ fontSize: isHovered ? "9px" : "8px", fontFamily: "'Inter', sans-serif", fontWeight: isHovered ? 600 : 400, transition: "all 0.2s" }}>
                                {ax.label}
                            </text>
                        </g>
                    );
                })}

                {/* Player polygons */}
                <polygon points={polyA} fill="rgba(48, 209, 88, 0.15)" stroke="#30d158" strokeWidth={2} />
                <polygon points={polyB} fill="rgba(255, 69, 58, 0.15)" stroke="#ff453a" strokeWidth={2} />

                {/* Dots + value labels */}
                {axes.map((ax, i) => {
                    const ptA = getPoint(i, ax.a, ax.max);
                    const ptB = getPoint(i, ax.b, ax.max);
                    const isHovered = hovered === i;
                    const rDot = isHovered ? 6 : 3;
                    return (
                        <g key={`dots-${i}`}
                            onMouseEnter={() => setHovered(i)}
                            onMouseLeave={() => setHovered(null)}
                            style={{ cursor: "pointer" }}
                        >
                            <circle cx={ptA.x} cy={ptA.y} r={rDot} fill="#30d158"
                                stroke={isHovered ? "#fff" : "none"} strokeWidth={2}
                                style={{ transition: "r 0.2s, stroke 0.2s" }} />
                            <circle cx={ptB.x} cy={ptB.y} r={rDot} fill="#ff453a"
                                stroke={isHovered ? "#fff" : "none"} strokeWidth={2}
                                style={{ transition: "r 0.2s, stroke 0.2s" }} />

                            {/* Value labels on hover */}
                            {isHovered && (
                                <>
                                    <rect x={ptA.x - 22} y={ptA.y - 20} width={44} height={16} rx={4}
                                        fill="rgba(48, 209, 88, 0.9)" />
                                    <text x={ptA.x} y={ptA.y - 9} textAnchor="middle" fill="#fff"
                                        style={{ fontSize: "9px", fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>
                                        {ax.a}{ax.unit}
                                    </text>
                                    <rect x={ptB.x - 22} y={ptB.y + 6} width={44} height={16} rx={4}
                                        fill="rgba(255, 69, 58, 0.9)" />
                                    <text x={ptB.x} y={ptB.y + 17} textAnchor="middle" fill="#fff"
                                        style={{ fontSize: "9px", fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>
                                        {ax.b}{ax.unit}
                                    </text>
                                </>
                            )}
                        </g>
                    );
                })}

                {/* Tooltip panel when axis is hovered */}
                {hovered !== null && (
                    <g>
                        <rect x={10} y={268} width={280} height={24} rx={6}
                            fill="rgba(28,28,30,0.95)" stroke="#3a3a3c" />
                        <text x={150} y={283} textAnchor="middle" fill="#f5f5f7"
                            style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif" }}>
                            {axes[hovered].label} —{" "}
                            <tspan fill="#30d158" fontWeight={700}>{playerA.split("-").pop()}: {axes[hovered].a}{axes[hovered].unit}</tspan>
                            {"  vs  "}
                            <tspan fill="#ff453a" fontWeight={700}>{playerB.split("-").pop()}: {axes[hovered].b}{axes[hovered].unit}</tspan>
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
}

export default function ComparePage() {
    const searchParams = useSearchParams();
    const matchId = searchParams.get("match_id") || "";
    const [data, setData] = useState<CompareData | null>(null);
    const [loading, setLoading] = useState(false);
    const [matches, setMatches] = useState<string[]>([]);
    const [selectedMatch, setSelectedMatch] = useState(matchId);

    // Fetch available matches (use stats for reliability)
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch(`${API_URL}/api/search/stats`);
                if (!res.ok) throw new Error("stats failed");
                const d = await res.json();
                const ids = (d.matches || []).map((m: any) => m.id);
                if (ids.length) return ids;
                // fallback search
                const res2 = await fetch(`${API_URL}/api/search?size=200`);
                if (!res2.ok) throw new Error("search failed");
                const d2 = await res2.json();
                const setIds = new Set<string>();
                d2.points?.forEach((p: any) => setIds.add(p.match_id));
                return Array.from(setIds);
            } catch {
                return DEFAULT_MATCHES;
            }
        };
        load().then((ids) => {
            setMatches(ids);
            if (!selectedMatch && ids.length > 0) {
                setSelectedMatch(ids[0]);
            }
        });
    }, []);

    // Fetch comparison data
    useEffect(() => {
        if (!selectedMatch) return;
        setLoading(true);
        const fetchData = async () => {
            try {
                const res = await fetch(`${API_URL}/api/search/player-compare/${encodeURIComponent(selectedMatch)}`);
                if (res.ok) {
                    const d = await res.json();
                    setData(d);
                    return;
                }
                throw new Error("compare failed");
            } catch {
                // fallback: build from momentum
                try {
                    const res2 = await fetch(`${API_URL}/api/search/match-momentum/${encodeURIComponent(selectedMatch)}`);
                    if (res2.ok) {
                        const d2 = await res2.json();
                        const built = buildFromPoints(selectedMatch, d2.points);
                        if (built) {
                            setData(built);
                            return;
                        }
                    }
                } catch {
                }
                // ultimate fallback: fetch raw points
                try {
                    const res3 = await fetch(`${API_URL}/api/search?match_id=${encodeURIComponent(selectedMatch)}&size=400`);
                    if (res3.ok) {
                        const d3 = await res3.json();
                        const built = buildFromPoints(selectedMatch, d3.points || []);
                        setData(built);
                        return;
                    }
                } catch {
                    /* ignore */
                }
                // sample fallback
                const sample = buildFromPoints(DEFAULT_MATCHES[0], SAMPLE_POINTS);
                if (sample) sample.__sample__ = true;
                setData(sample);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedMatch]);

    const A = data?.player_A;
    const B = data?.player_B;
    const colorA = "#30d158";
    const colorB = "#ff453a";

    return (
        <div className="min-h-screen" style={{ background: "#1c1c1e", color: "#f5f5f7" }}>
            {/* Header */}
            <header className="sticky top-0 z-50"
                style={{
                    background: "rgba(44, 44, 46, 0.8)",
                    backdropFilter: "blur(15px)",
                    borderBottom: "1px solid #3a3a3c",
                }}>
                <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-14">
                    <Link href="/" className="text-lg font-bold"
                        style={{ fontFamily: "'Playfair Display', serif", color: "#f5f5f7" }}>
                        Video Gallery
                    </Link>
                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <Link href="/search" className="text-sm px-3 py-1.5 rounded-lg"
                            style={{ background: "#2c2c2e", color: "#f5f5f7", border: "1px solid #3a3a3c" }}>
                            Search
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Face à face
                </h1>

                {/* Match selector */}
                <div className="flex items-center gap-3 mb-8">
                    <label className="text-sm" style={{ color: "#86868b" }}>Match :</label>
                    <select
                        value={selectedMatch}
                        onChange={e => setSelectedMatch(e.target.value)}
                        className="px-3 py-2 rounded-lg text-sm"
                        style={{ background: "#2c2c2e", color: "#f5f5f7", border: "1px solid #3a3a3c" }}
                    >
                        {matches.map(m => (
                            <option key={m} value={m}>{m.replace(/_/g, " ")}</option>
                        ))}
                    </select>
                    {matches.length === 0 && (
                        <span className="text-xs text-amber-400">Aucun match trouvé (ES off ?)</span>
                    )}
                </div>

                {loading && (
                    <div className="flex justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                    </div>
                )}

                {!loading && data && A && B && (
                    <div className="space-y-8">
                        {/* Players header */}
                        <div className="flex items-center justify-center gap-8">
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                                    style={{ background: "linear-gradient(135deg, #30d158, #34d399)", color: "#fff" }}>
                                    {A.player.charAt(0)}
                                </div>
                                <h2 className="text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                                    {A.player.replace(/-/g, " ")}
                                </h2>
                                <span className="text-3xl font-bold" style={{ color: colorA, fontFamily: "'Playfair Display', serif" }}>
                                    {A.points_won}
                                </span>
                            </div>

                            <div className="text-center">
                                <div className="text-4xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "#86868b" }}>
                                    VS
                                </div>
                                <div className="text-xs mt-1" style={{ color: "#86868b" }}>
                                    {data.total_points} points
                                </div>
                            </div>

                            <div className="flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                                    style={{ background: "linear-gradient(135deg, #ff453a, #ff6961)", color: "#fff" }}>
                                    {B.player.charAt(0)}
                                </div>
                                <h2 className="text-lg font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
                                    {B.player.replace(/-/g, " ")}
                                </h2>
                                <span className="text-3xl font-bold" style={{ color: colorB, fontFamily: "'Playfair Display', serif" }}>
                                    {B.points_won}
                                </span>
                            </div>
                        </div>

                        {/* Dual bars comparison */}
                        <div className="rounded-2xl p-6" style={{ background: "rgba(44,44,46,0.6)", border: "1px solid #3a3a3c" }}>
                            <h3 className="text-sm font-semibold mb-4" style={{ color: "#f5f5f7" }}>
                                Statistiques comparées
                            </h3>
                            <DualBar label="Points gagnés" valA={A.points_won} valB={B.points_won}
                                maxVal={Math.max(A.points_won, B.points_won)} colorA={colorA} colorB={colorB} />
                            <DualBar label="Win Rate %" valA={A.win_rate} valB={B.win_rate}
                                maxVal={100} colorA={colorA} colorB={colorB} />
                            <DualBar label="Service Win %" valA={A.service_win_rate} valB={B.service_win_rate}
                                maxVal={100} colorA={colorA} colorB={colorB} />
                            <DualBar label="Réception Win %" valA={A.receive_win_rate} valB={B.receive_win_rate}
                                maxVal={100} colorA={colorA} colorB={colorB} />
                            <DualBar label="Rally moy. (svc)" valA={A.avg_service_rally} valB={B.avg_service_rally}
                                maxVal={Math.max(A.avg_service_rally, B.avg_service_rally)} colorA={colorA} colorB={colorB} />
                            <DualBar label="Rally moy. (win)" valA={A.avg_rally_length_when_winning} valB={B.avg_rally_length_when_winning}
                                maxVal={Math.max(A.avg_rally_length_when_winning, B.avg_rally_length_when_winning)} colorA={colorA} colorB={colorB} />
                        </div>

                        {/* Radar chart + winning shots */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="rounded-2xl p-6" style={{ background: "rgba(44,44,46,0.6)", border: "1px solid #3a3a3c" }}>
                                <RadarChart statsA={A} statsB={B} playerA={A.player} playerB={B.player} />
                            </div>

                            <div className="rounded-2xl p-6" style={{ background: "rgba(44,44,46,0.6)", border: "1px solid #3a3a3c" }}>
                                <h4 className="text-xs font-semibold mb-4" style={{ color: "#f5f5f7" }}>
                                    Coups gagnants
                                </h4>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-[10px] mb-2" style={{ color: colorA }}>{A.player.replace(/-/g, " ")}</p>
                                        {A.winning_shots.slice(0, 5).map(s => (
                                            <div key={s.shot} className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[10px] w-16 text-right" style={{ color: "#aaa" }}>{s.shot}</span>
                                                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#2c2c2e" }}>
                                                    <div className="h-full rounded-full" style={{
                                                        width: `${(s.count / (A.winning_shots[0]?.count || 1)) * 100}%`,
                                                        background: colorA, transition: "width 0.8s"
                                                    }} />
                                                </div>
                                                <span className="text-[10px] w-4" style={{ color: "#f5f5f7" }}>{s.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        <p className="text-[10px] mb-2" style={{ color: colorB }}>{B.player.replace(/-/g, " ")}</p>
                                        {B.winning_shots.slice(0, 5).map(s => (
                                            <div key={s.shot} className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[10px] w-16 text-right" style={{ color: "#aaa" }}>{s.shot}</span>
                                                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#2c2c2e" }}>
                                                    <div className="h-full rounded-full" style={{
                                                        width: `${(s.count / (B.winning_shots[0]?.count || 1)) * 100}%`,
                                                        background: colorB, transition: "width 0.8s"
                                                    }} />
                                                </div>
                                                <span className="text-[10px] w-4" style={{ color: "#f5f5f7" }}>{s.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <h4 className="text-xs font-semibold mt-6 mb-4" style={{ color: "#f5f5f7" }}>
                                    Types de fautes
                                </h4>
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        {A.faults.slice(0, 4).map(f => (
                                            <div key={f.type} className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[10px] w-16 text-right" style={{ color: "#aaa" }}>{f.type}</span>
                                                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#2c2c2e" }}>
                                                    <div className="h-full rounded-full" style={{
                                                        width: `${(f.count / (A.faults[0]?.count || 1)) * 100}%`,
                                                        background: "#fbbf24", transition: "width 0.8s"
                                                    }} />
                                                </div>
                                                <span className="text-[10px] w-4" style={{ color: "#f5f5f7" }}>{f.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div>
                                        {B.faults.slice(0, 4).map(f => (
                                            <div key={f.type} className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[10px] w-16 text-right" style={{ color: "#aaa" }}>{f.type}</span>
                                                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "#2c2c2e" }}>
                                                    <div className="h-full rounded-full" style={{
                                                        width: `${(f.count / (B.faults[0]?.count || 1)) * 100}%`,
                                                        background: "#fbbf24", transition: "width 0.8s"
                                                    }} />
                                                </div>
                                                <span className="text-[10px] w-4" style={{ color: "#f5f5f7" }}>{f.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Momentum chart */}
                        {selectedMatch && !data.__sample__ && (
                            <MomentumChart matchId={selectedMatch} apiUrl={API_URL} />
                        )}
                    </div>
                )}

                {!loading && (!data || !A || !B) && (
                    <div className="text-center text-sm text-amber-400 py-12">
                        Impossible de charger les stats (ES off ou index vide). Tente un autre match ou relance l'indexation.
                    </div>
                )}
            </main>
        </div>
    );
}
