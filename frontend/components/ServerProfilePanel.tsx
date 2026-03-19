"use client";

import { useEffect, useState } from "react";

interface ZoneStat {
    zone: string; count: number; wins: number; win_rate: number; pct: number;
}
interface LateralityStat {
    type: string; count: number; wins: number; win_rate: number;
}
interface RallyBucket {
    shots: number; count: number;
}
interface FaultStat {
    type: string; count: number;
}
interface ShotStat {
    shot: string; count: number;
}
interface SetStat {
    set: number; total: number; won: number; win_rate: number; avg_rally: number;
}
interface ProfileData {
    player: string;
    total_service_points: number;
    points_won: number;
    win_rate: number;
    avg_rally_length: number;
    avg_duration_seconds: number;
    service_zones: ZoneStat[];
    laterality: LateralityStat[];
    rally_distribution: RallyBucket[];
    faults: FaultStat[];
    last_shots: ShotStat[];
    by_set: SetStat[];
}

interface Props {
    serverName: string | null;
    matchId: string | null;
    apiUrl: string;
}

const PANEL_BG = "var(--viz-panel-bg)";
const PANEL_BORDER = "var(--viz-panel-border)";
const SURFACE_BG = "var(--viz-surface)";
const SURFACE_MUTED = "var(--viz-surface-muted)";
const FOREGROUND = "var(--foreground)";
const MUTED_TEXT = "var(--viz-text-muted)";
const PANEL_SHADOW = "var(--viz-shadow)";

// ─── Circular gauge ───────────────────────────────────────────
function WinRateGauge({ rate, total, won }: { rate: number; total: number; won: number }) {
    const r = 44, cx = 50, cy = 50, stroke = 7;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - rate / 100);
    const color = rate >= 65 ? "#34d399" : rate >= 50 ? "#fbbf24" : "#f87171";

    return (
        <div className="flex flex-col items-center">
            <svg width="110" height="110" viewBox="0 0 100 100">
                <circle cx={cx} cy={cy} r={r} fill="none" stroke={SURFACE_BG} strokeWidth={stroke} />
                <circle
                    cx={cx} cy={cy} r={r} fill="none"
                    stroke={color} strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    transform="rotate(-90 50 50)"
                    style={{ transition: "stroke-dashoffset 1s ease" }}
                />
                <text x={cx} y={cy - 4} textAnchor="middle" fill={FOREGROUND}
                    style={{ fontSize: "18px", fontFamily: "'Playfair Display', serif", fontWeight: 600 }}>
                    {rate}%
                </text>
                <text x={cx} y={cy + 14} textAnchor="middle" fill={MUTED_TEXT}
                    style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                    {won}/{total} pts
                </text>
            </svg>
            <span className="text-[10px] mt-1" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                Win Rate au Service
            </span>
        </div>
    );
}

