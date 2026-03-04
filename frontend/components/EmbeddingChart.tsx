"use client";

import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ZAxis } from 'recharts';

interface Point {
    id: string;
    x: number;
    y: number;
    match_id: string;
    point_id: number;
    faute_type: string;
    winner: string;
    nb_coups: number;
    description: string;
    clip_path?: string;
    [key: string]: any;
}

interface EmbeddingChartProps {
    data: Point[];
    onPointClick?: (point: Point) => void;
    isLoading?: boolean;
}

const EmbeddingChart: React.FC<EmbeddingChartProps> = ({ data, onPointClick, isLoading }) => {

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[600px] w-full bg-[#2c2c2e] rounded-xl border border-[#3a3a3c]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className="ml-2 text-gray-400 font-medium">Analyse spatiale en cours...</span>
            </div>
        );
    }

    // Couleurs premium pour le dark mode, avec gestion de la visibilité
    const getColor = (point: Point) => {
        // Si masqué, on renvoie une couleur très sombre/transparente
        if (point.isVisible === false) {
            return "#2c2c2e"; // Ou "rgba(30, 30, 30, 0.2)"
        }

        if (point.faute_type === 'pt_gagne') {
            // Highlights (longs échanges gagnants) -> Vert émeraude vibrant
            if (point.nb_coups > 8) return "#10b981";
            // Points gagnants normaux -> Bleu azur
            return "#3b82f6";
        }
        // Fautes -> Gris moyen
        return "#6b7280";
    };

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;

            // Ne pas afficher de tooltip pour les points masqués
            if (data.isVisible === false) return null;

            return (
                <div className="bg-[#1c1c1e] p-4 border border-[#3a3a3c] rounded-xl shadow-2xl max-w-sm z-50">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white text-sm">Point {data.point_id}</span>
                        <span className="text-[10px] text-gray-400 bg-[#2c2c2e] px-2 py-0.5 rounded-full">{data.match_id}</span>
                    </div>

                    <p className="text-xs text-gray-300 mb-3 leading-dashed line-clamp-3">{data.description}</p>

                    <div className="flex flex-wrap gap-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium ${data.faute_type === 'pt_gagne' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {data.faute_type === 'pt_gagne' ? 'Gagnant' : 'Faute'}
                        </span>
                        <span className="inline-flex items-center bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md text-[10px] font-medium">
                            {data.nb_coups} coups
                        </span>
                        {data.winner && (
                            <span className="inline-flex items-center bg-gray-700 text-gray-300 px-2 py-1 rounded-md text-[10px]">
                                🏆 {data.winner}
                            </span>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-full shadow-lg bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-[#3a3a3c] bg-[#2c2c2e]/50 backdrop-blur-sm">
                <h3 className="text-lg font-semibold text-white tracking-tight">Carte Cognitive des Points</h3>
                <p className="text-xs text-gray-400 mt-1">Projection PCA des embeddings de descriptions (384d → 2d)</p>
            </div>

            <div className="flex-1 p-4 relative">
                <div className="h-full w-full min-h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3c" opacity={0.5} />
                            <XAxis type="number" dataKey="x" name="PC1" hide domain={['auto', 'auto']} />
                            <YAxis type="number" dataKey="y" name="PC2" hide domain={['auto', 'auto']} />
                            <ZAxis type="number" range={[40, 400]} /> {/* Taille des points variable */}
                            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#6b7280' }} />
                            <Scatter
                                name="Points"
                                data={data}
                                onClick={(p) => onPointClick && onPointClick(p.payload)}
                                className="cursor-pointer transition-all duration-300"
                                shape="circle"
                            >
                                {data.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={getColor(entry)}
                                        opacity={entry.isVisible === false ? 0.1 : 1}
                                        stroke={entry.isVisible === false ? "transparent" : undefined}
                                        className="transition-all duration-500"
                                    />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>

                {/* Legend Overlay */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-[#2c2c2e]/90 backdrop-blur-md px-4 py-2 rounded-full border border-[#3a3a3c] shadow-lg flex gap-6 text-[11px] text-gray-300">
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="font-medium">Échange Intense</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                        <span className="font-medium">Point Gagnant</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-gray-500"></div>
                        <span>Faute / Standard</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmbeddingChart;
