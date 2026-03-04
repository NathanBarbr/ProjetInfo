"use client";

import { useState, useEffect, useCallback } from "react";

interface Props {
    sequenceZones: string;   // "m1,d3,g2,g3"
    sequenceEffets: string;  // "service,poussette,poussette,topspin"
    serveur: string;
    winner: string;
    playerA: string;
    playerB: string;
}

// Zone label → (x%, y%) on table SVG
// Table is viewed from top: player A serves from bottom
// Columns: g=left(20%), m=center(50%), d=right(80%)
// Rows: 1=near net(20%), 2=mid(50%), 3=far/baseline(80%)
// Alternate sides for each shot (A plays bottom, B plays top)
function zoneToPos(zone: string, shotIndex: number): { x: number; y: number } {
    const col = zone.charAt(0); // g, m, d
    const row = zone.charAt(1); // 1, 2, 3

    const colMap: Record<string, number> = { g: 18, m: 50, d: 82 };
    const rowMap: Record<string, number> = { "1": 18, "2": 45, "3": 72 };

    let x = colMap[col] ?? 50;
    let y = rowMap[row] ?? 50;

    // Even shots = bottom half (player A side), odd = top half (player B side)
    const isTopHalf = shotIndex % 2 === 1;
    if (isTopHalf) {
        // Mirror: top half of table
        y = y * 0.45 + 3;          // compress to top 48%
        x = 100 - x;                // mirror left/right
    } else {
        // Bottom half
        y = y * 0.45 + 52;         // compress to bottom 48%
    }

    return { x, y };
}

const EFFECT_COLORS: Record<string, string> = {
    service: "#0a84ff",
    topspin: "#ff453a",
    poussette: "#30d158",
    bloc: "#bf5af2",
    flip: "#ff9f0a",
    coupe: "#64d2ff",
    lob: "#ffd60a",
};

const EFFECT_EMOJI: Record<string, string> = {
    service: "•",
    topspin: "•",
    poussette: "•",
    bloc: "•",
    flip: "•",
    coupe: "•",
    lob: "•",
};