// ─── Table heatmap (top-down ping-pong half-table) ────────────
function TableHeatmap({ zones }: { zones: ZoneStat[] }) {
    // zones: g1 g2 g3 | m1 m2 m3 | d1 d2 d3
    // Map to 3×3 grid  (columns: g/m/d, rows: 1/2/3)
    const grid: Record<string, ZoneStat> = {};
    zones.forEach(z => { grid[z.zone] = z; });

    const maxCount = Math.max(1, ...zones.map(z => z.count));

    const cols = ["g", "m", "d"];
    const rows = ["1", "2", "3"];
    const colLabels = ["Gauche", "Centre", "Droite"];
    const rowLabels = ["Court", "Mi-table", "Long"];

    const cellW = 52, cellH = 36, pad = 2;
    const labelW = 50, labelH = 18;
    const svgW = labelW + cols.length * (cellW + pad);
    const svgH = labelH + rows.length * (cellH + pad) + 10;

    const getColor = (count: number, winRate: number) => {
        const intensity = Math.max(0.15, count / maxCount);
        // Blue hue shifting to green for high win rates
        if (winRate >= 60) return `rgba(52, 211, 153, ${intensity})`;  // green
        if (winRate >= 45) return `rgba(251, 191, 36, ${intensity})`;  // amber
        return `rgba(96, 165, 250, ${intensity})`;                      // blue
    };

    return (
        <div className="flex flex-col items-center">
            <span className="text-[10px] mb-2" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                Zones de Service — fréquence & efficacité
            </span>
            <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}>
                {/* Column labels */}
                {cols.map((c, ci) => (
                    <text key={c} x={labelW + ci * (cellW + pad) + cellW / 2} y={12}
                        textAnchor="middle" fill={MUTED_TEXT}
                        style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif" }}>
                        {colLabels[ci]}
                    </text>
                ))}
                {/* Rows */}
                {rows.map((r, ri) => (
                    <g key={r}>
                        {/* Row label */}
                        <text x={labelW - 6} y={labelH + ri * (cellH + pad) + cellH / 2 + 3}
                            textAnchor="end" fill={MUTED_TEXT}
                            style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                            {rowLabels[ri]}
                        </text>
                        {cols.map((c, ci) => {
                            const key = `${c}${r}`;
                            const stat = grid[key];
                            const count = stat?.count || 0;
                            const winRate = stat?.win_rate || 0;
                            const pct = stat?.pct || 0;
                            const x = labelW + ci * (cellW + pad);
                            const y = labelH + ri * (cellH + pad);

                            return (
                                <g key={key}>
                                    <rect x={x} y={y} width={cellW} height={cellH} rx={6}
                                        fill={count > 0 ? getColor(count, winRate) : SURFACE_MUTED}
                                        stroke={PANEL_BORDER} strokeWidth={0.5} />
                                    {count > 0 && (
                                        <>
                                            <text x={x + cellW / 2} y={y + 15} textAnchor="middle"
                                                fill={FOREGROUND}
                                                style={{ fontSize: "11px", fontWeight: 600, fontFamily: "'Playfair Display', serif" }}>
                                                {pct}%
                                            </text>
                                            <text x={x + cellW / 2} y={y + 28} textAnchor="middle"
                                                fill={MUTED_TEXT}
                                                style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                                                W:{winRate}%
                                            </text>
                                        </>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                ))}
                {/* Table border */}
                <rect x={labelW - 1} y={labelH - 1}
                    width={cols.length * (cellW + pad) + 2} height={rows.length * (cellH + pad) + 2}
                    rx={8} fill="none" stroke={PANEL_BORDER} strokeWidth={1} />
                {/* Net line */}
                <line x1={labelW} y1={labelH + rows.length * (cellH + pad) + 4}
                    x2={labelW + cols.length * (cellW + pad)}
                    y2={labelH + rows.length * (cellH + pad) + 4}
                    stroke="#0a84ff" strokeWidth={2} strokeDasharray="4 3" opacity={0.6} />
                <text x={labelW + cols.length * (cellW + pad) / 2}
                    y={labelH + rows.length * (cellH + pad) + 14}
                    textAnchor="middle" fill="#0a84ff" opacity={0.5}
                    style={{ fontSize: "7px", fontFamily: "'Inter', sans-serif" }}>
                    FILET
                </text>
            </svg>
        </div>
    );
}

// ─── Rally length distribution (bar chart) ────────────────────
function RallyChart({ data }: { data: RallyBucket[] }) {
    if (data.length === 0) return null;
    const maxCount = Math.max(...data.map(d => d.count));
    const barW = 18, barGap = 3, chartH = 50;
    const svgW = data.length * (barW + barGap) + 10;

    return (
        <div className="flex flex-col">
            <span className="text-[10px] mb-2" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                Distribution des rallies (nb coups)
            </span>
            <svg width="100%" height={chartH + 20} viewBox={`0 0 ${svgW} ${chartH + 20}`} preserveAspectRatio="xMidYMax meet">
                {data.map((d, i) => {
                    const h = (d.count / maxCount) * chartH;
                    const x = i * (barW + barGap) + 5;
                    return (
                        <g key={d.shots}>
                            <rect x={x} y={chartH - h} width={barW} height={h} rx={3}
                                fill="url(#barGrad)" opacity={0.9} />
                            <text x={x + barW / 2} y={chartH + 12} textAnchor="middle"
                                fill={MUTED_TEXT} style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                                {d.shots}
                            </text>
                            <text x={x + barW / 2} y={chartH - h - 3} textAnchor="middle"
                                fill={FOREGROUND} style={{ fontSize: "7px", fontFamily: "'Inter', sans-serif" }}>
                                {d.count}
                            </text>
                        </g>
                    );
                })}
                <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0a84ff" />
                        <stop offset="100%" stopColor="#5e5ce6" />
                    </linearGradient>
                </defs>
            </svg>
        </div>
    );
}

// ─── Laterality donut ─────────────────────────────────────────
function LateralityDonut({ data }: { data: LateralityStat[] }) {
    if (data.length === 0) return null;
    const total = data.reduce((s, d) => s + d.count, 0);
    const colors: Record<string, string> = {
        coup_droit: "#0a84ff",
        revers: "#bf5af2",
    };
    const r = 32, cx = 42, cy = 42, stroke = 10;
    const circ = 2 * Math.PI * r;

    let offset = 0;
    const arcs = data.map(d => {
        const pct = d.count / total;
        const dash = circ * pct;
        const gap = circ - dash;
        const arc = { ...d, dash, gap, offset, color: colors[d.type] || MUTED_TEXT, pct };
        offset += dash;
        return arc;
    });

    return (
        <div className="flex flex-col items-center">
            <span className="text-[10px] mb-2" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                Latéralité du service
            </span>
            <div className="flex items-center gap-3">
                <svg width="84" height="84" viewBox="0 0 84 84">
                    {arcs.map(a => (
                        <circle key={a.type} cx={cx} cy={cy} r={r} fill="none"
                            stroke={a.color} strokeWidth={stroke}
                            strokeDasharray={`${a.dash} ${a.gap}`}
                            strokeDashoffset={-a.offset}
                            transform="rotate(-90 42 42)"
                            style={{ transition: "all 0.8s ease" }}
                        />
                    ))}
                    <text x={cx} y={cy + 4} textAnchor="middle" fill={FOREGROUND}
                        style={{ fontSize: "10px", fontFamily: "'Playfair Display', serif" }}>
                        {total}
                    </text>
                </svg>
                <div className="flex flex-col gap-1.5">
                    {arcs.map(a => (
                        <div key={a.type} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
                            <span className="text-[10px]" style={{ color: FOREGROUND, fontFamily: "'Inter', sans-serif" }}>
                                {a.type === "coup_droit" ? "CD" : "RV"} {Math.round(a.pct * 100)}%
                            </span>
                            <span className="text-[9px]" style={{ color: MUTED_TEXT }}>
                                W:{a.win_rate}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Horizontal bars (shots/faults) ───────────────────────────
function HorizontalBars({ data, label, colorFn }: {
    data: { key: string; value: number }[];
    label: string;
    colorFn?: (key: string) => string;
}) {
    if (data.length === 0) return null;
    const maxVal = Math.max(...data.map(d => d.value));

    return (
        <div className="flex flex-col">
            <span className="text-[10px] mb-2" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                {label}
            </span>
            <div className="space-y-1.5">
                {data.slice(0, 5).map(d => {
                    const pct = (d.value / maxVal) * 100;
                    const color = colorFn ? colorFn(d.key) : "#0a84ff";
                    return (
                        <div key={d.key} className="flex items-center gap-2">
                            <span className="text-[9px] w-16 text-right truncate" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                                {d.key}
                            </span>
                            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: SURFACE_BG }}>
                                <div className="h-full rounded-full" style={{
                                    width: `${pct}%`, background: color,
                                    transition: "width 0.8s ease"
                                }} />
                            </div>
                            <span className="text-[9px] w-6" style={{ color: FOREGROUND, fontFamily: "'Inter', sans-serif" }}>
                                {d.value}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Set-by-set trend ─────────────────────────────────────────
function SetTrend({ data }: { data: SetStat[] }) {
    if (data.length === 0) return null;

    return (
        <div className="flex flex-col">
            <span className="text-[10px] mb-2" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                Évolution par set
            </span>
            <div className="flex gap-2">
                {data.map(s => {
                    const color = s.win_rate >= 60 ? "#34d399" : s.win_rate >= 45 ? "#fbbf24" : "#f87171";
                    return (
                        <div key={s.set} className="flex flex-col items-center gap-1 flex-1 p-2 rounded-lg"
                            style={{ background: SURFACE_MUTED, border: `1px solid ${PANEL_BORDER}` }}>
                            <span className="text-[9px]" style={{ color: MUTED_TEXT }}>Set {s.set}</span>
                            <span className="text-sm font-semibold" style={{ color, fontFamily: "'Playfair Display', serif" }}>
                                {s.win_rate}%
                            </span>
                            <span className="text-[8px]" style={{ color: MUTED_TEXT }}>
                                {s.won}/{s.total} · {s.avg_rally}c
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────
export default function ServerProfilePanel({ serverName, matchId, apiUrl }: Props) {
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        if (!serverName) { setProfile(null); return; }
        setLoading(true);
        const params = new URLSearchParams();
        if (matchId) params.set("match_id", matchId);
        fetch(`${apiUrl}/api/search/player-serve-profile/${encodeURIComponent(serverName)}?${params}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => setProfile(data))
            .catch(() => setProfile(null))
            .finally(() => setLoading(false));
    }, [serverName, matchId, apiUrl]);

    if (!serverName) return null;

    const faultColors: Record<string, string> = {
        pt_gagne: "#34d399",
        out: "#f87171",
        filet: "#fbbf24",
    };

    return (
        <div
            className="rounded-2xl overflow-hidden"
            style={{
                background: PANEL_BG,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${PANEL_BORDER}`,
                boxShadow: PANEL_SHADOW,
            }}
        >
            {/* Header */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="w-full px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: collapsed ? "none" : `1px solid ${PANEL_BORDER}` }}
            >
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                        style={{ background: "linear-gradient(135deg, #0a84ff, #5e5ce6)", color: "#fff", fontWeight: 700 }}>
                        {serverName?.charAt(0)}
                    </div>
                    <div className="text-left">
                        <div className="text-xs font-semibold" style={{ color: FOREGROUND, fontFamily: "'Inter', sans-serif" }}>
                            Profil Serveur
                        </div>
                        <div className="text-[10px]" style={{ color: MUTED_TEXT, fontFamily: "'Inter', sans-serif" }}>
                            {serverName?.replace(/_/g, " ")}
                        </div>
                    </div>
                </div>
                <svg className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
                    fill="none" stroke={MUTED_TEXT} strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Content */}
            {!collapsed && (
                <div className="px-4 py-4 space-y-5" style={{ transition: "all 0.3s ease" }}>
                    {loading && (
                        <div className="flex justify-center py-6">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                        </div>
                    )}

                    {!loading && profile && (
                        <>
                            {/* Row 1: Win gauge + Key stats — horizontal */}
                            <div className="flex flex-col md:flex-row items-center gap-6">
                                <WinRateGauge rate={profile.win_rate} total={profile.total_service_points} won={profile.points_won} />
                                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
                                    <div className="p-3 rounded-xl text-center" style={{ background: SURFACE_BG, border: `1px solid ${PANEL_BORDER}` }}>
                                        <div className="text-2xl font-semibold" style={{ color: FOREGROUND, fontFamily: "'Playfair Display', serif" }}>
                                            {profile.avg_rally_length}
                                        </div>
                                        <div className="text-xs mt-1" style={{ color: MUTED_TEXT }}>Coups moy.</div>
                                    </div>
                                    <div className="p-3 rounded-xl text-center" style={{ background: SURFACE_BG, border: `1px solid ${PANEL_BORDER}` }}>
                                        <div className="text-2xl font-semibold" style={{ color: FOREGROUND, fontFamily: "'Playfair Display', serif" }}>
                                            {profile.avg_duration_seconds}s
                                        </div>
                                        <div className="text-xs mt-1" style={{ color: MUTED_TEXT }}>Durée moy.</div>
                                    </div>
                                    <div className="p-3 rounded-xl text-center" style={{ background: SURFACE_BG, border: `1px solid ${PANEL_BORDER}` }}>
                                        <div className="text-2xl font-semibold" style={{ color: "#0a84ff", fontFamily: "'Playfair Display', serif" }}>
                                            {profile.total_service_points}
                                        </div>
                                        <div className="text-xs mt-1" style={{ color: MUTED_TEXT }}>Points servis</div>
                                    </div>
                                    <div className="p-3 rounded-xl text-center" style={{ background: SURFACE_BG, border: `1px solid ${PANEL_BORDER}` }}>
                                        <div className="text-2xl font-semibold" style={{ color: "#34d399", fontFamily: "'Playfair Display', serif" }}>
                                            {profile.points_won}
                                        </div>
                                        <div className="text-xs mt-1" style={{ color: MUTED_TEXT }}>Points gagnés</div>
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Table heatmap + Laterality — side by side */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {profile.service_zones.length > 0 && (
                                    <TableHeatmap zones={profile.service_zones} />
                                )}
                                <LateralityDonut data={profile.laterality} />
                            </div>

                            {/* Row 3: Rally distribution — full width */}
                            <RallyChart data={profile.rally_distribution} />

                            {/* Row 4: Shots + Faults + Sets — 3 columns */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <HorizontalBars
                                    data={profile.last_shots.map(s => ({ key: s.shot, value: s.count }))}
                                    label="Derniers coups"
                                    colorFn={() => "#5e5ce6"}
                                />
                                <HorizontalBars
                                    data={profile.faults.map(f => ({ key: f.type, value: f.count }))}
                                    label="Types de conclusion"
                                    colorFn={(k) => faultColors[k] || MUTED_TEXT}
                                />
                                <SetTrend data={profile.by_set} />
                            </div>
                        </>
                    )}

                    {!loading && !profile && (
                        <p className="text-center text-xs py-4" style={{ color: MUTED_TEXT }}>
                            Données non disponibles
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
