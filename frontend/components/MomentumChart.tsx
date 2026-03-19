"use client";

import { useEffect, useState } from "react";

interface MomentumPoint {
    point_id: number;
    set_num: number;
    score_A: number;
    score_B: number;
    winner: string;
    serveur: string;
    cumulative_A: number;
    cumulative_B: number;
    diff: number;
    is_set_point?: boolean;
    nb_coups?: number;
}

interface MomentumData {
    match_id: string;
    player_A: string;
    player_B: string;
    total_points: number;
    points: MomentumPoint[];
}

interface Props {
    matchId: string;
    apiUrl: string;
    currentPointId?: number;
    onPointSelect?: (point: MomentumPoint) => void;
}

export default function MomentumChart({ matchId, apiUrl, currentPointId, onPointSelect }: Props) {
    const [data, setData] = useState<MomentumData | null>(null);
    const [loading, setLoading] = useState(false);
    const [hovered, setHovered] = useState<number | null>(null);
    const panelBackground = "var(--viz-panel-bg)";
    const panelBorder = "var(--viz-panel-border)";
    const panelShadow = "var(--viz-shadow)";
    const mutedText = "var(--viz-text-muted)";
    const foreground = "var(--foreground)";
    const gridColor = "var(--viz-grid)";
    const tooltipBackground = "var(--viz-tooltip-bg)";

    useEffect(() => {
        if (!matchId) return;
        setLoading(true);
        fetch(`${apiUrl}/api/search/match-momentum/${encodeURIComponent(matchId)}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => setData(d))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [matchId, apiUrl]);

    if (loading) {
        return (
            <div className="rounded-2xl p-5" style={{ background: panelBackground, border: `1px solid ${panelBorder}`, boxShadow: panelShadow }}>
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                </div>
            </div>
        );
    }

    if (!data || data.points.length === 0) return null;

    const { points, player_A, player_B } = data;
    const maxDiff = Math.max(1, ...points.map(p => Math.abs(p.diff)));

    // SVG dimensions
    const W = 800, H = 200, padX = 40, padY = 30;
    const chartW = W - padX * 2;
    const chartH = H - padY * 2;
    const midY = padY + chartH / 2;

    // Scale functions
    const xScale = (i: number) => padX + (i / (points.length - 1)) * chartW;
    const yScale = (diff: number) => midY - (diff / maxDiff) * (chartH / 2);

    // Build path
    const pathD = points.map((p, i) => {
        const x = xScale(i);
        const y = yScale(p.diff);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");

    // Area fill above midY (A leads) and below (B leads)
    const areaAbove = `M ${xScale(0)} ${midY} ` +
        points.map((p, i) => `L ${xScale(i)} ${Math.min(midY, yScale(p.diff))}`).join(" ") +
        ` L ${xScale(points.length - 1)} ${midY} Z`;

    const areaBelow = `M ${xScale(0)} ${midY} ` +
        points.map((p, i) => `L ${xScale(i)} ${Math.max(midY, yScale(p.diff))}`).join(" ") +
        ` L ${xScale(points.length - 1)} ${midY} Z`;

    // Set boundaries
    const setBoundaries: { x: number; set: number }[] = [];
    for (let i = 1; i < points.length; i++) {
        if (points[i].set_num !== points[i - 1].set_num) {
            setBoundaries.push({ x: xScale(i), set: points[i].set_num });
        }
    }

    const hoveredPoint = hovered !== null ? points[hovered] : null;
    const hoveredX = hovered !== null ? xScale(hovered) : 0;
    const hoveredY = hovered !== null ? yScale(points[hovered].diff) : 0;

    // Find current point index
    const currentIdx = currentPointId !== undefined
        ? points.findIndex(p => p.point_id === currentPointId)
        : -1;

    return (
        <div className="rounded-2xl overflow-hidden p-5"
            style={{
                background: panelBackground,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${panelBorder}`,
                boxShadow: panelShadow,
            }}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: foreground, fontFamily: "'Inter', sans-serif" }}>
                    Momentum du match
                </h3>
                <div className="flex items-center gap-3 text-[11px]" style={{ fontFamily: "'Inter', sans-serif" }}>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ background: "#30d158" }} />
                        <span style={{ color: foreground }}>{player_A.replace(/_/g, " ")}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full" style={{ background: "#ff453a" }} />
                        <span style={{ color: foreground }}>{player_B.replace(/_/g, " ")}</span>
                    </span>
                </div>
            </div>

            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ cursor: onPointSelect ? "pointer" : "crosshair" }}
                onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const svgX = ((e.clientX - rect.left) / rect.width) * W;
                    const idx = Math.round(((svgX - padX) / chartW) * (points.length - 1));
                    if (idx >= 0 && idx < points.length) setHovered(idx);
                }}
                onMouseLeave={() => setHovered(null)}
                onClick={(e) => {
                    if (!onPointSelect) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const svgX = ((e.clientX - rect.left) / rect.width) * W;
                    const idx = Math.round(((svgX - padX) / chartW) * (points.length - 1));
                    if (idx >= 0 && idx < points.length) {
                        onPointSelect(points[idx]);
                    }
                }}
            >
                <defs>
                    <linearGradient id="momentumGradAbove" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#30d158" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#30d158" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="momentumGradBelow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff453a" stopOpacity="0.02" />
                        <stop offset="100%" stopColor="#ff453a" stopOpacity="0.3" />
                    </linearGradient>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0a84ff" />
                        <stop offset="100%" stopColor="#5e5ce6" />
                    </linearGradient>
                </defs>

                {/* Fill areas */}
                <path d={areaAbove} fill="url(#momentumGradAbove)" />
                <path d={areaBelow} fill="url(#momentumGradBelow)" />

                {/* Center line */}
                <line x1={padX} y1={midY} x2={W - padX} y2={midY}
                    stroke={gridColor} strokeWidth={1} strokeDasharray="4 4" />

                {/* Set boundary lines */}
                {setBoundaries.map((b, i) => (
                    <g key={i}>
                        <line x1={b.x} y1={padY} x2={b.x} y2={H - padY}
                            stroke="#5e5ce6" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
                        <text x={b.x} y={padY - 6} textAnchor="middle"
                            fill="#5e5ce6" opacity={0.7}
                            style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                            Set {b.set}
                        </text>
                    </g>
                ))}
                {/* First set label */}
                <text x={padX + 10} y={padY - 6} textAnchor="start"
                    fill="#5e5ce6" opacity={0.7}
                    style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                    Set 1
                </text>

                {/* Y-axis labels */}
                <text x={padX - 5} y={padY + 4} textAnchor="end" fill={mutedText}
                    style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                    +{maxDiff}
                </text>
                <text x={padX - 5} y={midY + 3} textAnchor="end" fill={mutedText}
                    style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                    0
                </text>
                <text x={padX - 5} y={H - padY + 4} textAnchor="end" fill={mutedText}
                    style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                    -{maxDiff}
                </text>

                {/* Player name labels on Y axis */}
                <text x={W - padX + 5} y={padY + 12} textAnchor="start" fill="#30d158"
                    style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                    ↑ {player_A.split("-").pop()}
                </text>
                <text x={W - padX + 5} y={H - padY - 4} textAnchor="start" fill="#ff453a"
                    style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                    ↓ {player_B.split("-").pop()}
                </text>

                {/* Main line */}
                <path d={pathD} fill="none" stroke="url(#lineGrad)" strokeWidth={2.5}
                    strokeLinecap="round" strokeLinejoin="round" />

                {/* Current point marker */}
                {currentIdx >= 0 && (
                    <g>
                        <line x1={xScale(currentIdx)} y1={padY} x2={xScale(currentIdx)} y2={H - padY}
                            stroke="#ffd60a" strokeWidth={1.5} opacity={0.5} />
                        <circle cx={xScale(currentIdx)} cy={yScale(points[currentIdx].diff)}
                            r={6} fill="#ffd60a" stroke="#fff" strokeWidth={2}>
                            <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />
                        </circle>
                        <text x={xScale(currentIdx)} y={H - padY + 14} textAnchor="middle"
                            fill="#ffd60a"
                            style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                            ▲ En cours
                        </text>
                    </g>
                )}

                {/* Hover tooltip */}
                {hovered !== null && hoveredPoint && (
                    <g>
                        <line x1={hoveredX} y1={padY} x2={hoveredX} y2={H - padY}
                            stroke={foreground} strokeWidth={0.5} opacity={0.25} />
                        <circle cx={hoveredX} cy={hoveredY} r={5}
                            fill="#0a84ff" stroke="#fff" strokeWidth={2} />
                        <rect x={hoveredX - 55} y={hoveredY - 42} width={110} height={36}
                            rx={6} fill={tooltipBackground} stroke={panelBorder} />
                        <text x={hoveredX} y={hoveredY - 26} textAnchor="middle" fill={foreground}
                            style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                            Pt {hoveredPoint.point_id + 1} — {hoveredPoint.score_A}:{hoveredPoint.score_B}
                        </text>
                        <text x={hoveredX} y={hoveredY - 14} textAnchor="middle" fill={mutedText}
                            style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                            {hoveredPoint.diff > 0 ? player_A.split("-").pop() : player_B.split("-").pop()} +{Math.abs(hoveredPoint.diff)}
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
}