export default function PointTrajectory({ sequenceZones, sequenceEffets, serveur, winner, playerA, playerB }: Props) {
    const zones = sequenceZones.split(",").map(z => z.trim()).filter(Boolean);
    const effets = sequenceEffets.split(",").map(e => e.trim()).filter(Boolean);

    const [step, setStep] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(800); // ms per step

    const totalSteps = zones.length;

    const advance = useCallback(() => {
        setStep(prev => {
            if (prev >= totalSteps - 1) {
                setPlaying(false);
                return prev;
            }
            return prev + 1;
        });
    }, [totalSteps]);

    useEffect(() => {
        if (!playing) return;
        const timer = setInterval(advance, speed);
        return () => clearInterval(timer);
    }, [playing, speed, advance]);

    const play = () => {
        if (step >= totalSteps - 1) setStep(0);
        setPlaying(true);
    };

    const positions = zones.map((z, i) => zoneToPos(z, i));

    // Table dimensions
    const W = 400, H = 280;

    return (
        <div className="rounded-2xl overflow-hidden p-5"
            style={{
                background: "rgba(44, 44, 46, 0.6)",
                backdropFilter: "blur(20px)",
                border: "1px solid #3a3a3c",
            }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-semibold" style={{ color: "#f5f5f7", fontFamily: "'Inter', sans-serif" }}>
                        Trajectoire du point
                    </h3>
                    <p className="text-[11px] mt-0.5" style={{ color: "#86868b" }}>
                        {serveur} au service → Gagné par {winner}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={play} disabled={playing}
                        className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors"
                        style={{
                            background: playing ? "#3a3a3c" : "#0a84ff",
                            color: "#fff",
                            opacity: playing ? 0.5 : 1,
                        }}>
                        {step >= totalSteps - 1 ? "↺ Replay" : playing ? "▶ En cours..." : "▶ Animer"}
                    </button>
                    <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
                        className="px-2 py-1.5 text-xs rounded-lg"
                        style={{ background: "#2c2c2e", color: "#f5f5f7", border: "1px solid #3a3a3c" }}>
                        <option value={1200}>Lent</option>
                        <option value={800}>Normal</option>
                        <option value={400}>Rapide</option>
                    </select>
                </div>
            </div>

            {/* Table SVG */}
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ maxWidth: 500 }}
            >
                {/* Table background */}
                <rect x={10} y={4} width={W - 20} height={H - 8} rx={12}
                    fill="#1a4d2e" stroke="#2d7a4a" strokeWidth={2} />

                {/* Center line (net) */}
                <line x1={15} y1={H / 2} x2={W - 15} y2={H / 2}
                    stroke="#f5f5f7" strokeWidth={2} opacity={0.8} />
                <text x={W / 2} y={H / 2 - 5} textAnchor="middle"
                    fill="#f5f5f7" opacity={0.3}
                    style={{ fontSize: "8px", fontFamily: "'Inter', sans-serif" }}>
                    FILET
                </text>

                {/* Grid lines (subtle) */}
                {[0.33, 0.66].map(pct => (
                    <g key={pct}>
                        <line x1={10 + (W - 20) * pct} y1={4} x2={10 + (W - 20) * pct} y2={H - 4}
                            stroke="#2d7a4a" strokeWidth={0.5} strokeDasharray="4 4" />
                    </g>
                ))}
                {[0.25, 0.75].map(pct => (
                    <line key={pct} x1={15} y1={H * pct} x2={W - 15} y2={H * pct}
                        stroke="#2d7a4a" strokeWidth={0.5} strokeDasharray="4 4" />
                ))}

                {/* Player labels */}
                <text x={W / 2} y={H - 10} textAnchor="middle"
                    fill="#f5f5f7" opacity={0.5}
                    style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                    {playerA} {serveur === playerA ? "(svc)" : ""}
                </text>
                <text x={W / 2} y={16} textAnchor="middle"
                    fill="#f5f5f7" opacity={0.5}
                    style={{ fontSize: "9px", fontFamily: "'Inter', sans-serif", fontWeight: 600 }}>
                    {playerB} {serveur === playerB ? "(svc)" : ""}
                </text>

                {/* Trajectory lines (shown up to current step) */}
                {positions.slice(0, step + 1).map((pos, i) => {
                    if (i === 0) return null;
                    const prev = positions[i - 1];
                    const px = (prev.x / 100) * (W - 20) + 10;
                    const py = (prev.y / 100) * (H - 8) + 4;
                    const cx = (pos.x / 100) * (W - 20) + 10;
                    const cy = (pos.y / 100) * (H - 8) + 4;
                    const effect = effets[i] || "";
                    const color = EFFECT_COLORS[effect] || "#f5f5f7";

                    return (
                        <g key={i}>
                            <line x1={px} y1={py} x2={cx} y2={cy}
                                stroke={color} strokeWidth={2}
                                opacity={i <= step ? 0.8 : 0.2}
                                strokeDasharray={i === step ? "none" : "none"}>
                                <animate attributeName="opacity" from="0.3" to="0.8" dur="0.5s" fill="freeze" />
                            </line>
                            {/* Arrow head */}
                            <circle cx={cx} cy={cy} r={3} fill={color} opacity={0.6}>
                                <animate attributeName="r" from="1" to="3" dur="0.3s" fill="freeze" />
                            </circle>
                        </g>
                    );
                })}

                {/* Shot circles */}
                {positions.slice(0, step + 1).map((pos, i) => {
                    const cx = (pos.x / 100) * (W - 20) + 10;
                    const cy = (pos.y / 100) * (H - 8) + 4;
                    const effect = effets[i] || "";
                    const color = EFFECT_COLORS[effect] || "#f5f5f7";
                    const isCurrent = i === step;

                    return (
                        <g key={`dot-${i}`}>
                            {/* Pulse ring on current */}
                            {isCurrent && (
                                <circle cx={cx} cy={cy} r={14} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4}>
                                    <animate attributeName="r" from="8" to="18" dur="1s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                                </circle>
                            )}
                            {/* Main dot */}
                            <circle cx={cx} cy={cy} r={isCurrent ? 8 : 5}
                                fill={color} stroke="#fff" strokeWidth={isCurrent ? 2 : 1}
                                style={{ transition: "all 0.3s ease" }}>
                            </circle>
                            {/* Shot number */}
                            <text x={cx} y={cy + 3.5} textAnchor="middle"
                                fill="#fff" style={{ fontSize: "7px", fontWeight: 700 }}>
                                {i + 1}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* Shot timeline */}
            <div className="mt-4 flex gap-1.5 flex-wrap">
                {effets.map((e, i) => {
                    const color = EFFECT_COLORS[e] || "#86868b";
                    const isActive = i <= step;
                    const isCurrent = i === step;
                    return (
                        <button key={i}
                            onClick={() => { setStep(i); setPlaying(false); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all"
                            style={{
                                background: isCurrent ? color : isActive ? "rgba(44,44,46,0.8)" : "#2c2c2e",
                                color: isCurrent ? "#fff" : isActive ? "#f5f5f7" : "#86868b",
                                border: `1px solid ${isCurrent ? color : "#3a3a3c"}`,
                                opacity: isActive ? 1 : 0.5,
                                fontFamily: "'Inter', sans-serif",
                            }}>
                            <span>{EFFECT_EMOJI[e] || "•"}</span>
                            <span>{e}</span>
                            <span style={{ opacity: 0.6 }}>→{zones[i]}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
