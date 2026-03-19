"use client";

import React, { useEffect, useState, useMemo } from 'react';
import EmbeddingChart from '@/components/EmbeddingChart';
import EmbeddingChart3D from '@/components/EmbeddingChart3D';
import { RefreshCw, ArrowLeft, Filter, X, Box, Square } from "lucide-react"; // Ajout d'icônes
import Link from 'next/link';

// URL de l'API Backend
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export default function VisualizationPage() {
    const [data, setData] = useState<any[]>([]);
    const [zoneAnalytics, setZoneAnalytics] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingZones, setLoadingZones] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPoint, setSelectedPoint] = useState<any>(null);

    // Mode 3D
    const [is3DMode, setIs3DMode] = useState(false);

    // États des filtres
    const [winnerFilter, setWinnerFilter] = useState<string>("");
    const [faultFilter, setFaultFilter] = useState<string>("");
    const [minShotsFilter, setMinShotsFilter] = useState<string>("");
    const [setFilter, setSetFilter] = useState<string>("");
    const [serverFilter, setServerFilter] = useState<string>("");
    const [winningShotFilter, setWinningShotFilter] = useState<string>("");

    const fetchData = async (refresh = false) => {
        setLoading(true);
        setError(null);
        try {
            // On récupère TOUTES les données, PCA 3D est maintenant par défaut sur le backend
            let url = `${API_URL}/api/visualization/embeddings?method=pca`;
            if (refresh) url += '&refresh=true';

            const res = await fetch(url);

            if (!res.ok) {
                throw new Error(`Erreur HTTP: ${res.status}`);
            }

            const json = await res.json();
            setData(json.points || []);
        } catch (err: any) {
            setError(err.message || "Impossible de charger les données");
        } finally {
            setLoading(false);
        }
    };

    const fetchZoneAnalytics = async (setValue = "", winnerValue = "", serverValue = "") => {
        setLoadingZones(true);
        try {
            const params = new URLSearchParams();
            if (setValue) params.set("set_num", setValue);
            if (winnerValue) params.set("winner", winnerValue);
            if (serverValue) params.set("serveur", serverValue);
            const query = params.toString();
            const res = await fetch(`${API_URL}/api/visualization/zone-occupancy${query ? `?${query}` : ""}`);
            if (!res.ok) throw new Error("zone occupancy unavailable");
            const json = await res.json();
            setZoneAnalytics(json.players || []);
        } catch {
            setZoneAnalytics([]);
        } finally {
            setLoadingZones(false);
        }
    };

    useEffect(() => {
        fetchData();
        fetchZoneAnalytics();
    }, []);

    useEffect(() => {
        fetchZoneAnalytics(setFilter, winnerFilter, serverFilter);
    }, [setFilter, winnerFilter, serverFilter]);

    // Helper pour formater l'affichage (ex: "FAN-ZHENDONG" -> "FAN ZHENDONG")
    const formatLabel = (str: string) => {
        if (!str) return "";
        return str.replace(/-/g, ' ');
    };

    // Calcul dynamique des options de filtres basé sur les données réelles
    const filterOptions = useMemo(() => {
        const winners = new Set<string>();
        const servers = new Set<string>();
        const sets = new Set<string>();
        const faultTypes = new Set<string>();
        const winningShots = new Set<string>();

        data.forEach(p => {
            if (p.winner) winners.add(p.winner);
            if (p.serveur) servers.add(p.serveur);
            if (p.set_num) sets.add(String(p.set_num));
            if (p.faute_type) faultTypes.add(p.faute_type);
            // On ignore les 'None' ou vides pour le filtre de coup gagnant
            if (p.winning_shot && p.winning_shot !== 'None') winningShots.add(p.winning_shot);
        });

        return {
            winners: Array.from(winners).sort(),
            servers: Array.from(servers).sort(),
            sets: Array.from(sets).sort((a, b) => parseInt(a) - parseInt(b)),
            faultTypes: Array.from(faultTypes).sort(),
            winningShots: Array.from(winningShots).sort()
        };
    }, [data]);

    // Filtrage Client Side
    const filteredData = useMemo(() => {
        return data.map(point => {
            let isVisible = true;

            if (winnerFilter && point.winner !== winnerFilter) isVisible = false;
            if (faultFilter && point.faute_type !== faultFilter) isVisible = false;
            if (minShotsFilter && point.nb_coups < parseInt(minShotsFilter)) isVisible = false;
            if (setFilter && String(point.set_num) !== setFilter) isVisible = false;
            if (serverFilter && point.serveur !== serverFilter) isVisible = false;
            if (winningShotFilter && point.winning_shot !== winningShotFilter) isVisible = false;

            return { ...point, isVisible };
        });
    }, [data, winnerFilter, faultFilter, minShotsFilter, setFilter, serverFilter, winningShotFilter]);

    const activeCount = filteredData.filter(p => p.isVisible).length;

    const handlePointClick = (point: any) => {
        // Si filtré (invisible), on ne clique pas (sauf si on veut explicitement permettre)
        if (point.isVisible === false) return;
        setSelectedPoint(point);
    };

    const resetFilters = () => {
        setWinnerFilter("");
        setFaultFilter("");
        setMinShotsFilter("");
        setSetFilter("");
        setServerFilter("");
        setWinningShotFilter("");
    };

    const hasFilters = winnerFilter || faultFilter || minShotsFilter || setFilter || serverFilter || winningShotFilter;
    const activeFilters = useMemo(() => {
        const labels: string[] = [];
        if (winnerFilter) labels.push(`Vainqueur: ${formatLabel(winnerFilter)}`);
        if (serverFilter) labels.push(`Serveur: ${formatLabel(serverFilter)}`);
        if (setFilter) labels.push(`Set: ${setFilter}`);
        if (faultFilter) labels.push(`Type: ${faultFilter}`);
        if (winningShotFilter) labels.push(`Coup: ${winningShotFilter}`);
        if (minShotsFilter) labels.push(`Min coups: ${minShotsFilter}`);
        return labels;
    }, [winnerFilter, serverFilter, setFilter, faultFilter, winningShotFilter, minShotsFilter]);

    const uniquePlayers = useMemo(() => new Set(data.map((p) => p.winner).filter(Boolean)).size, [data]);
    const uniqueSets = useMemo(() => new Set(data.map((p) => p.set_num).filter((v) => v !== undefined && v !== null)).size, [data]);

    return (
        <div className="min-h-screen bg-[#111111] text-[#f5f5f7] font-sans">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#1c1c1e]/80 backdrop-blur-md border-b border-[#3a3a3c]">
                <div className="max-w-[1920px] mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <button className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] transition-colors border border-[#3a3a3c]">
                                <ArrowLeft className="h-4 w-4 text-gray-300" />
                            </button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">Visualisation des Embeddings</h1>
                            <p className="text-xs text-gray-400">
                                Points affichés: <span className="text-white font-mono">{loading ? '...' : `${activeCount} / ${data.length}`}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Toggle 2D/3D */}
                        <div className="bg-[#2c2c2e] p-1 rounded-lg border border-[#3a3a3c] flex items-center gap-1">
                            <button
                                onClick={() => setIs3DMode(false)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${!is3DMode ? 'bg-[#3a3a3c] text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'}`}
                            >
                                <Square className="w-3 h-3" /> 2D
                            </button>
                            <button
                                onClick={() => setIs3DMode(true)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all ${is3DMode ? 'bg-[#0a84ff] text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'}`}
                            >
                                <Box className="w-3 h-3" /> 3D
                            </button>
                        </div>

                        <button
                            onClick={() => fetchData(true)}
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#3a3a3c]/50 text-gray-300 hover:bg-[#3a3a3c] transition-all border border-[#3a3a3c]"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {loading ? '...' : 'Rafraîchir'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1920px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-80px)]">

                {/* Sidebar Filtres */}
                <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-200 uppercase tracking-wider">
                                <Filter className="w-4 h-4 text-[#0a84ff]" />
                                Filtres
                            </div>
                            {activeCount < data.length && (
                                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">{activeCount} pts</span>
                            )}
                        </div>

                        <div className="space-y-4">
                            {/* Vainqueur */}
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-400 font-medium">Vainqueur</label>
                                <select
                                    value={winnerFilter}
                                    onChange={(e) => setWinnerFilter(e.target.value)}
                                    className="w-full bg-[#2c2c2e] border border-[#3a3a3c] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0a84ff]"
                                >
                                    <option value="">Tous</option>
                                    {filterOptions.winners.map(w => (
                                        <option key={w} value={w}>{formatLabel(w)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Serveur */}
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-400 font-medium">Serveur</label>
                                <select
                                    value={serverFilter}
                                    onChange={(e) => setServerFilter(e.target.value)}
                                    className="w-full bg-[#2c2c2e] border border-[#3a3a3c] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0a84ff]"
                                >
                                    <option value="">Tous</option>
                                    {filterOptions.servers.map(s => (
                                        <option key={s} value={s}>{formatLabel(s)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Numéro de Set */}
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-400 font-medium">Set</label>
                                <select
                                    value={setFilter}
                                    onChange={(e) => setSetFilter(e.target.value)}
                                    className="w-full bg-[#2c2c2e] border border-[#3a3a3c] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0a84ff]"
                                >
                                    <option value="">Tous</option>
                                    {filterOptions.sets.map(s => (
                                        <option key={s} value={s}>Set {s}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Type de Point */}
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-400 font-medium">Type de Point</label>
                                <select
                                    value={faultFilter}
                                    onChange={(e) => setFaultFilter(e.target.value)}
                                    className="w-full bg-[#2c2c2e] border border-[#3a3a3c] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0a84ff]"
                                >
                                    <option value="">Tous</option>
                                    {filterOptions.faultTypes.map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Coup Gagnant */}
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-400 font-medium">Coup Gagnant/Faute</label>
                                <select
                                    value={winningShotFilter}
                                    onChange={(e) => setWinningShotFilter(e.target.value)}
                                    className="w-full bg-[#2c2c2e] border border-[#3a3a3c] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0a84ff]"
                                >
                                    <option value="">Tous</option>
                                    {filterOptions.winningShots.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Longueur Échange */}
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-400 font-medium">Longueur Échange</label>
                                <select
                                    value={minShotsFilter}
                                    onChange={(e) => setMinShotsFilter(e.target.value)}
                                    className="w-full bg-[#2c2c2e] border border-[#3a3a3c] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0a84ff]"
                                >
                                    <option value="">Peu importe</option>
                                    <option value="3">Min 3 coups</option>
                                    <option value="5">Min 5 coups</option>
                                    <option value="10">Min 10 coups</option>
                                    <option value="15">Min 15 coups</option>
                                </select>
                            </div>
                        </div>

                        {hasFilters && (
                            <button
                                onClick={resetFilters}
                                className="w-full mt-4 flex items-center justify-center gap-2 text-xs text-red-400 hover:text-red-300 py-2 border border-red-900/30 rounded-lg hover:bg-red-900/10 transition-colors"
                            >
                                <X className="w-3 h-3" /> Effacer les filtres
                            </button>
                        )}

                        {activeFilters.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-[#2f2f31]">
                                <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Filtres actifs</p>
                                <div className="flex flex-wrap gap-2">
                                    {activeFilters.map((filterLabel) => (
                                        <span key={filterLabel} className="px-2 py-1 rounded-md bg-[#2c2c2e] text-[10px] text-gray-300 border border-[#3a3a3c]">
                                            {filterLabel}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-4">
                        <h3 className="text-sm font-semibold text-gray-200 mb-3">Resume rapide</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg bg-[#2c2c2e]/70 border border-[#3a3a3c] p-2">
                                <p className="text-[10px] text-gray-500 uppercase">Points visibles</p>
                                <p className="text-sm font-semibold text-white">{loading ? "..." : activeCount}</p>
                            </div>
                            <div className="rounded-lg bg-[#2c2c2e]/70 border border-[#3a3a3c] p-2">
                                <p className="text-[10px] text-gray-500 uppercase">Joueurs</p>
                                <p className="text-sm font-semibold text-white">{uniquePlayers}</p>
                            </div>
                            <div className="rounded-lg bg-[#2c2c2e]/70 border border-[#3a3a3c] p-2 col-span-2">
                                <p className="text-[10px] text-gray-500 uppercase">Sets indexes</p>
                                <p className="text-sm font-semibold text-white">{uniqueSets}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#1c1c1e]/50 p-4 rounded-xl border border-[#3a3a3c] text-xs text-gray-500">
                        <p>💡 <b>Note:</b> {is3DMode ? "Utilisez la souris pour tourner (clic gauche), déplacer (clic droit) et zoomer (molette)." : "Les points s'estompent lorsqu'ils sont filtrés pour conserver la structure du graphique."}</p>
                    </div>
                    <div className="bg-[#1c1c1e] rounded-xl border border-[#3a3a3c] p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-200">Zones d'occupation (joueur / set)</h3>
                            {loadingZones && <span className="text-[10px] text-gray-500">Chargement...</span>}
                        </div>
                        {zoneAnalytics.length === 0 ? (
                            <p className="text-xs text-gray-500">Aucune donnee zone disponible.</p>
                        ) : (
                            <div className="space-y-4">
                                {zoneAnalytics.slice(0, 2).map((player) => (
                                    <div key={player.player} className="space-y-2">
                                        <div className="text-xs text-gray-300 font-medium">
                                            {formatLabel(player.player)} ({player.total_points})
                                        </div>
                                        {(player.occupancy_zones || []).length === 0 ? (
                                            <p className="text-[11px] text-gray-500">Zones non disponibles pour ce filtre.</p>
                                        ) : (
                                            (player.occupancy_zones || []).slice(0, 3).map((z: any) => (
                                                <div key={`${player.player}-${z.zone}`} className="flex items-center gap-2 text-[11px]">
                                                    <span className="w-16 text-gray-400">{z.zone}</span>
                                                    <div className="flex-1 h-1.5 bg-[#2c2c2e] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[#0a84ff]"
                                                            style={{ width: `${Math.min(100, (z.count / Math.max(1, player.total_points)) * 100)}%` }}
                                                        />
                                                    </div>
                                                    <span className="w-8 text-right text-gray-300">{z.count}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {/* Graphique Principal */}
                <div className="lg:col-span-10 h-full relative group">
                    {error ? (
                        <div className="h-full flex items-center justify-center bg-[#1c1c1e] rounded-xl border border-red-900/30 text-red-400 p-6 text-center">
                            <div>
                                <p className="text-lg font-bold mb-2">Erreur de chargement</p>
                                <p className="text-sm opacity-80">{error}</p>
                                <button onClick={() => fetchData(true)} className="mt-4 px-4 py-2 bg-red-900/20 rounded-lg text-sm hover:bg-red-900/40">Réessayer</button>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full w-full">
                            {/* Le panneau de détail apparaît en overlay "absolu" si un point est sélectionné */}
                            {selectedPoint && (
                                <div className="absolute top-4 right-4 z-20 w-80 bg-[#1c1c1e]/95 backdrop-blur-md border border-[#3a3a3c] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100%-32px)] transition-all animate-in fade-in slide-in-from-right-4">
                                    <div className="relative aspect-video bg-black">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedPoint(null); }}
                                            className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                        <video
                                            src={`${API_URL}/api/videos/stream/${encodeURIComponent(selectedPoint.clip_path || '')}?match_id=${selectedPoint.video_id || ''}`}
                                            controls
                                            autoPlay
                                            className="w-full h-full object-contain"
                                        />
                                    </div>
                                    <div className="p-4 overflow-y-auto custom-scrollbar">
                                        <div className="mb-3">
                                            <h3 className="font-bold text-white text-base">Point {selectedPoint.point_id}</h3>
                                            <div className="flex gap-2 text-xs mt-1">
                                                <span className="px-2 py-0.5 rounded bg-[#2c2c2e] text-gray-300">{selectedPoint.winner}</span>
                                                <span className="px-2 py-0.5 rounded bg-[#2c2c2e] text-gray-300">{selectedPoint.nb_coups} coups</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-400 italic mb-4 border-l-2 border-[#3a3a3c] pl-2">{selectedPoint.description}</p>

                                        <Link href={`/watch/${selectedPoint.match_id}?point=${selectedPoint.point_id}`} className="block">
                                            <button className="w-full py-2 bg-[#0a84ff] hover:bg-[#007aff] text-white rounded-lg text-xs font-bold transition-colors">
                                                Analyser en détail
                                            </button>
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {is3DMode ? (
                                <EmbeddingChart3D
                                    data={filteredData}
                                    isLoading={loading}
                                    onPointClick={handlePointClick}
                                />
                            ) : (
                                <EmbeddingChart
                                    data={filteredData}
                                    isLoading={loading}
                                    onPointClick={handlePointClick}
                                />
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

