"use client";

import { useState, useEffect, useCallback } from "react";

interface Props {
    sequenceZones: string;
    sequenceEffets: string;
    serveur: string;
    winner: string;
    playerA: string;
    playerB: string;
}

const TABLE_WIDTH = 612;
const TABLE_HEIGHT = 367;
const DISPLAY_WIDTH = TABLE_HEIGHT;
const DISPLAY_HEIGHT = TABLE_WIDTH;
const TABLE_MARGIN_X = 63;
const TABLE_MARGIN_Y = 56;
const INNER_TABLE_WIDTH = 486;
const INNER_TABLE_HEIGHT = 268;

function zoneToPos(zone: string, shotIndex: number): { x: number; y: number } {
    const col = zone.charAt(0);
    const row = zone.charAt(1);

    const leftHalfY: Record<string, number> = { g: 18, m: 50, d: 82 };
    const rightHalfY: Record<string, number> = { g: 82, m: 50, d: 18 };
    const leftHalfDepthX: Record<string, number> = { "1": 82, "2": 50, "3": 18 };
    const rightHalfDepthX: Record<string, number> = { "1": 18, "2": 50, "3": 82 };

    const isRightHalf = shotIndex % 2 === 1;
    if (isRightHalf) {
        const x = rightHalfDepthX[row] ?? 50;
        const y = rightHalfY[col] ?? 50;
        return {
            x: 52 + (x / 100) * 42,
            y,
        };
    } else {
        const x = leftHalfDepthX[row] ?? 50;
        const y = leftHalfY[col] ?? 50;
        return {
            x: (x / 100) * 42 + 6,
            y,
        };
    }
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

const EFFECT_MARKER: Record<string, string> = {
    service: "•",
    topspin: "•",
    poussette: "•",
    bloc: "•",
    flip: "•",
    coupe: "•",
    lob: "•",
};

function boardToDisplay(boardX: number, boardY: number) {
    return {
        x: TABLE_HEIGHT - boardY,
        y: boardX,
    };
}

const PANEL_BG = "var(--viz-panel-bg)";
const PANEL_BORDER = "var(--viz-panel-border)";
const PANEL_SHADOW = "var(--viz-shadow)";
const SURFACE_BG = "var(--viz-surface)";
const FOREGROUND = "var(--foreground)";
const MUTED_TEXT = "var(--viz-text-muted)";
const BADGE_BG = "color-mix(in srgb, var(--card) 88%, transparent)";

export default function PointTrajectory({ sequenceZones, sequenceEffets, serveur, winner, playerA, playerB }: Props) {
    const zones = sequenceZones.split(",").map((z) => z.trim()).filter(Boolean);
    const effets = sequenceEffets.split(",").map((e) => e.trim()).filter(Boolean);

    const [step, setStep] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(800);

    const totalSteps = zones.length;

    const advance = useCallback(() => {
        setStep((prev) => {
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
    const tableX = TABLE_MARGIN_X;
    const tableY = TABLE_MARGIN_Y;

    return (
        <div
            className="rounded-2xl overflow-hidden p-5"
            style={{
                background: PANEL_BG,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${PANEL_BORDER}`,
                boxShadow: PANEL_SHADOW,
            }}
        >
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-semibold" style={{ color: FOREGROUND, fontFamily: "'Inter', sans-serif" }}>
                        Trajectoire du point
                    </h3>
                    <p className="text-[11px] mt-0.5" style={{ color: MUTED_TEXT }}>
                        {serveur} au service {"->"} Gagne par {winner}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={play}
                        disabled={playing}
                        className="px-3 py-1.5 text-xs rounded-lg font-medium transition-colors"
                        style={{
                            background: playing ? "var(--secondary)" : "#0a84ff",
                            color: "#fff",
                            opacity: playing ? 0.5 : 1,
                        }}
                    >
                        {step >= totalSteps - 1 ? "Replay" : playing ? "En cours..." : "Animer"}
                    </button>
                    <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="px-2 py-1.5 text-xs rounded-lg"
                        style={{ background: SURFACE_BG, color: FOREGROUND, border: `1px solid ${PANEL_BORDER}` }}
                    >
                        <option value={1200}>Lent</option>
                        <option value={800}>Normal</option>
                        <option value={400}>Rapide</option>
                    </select>
                </div>
            </div>

            <div
                className="relative w-full overflow-hidden rounded-2xl"
                style={{
                    maxWidth: 420,
                    margin: "0 auto",
                    aspectRatio: "367 / 612",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--border) 65%, transparent)",
                }}
            >
                <div className="absolute left-3 right-3 top-3 flex items-start justify-between text-[10px]">
                    <span
                        className="rounded-full px-2 py-1"
                        style={{ color: FOREGROUND, background: BADGE_BG, backdropFilter: "blur(8px)", border: "1px solid var(--border)" }}
                    >
                        {playerB}
                    </span>
                    <span
                        className="rounded-full px-2 py-1"
                        style={{ color: FOREGROUND, background: BADGE_BG, backdropFilter: "blur(8px)", border: "1px solid var(--border)" }}
                    >
                        Fond reel
                    </span>
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex justify-between text-[10px]">
                    <span
                        className="rounded-full px-2 py-1"
                        style={{ color: FOREGROUND, background: BADGE_BG, backdropFilter: "blur(8px)", border: "1px solid var(--border)" }}
                    >
                        {playerA}
                    </span>
                    <span
                        className="rounded-full px-2 py-1"
                        style={{ color: FOREGROUND, background: BADGE_BG, backdropFilter: "blur(8px)", border: "1px solid var(--border)" }}
                    >
                        Serveur: {serveur}
                    </span>
                </div>

                <svg viewBox={`0 0 ${DISPLAY_WIDTH} ${DISPLAY_HEIGHT}`} className="absolute inset-0 h-full w-full">
                    <g transform={`translate(${DISPLAY_WIDTH} 0) rotate(90)`}>
                        <image href="/table-tennis-table-user.jpg" x="0" y="0" width={TABLE_WIDTH} height={TABLE_HEIGHT} preserveAspectRatio="none" />
                        <rect x="0" y="0" width={TABLE_WIDTH} height={TABLE_HEIGHT} fill="rgba(7,11,17,0.14)" />
                    </g>

                    {positions.slice(0, step + 1).map((pos, i) => {
                        if (i === 0) return null;
                        const prev = positions[i - 1];
                        const prevBoardX = (prev.x / 100) * INNER_TABLE_WIDTH + tableX;
                        const prevBoardY = (prev.y / 100) * INNER_TABLE_HEIGHT + tableY;
                        const nextBoardX = (pos.x / 100) * INNER_TABLE_WIDTH + tableX;
                        const nextBoardY = (pos.y / 100) * INNER_TABLE_HEIGHT + tableY;
                        const { x: px, y: py } = boardToDisplay(prevBoardX, prevBoardY);
                        const { x: cx, y: cy } = boardToDisplay(nextBoardX, nextBoardY);
                        const effect = effets[i] || "";
                        const color = EFFECT_COLORS[effect] || FOREGROUND;

                        return (
                            <g key={i}>
                                <line x1={px} y1={py} x2={cx} y2={cy} stroke={color} strokeWidth={2.5} opacity={0.9}>
                                    <animate attributeName="opacity" from="0.3" to="0.9" dur="0.5s" fill="freeze" />
                                </line>
                                <circle cx={cx} cy={cy} r={3} fill={color} opacity={0.75}>
                                    <animate attributeName="r" from="1" to="3" dur="0.3s" fill="freeze" />
                                </circle>
                            </g>
                        );
                    })}

                    {positions.slice(0, step + 1).map((pos, i) => {
                        const boardX = (pos.x / 100) * INNER_TABLE_WIDTH + tableX;
                        const boardY = (pos.y / 100) * INNER_TABLE_HEIGHT + tableY;
                        const { x: cx, y: cy } = boardToDisplay(boardX, boardY);
                        const effect = effets[i] || "";
                        const color = EFFECT_COLORS[effect] || FOREGROUND;
                        const isCurrent = i === step;

                        return (
                            <g key={`dot-${i}`}>
                                {isCurrent && (
                                    <circle cx={cx} cy={cy} r={16} fill="none" stroke={color} strokeWidth={1.8} opacity={0.5}>
                                        <animate attributeName="r" from="8" to="20" dur="1s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" from="0.7" to="0" dur="1s" repeatCount="indefinite" />
                                    </circle>
                                )}
                                <circle
                                    cx={cx}
                                    cy={cy}
                                    r={isCurrent ? 8.5 : 5.5}
                                    fill={color}
                                    stroke="#fff"
                                    strokeWidth={isCurrent ? 2.2 : 1.2}
                                    style={{ transition: "all 0.3s ease" }}
                                />
                                <text x={cx} y={cy + 3.5} textAnchor="middle" fill="#fff" style={{ fontSize: "7px", fontWeight: 700 }}>
                                    {i + 1}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="mt-4 flex gap-1.5 flex-wrap">
                {effets.map((e, i) => {
                    const color = EFFECT_COLORS[e] || MUTED_TEXT;
                    const isActive = i <= step;
                    const isCurrent = i === step;

                    return (
                        <button
                            key={i}
                            onClick={() => {
                                setStep(i);
                                setPlaying(false);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] transition-all"
                            style={{
                                background: isCurrent ? color : isActive ? "color-mix(in srgb, var(--card) 82%, transparent)" : SURFACE_BG,
                                color: isCurrent ? "#fff" : isActive ? FOREGROUND : MUTED_TEXT,
                                border: `1px solid ${isCurrent ? color : "var(--border)"}`,
                                opacity: isActive ? 1 : 0.5,
                                fontFamily: "'Inter', sans-serif",
                            }}
                        >
                            <span>{EFFECT_MARKER[e] || "•"}</span>
                            <span>{e}</span>
                            <span style={{ opacity: 0.6 }}>{`->${zones[i]}`}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
