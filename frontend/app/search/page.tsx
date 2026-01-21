"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

interface SearchResult {
    id: string;
    match_id: string;
    video_id?: string;
    set_number?: number;
    set_num?: number;
    point_number?: number;
    point_id?: number;
    clip_id?: string;
    winner?: string;
    serveur?: string;
    faute_type?: string;
    dernier_coup?: string;
    nb_coups?: number;
    description?: string;
    score_A?: number;
    score_B?: number;
    [key: string]: any;
}

interface SearchResponse {
    points: SearchResult[];
    total: number;
    page: number;
    size: number;
    pages: number;
    message?: string;
}

interface SearchStats {
    total_points: number;
    matches: { id: string; count: number }[];
    winners: string[];
    serveurs: string[];
    fautes: string[];
    winning_shots: string[];
    service_zones: string[];
    service_lateralites: string[];
    nb_coups: { min: number; max: number; avg: number };
}

const API_URL = "http://localhost:8000";

function SearchContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // State for inputs (sync with URL on mount)
    const [query, setQuery] = useState(searchParams.get("q") || "");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(0);
    const [loading, setLoading] = useState(false);
    const [esStatus, setEsStatus] = useState<"checking" | "connected" | "disconnected">("checking");
    const [message, setMessage] = useState<string | null>(null);
    const [stats, setStats] = useState<SearchStats | null>(null);

    // Filters state
    const [filters, setFilters] = useState({
        match_id: searchParams.get("match_id") || "",
        set_num: searchParams.get("set_num") || "",
        winner: searchParams.get("winner") || "",
        serveur: searchParams.get("serveur") || "",
        faute_type: searchParams.get("faute_type") || "",
        winning_shot: searchParams.get("winning_shot") || "",
        service_lateralite: searchParams.get("service_lateralite") || "",
        service_zone: searchParams.get("service_zone") || "",
        nb_coups_min: searchParams.get("nb_coups_min") || "",
        nb_coups_max: searchParams.get("nb_coups_max") || ""
    });

    // Current page from URL
    const currentPage = Number(searchParams.get("page")) || 1;

    // Check ES status
    useEffect(() => {
        fetch(`${API_URL}/api/search/status`)
            .then((res) => res.json())
            .then((data) => {
                const connected = data.elasticsearch.connected;
                setEsStatus(connected ? "connected" : "disconnected");
            })
            .catch(() => setEsStatus("disconnected"));
    }, []);

    // Perform Search AND Stats based on URL params
    const performSearchAndStats = useCallback(async () => {
        if (esStatus === "disconnected") return;

        setLoading(true);
        setMessage(null);

        // Build params from URL (source of truth)
        const params = new URLSearchParams(searchParams.toString());
        if (!params.has("page")) params.set("page", "1");
        if (!params.has("size")) params.set("size", "20");

        try {
            // 1. Fetch search results
            const searchRes = await fetch(`${API_URL}/api/search?${params.toString()}`);
            if (!searchRes.ok) {
                const errorText = await searchRes.text();
                throw new Error(`Search API error (${searchRes.status}): ${errorText}`);
            }

            const searchData: SearchResponse = await searchRes.json();

            if (!searchData) {
                throw new Error("Search API returned null data");
            }

            setResults(searchData.points || []);
            setTotal(searchData.total || 0);
            setPages(searchData.pages || 0);
            if (searchData.message) setMessage(searchData.message);

            // 2. Fetch Stats with SAME params (for contextual filtering)
            // Remove pagination params for stats (we want stats on the full result set)
            const statsParams = new URLSearchParams(params.toString());
            statsParams.delete("page");
            statsParams.delete("size");

            const statsRes = await fetch(`${API_URL}/api/search/stats?${statsParams.toString()}`);
            if (statsRes.ok) {
                const statsData: SearchStats = await statsRes.json();
                if (statsData) setStats(statsData);
            } else {
                console.warn("Stats API failed", statsRes.status);
            }

        } catch (error: any) {
            setMessage(`Error: ${error.message || "Unknown error"}`);
            // console.error(error); // Optional: keep clean
        } finally {
            setLoading(false);
        }
    }, [searchParams, esStatus]);

    // Effect to run search when URL params change
    useEffect(() => {
        performSearchAndStats();
    }, [performSearchAndStats]);

    // Update URL helper
    const updateUrl = (newParams: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString());

        Object.entries(newParams).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });

        // Always reset to page 1 when changing filters/query
        if (newParams.page === undefined) { // If not explicitly changing page
            params.set("page", "1");
        }

        router.push(`${pathname}?${params.toString()}`);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateUrl({ q: query, ...filters });
    };

    const handleFilterChange = (key: string, value: string) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        updateUrl({ [key]: value });
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", newPage.toString());
        router.push(`${pathname}?${params.toString()}`);
    };

    // Slug and Clip helpers
    const getSlug = (matchId: string) => {
        const mapping: Record<string, string> = {
            "FAN-ZHENDONG_vs_TRULS-MOREGARD": "fan-zhendong-vs-moregard",
            "HUGO-CALDERANO_vs_FELIX-LEBRUN": "hugo-calderano-vs-felix-lebrun"
        };
        return mapping[matchId] || matchId.toLowerCase().replace(/_/g, "-");
    };

    const getClipId = (result: SearchResult) => {
        if (result.clip_path) {
            const parts = result.clip_path.split("/");
            if (parts.length >= 2) return parts[1];
        }
        return `set_${result.set_num}_point_${result.point_id}`;
    };

    // Generate back URL
    const getBackUrl = () => {
        // We only need the query string
        return `/search?${searchParams.toString()}`;
    };

    return (
        <main className="max-w-7xl mx-auto px-6 py-8">
            {/* Search Form */}
            <form onSubmit={handleSearchSubmit} className="mb-8 space-y-4">
                {/* Search Bar */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Text search... (e.g., 'topspin', 'ace')"
                        className="flex-1 px-4 py-3 bg-card border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                    <button
                        type="submit"
                        disabled={loading || esStatus !== "connected"}
                        className="px-6 py-3 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-primary-foreground font-medium rounded-lg transition-colors"
                    >
                        {loading ? "..." : "Search"}
                    </button>
                </div>

                {/* Advanced Filters */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">

                    {/* Match Selection (New) */}
                    <select
                        value={filters.match_id}
                        onChange={(e) => handleFilterChange("match_id", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Match: All</option>
                        {stats?.matches.map(m => (
                            <option key={m.id} value={m.id}>
                                {m.id.replace(/_/g, ' ')} ({m.count})
                            </option>
                        ))}
                    </select>

                    {/* Winner */}
                    <select
                        value={filters.winner}
                        onChange={(e) => handleFilterChange("winner", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Point Winner: All</option>
                        {stats?.winners.map(w => (
                            <option key={w} value={w}>{w}</option>
                        ))}
                    </select>

                    {/* Server */}
                    <select
                        value={filters.serveur}
                        onChange={(e) => handleFilterChange("serveur", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Server: All</option>
                        {stats?.serveurs.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>

                    {/* Service Hand */}
                    <select
                        value={filters.service_lateralite}
                        onChange={(e) => handleFilterChange("service_lateralite", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Service Hand: All</option>
                        {stats?.service_lateralites.map(s => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                        ))}
                    </select>

                    {/* Service Zone */}
                    <select
                        value={filters.service_zone}
                        onChange={(e) => handleFilterChange("service_zone", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Service Zone: All</option>
                        {stats?.service_zones.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>

                    {/* Last Shot */}
                    <select
                        value={filters.winning_shot}
                        onChange={(e) => handleFilterChange("winning_shot", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Last Shot: All</option>
                        {stats?.winning_shots.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>

                    {/* Fault Type */}
                    <select
                        value={filters.faute_type}
                        onChange={(e) => handleFilterChange("faute_type", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">End Type: All</option>
                        <option value="pt_gagne">Point Gagnant</option>
                        {stats?.fautes.filter(f => f !== 'pt_gagne').map(f => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>

                    {/* Set */}
                    <select
                        value={filters.set_num}
                        onChange={(e) => handleFilterChange("set_num", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Set: All</option>
                        {[1, 2, 3, 4, 5, 6, 7].map(n => (
                            <option key={n} value={n}>Set {n}</option>
                        ))}
                    </select>

                    {/* Nb Coups Min */}
                    <input
                        type="number"
                        placeholder="Min shots"
                        value={filters.nb_coups_min}
                        onChange={(e) => handleFilterChange("nb_coups_min", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    />

                    {/* Nb Coups Max */}
                    <input
                        type="number"
                        placeholder="Max shots"
                        value={filters.nb_coups_max}
                        onChange={(e) => handleFilterChange("nb_coups_max", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    />
                </div>
            </form>

            {/* ES Offline Warning */}
            {esStatus === "disconnected" && (
                <div className="mb-8 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <p className="text-destructive text-sm">
                        ⚠️ Elasticsearch is not running. Start it with:
                    </p>
                    <code className="mt-2 block text-xs text-destructive/80 font-mono">
                        docker-compose up -d
                    </code>
                </div>
            )}

            {/* Message */}
            {message && (
                <div className="mb-8 p-4 bg-muted border border-border rounded-lg">
                    <p className="text-muted-foreground text-sm">{message}</p>
                </div>
            )}

            {/* Results count */}
            {total > 0 && (
                <p className="mb-4 text-sm text-muted-foreground">
                    Found {total} result{total !== 1 ? "s" : ""}
                </p>
            )}

            {/* Results Grid - Using grid for better visualization with thumbnails */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((result) => {
                    const videoSlug = getSlug(result.match_id);
                    const clipId = getClipId(result);
                    const backUrl = encodeURIComponent(getBackUrl());

                    return (
                        <Link
                            key={result.id}
                            href={`/watch/${videoSlug}?clip=${clipId}&backUrl=${backUrl}`}
                            className="group block bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all"
                        >
                            {/* Thumbnail */}
                            <div className="aspect-video bg-muted relative">
                                <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-0.5 rounded text-xs font-mono text-white">
                                    Set {result.set_num} | Pt {result.point_id}
                                </div>
                                <img
                                    src={`${API_URL}/api/videos/${videoSlug}/clips/${clipId}/thumbnail`}
                                    alt={`Point ${result.point_id}`}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                    onError={(e) => e.currentTarget.style.display = 'none'}
                                />
                                {/* Play icon overlay */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-primary/90 rounded-full p-3">
                                        <svg className="w-6 h-6 text-primary-foreground" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${result.winner === 'FAN-ZHENDONG' ? 'bg-blue-500/10 text-blue-500 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-red-500/10 text-red-500 dark:bg-red-900/40 dark:text-red-300'
                                        }`}>
                                        {result.winner}
                                    </span>
                                    <span className="text-muted-foreground text-xs text-right">
                                        {result.nb_coups} shots
                                    </span>
                                </div>

                                <div className="text-sm text-foreground mb-1">
                                    <span className="text-muted-foreground">Service:</span> {result.serveur}
                                </div>

                                {result.faute_type && (
                                    <div className="text-xs text-muted-foreground">
                                        {result.faute_type === 'pt_gagne' ? 'Winning point' : `Fault: ${result.faute_type}`}
                                    </div>
                                )}

                                {/* Display last shot if interesting */}
                                {result.dernier_coup && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Last shot: {result.dernier_coup}
                                    </div>
                                )}

                                {/* Score display if available */}
                                {(result.score_A !== undefined && result.score_B !== undefined) && (
                                    <div className="mt-2 text-xs font-mono text-muted-foreground border-t border-border pt-2 flex justify-between">
                                        <span>Score: {result.score_A} - {result.score_B}</span>
                                    </div>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Empty state */}
            {!loading && results.length === 0 && esStatus === "connected" && !message && (
                <div className="text-center py-16">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
                        <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <p className="text-muted-foreground">Enter a search query to find points</p>
                </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                        onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-sm rounded border border-input transition-colors"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {pages}
                    </span>
                    <button
                        onClick={() => handlePageChange(Math.min(pages, currentPage + 1))}
                        disabled={currentPage === pages}
                        className="px-3 py-1 bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-sm rounded border border-input transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </main>
    );
}

// Suspense wrapper is required when using useSearchParams in client component
export default function SearchPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-sm">Back</span>
                        </Link>
                        <div className="h-4 w-px bg-border" />
                        <h1 className="text-lg font-medium text-foreground">
                            Search Points
                        </h1>
                    </div>

                    <ThemeToggle />
                </div>
            </header>

            <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading search...</div>}>
                <SearchContent />
            </Suspense>
        </div>
    );
}
