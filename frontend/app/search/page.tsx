"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { loadFavorites, upsertFavorite, removeFavorite } from "@/lib/favorites";


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
    duree?: number;
    duree_secondes?: number;
    duree_frames?: number;
    description?: string;
    score_A?: number;
    score_B?: number;
    is_set_point?: boolean;
    is_point_gagnant?: boolean;
    similarity_score?: number;
    highlight_score?: number;
    [key: string]: any;
}

interface SearchResponse {
    points: SearchResult[];
    total: number;
    page: number;
    size: number;
    pages: number;
    mode?: string;
    message?: string;
    applied_filters?: Record<string, string | number>;
    applied_sort?: string;
    llm_explanation?: string | null;
    original_query?: string;
}

interface RecommendationResponse {
    total: number;
    recommendations: SearchResult[];
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
    duree?: { min: number; max: number; avg: number };
}

const API_URL = "http://localhost:8001";
type SearchMode = "semantic" | "highlights" | "llm";

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

    // Search mode state
    const [searchMode, setSearchMode] = useState<SearchMode>(
        searchParams.get("mode") === "llm"
            ? "llm"
            : searchParams.get("mode") === "highlights"
                ? "highlights"
                : "semantic"
    );
    const [sortOrder, setSortOrder] = useState<string>(searchParams.get("sort") || "chronological");
    const [semanticAvailable, setSemanticAvailable] = useState(false);
    const [llmAvailable, setLlmAvailable] = useState(false);
    const [recommendations, setRecommendations] = useState<SearchResult[]>([]);
    const [loadingRecommendations, setLoadingRecommendations] = useState(false);
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const [llmAppliedFilters, setLlmAppliedFilters] = useState<Record<string, string | number> | null>(null);
    const [llmExplanation, setLlmExplanation] = useState<string | null>(null);


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

    // Check ES status and semantic search availability
    useEffect(() => {
        fetch(`${API_URL}/api/search/status`)
            .then((res) => res.json())
            .then((data) => {
                const connected = data.elasticsearch.connected;
                setEsStatus(connected ? "connected" : "disconnected");
                setLlmAvailable(data.llm?.available === true);
            })
            .catch(() => {
                setEsStatus("disconnected");
                setLlmAvailable(false);
            });

        // Check semantic search availability
        fetch(`${API_URL}/api/semantic/status`)
            .then((res) => res.json())
            .then((data) => {
                setSemanticAvailable(data.available === true);
            })
            .catch(() => setSemanticAvailable(false));
    }, []);

    // Fetch recommendations based on current results
    const fetchRecommendations = useCallback(async (resultIds: string[]) => {
        if (!semanticAvailable || resultIds.length === 0) {
            setRecommendations([]);
            return;
        }

        setLoadingRecommendations(true);
        try {
            // Use first 5 results as reference
            const refIds = resultIds.slice(0, 5).join(",");
            const excludeIds = resultIds.join(",");

            const res = await fetch(
                `${API_URL}/api/semantic/similar?reference_ids=${refIds}&exclude_ids=${excludeIds}&k=6`
            );

            if (res.ok) {
                const data: RecommendationResponse = await res.json();
                setRecommendations(data.recommendations || []);
            }
        } catch (error) {
            console.warn("Failed to fetch recommendations", error);
        } finally {
            setLoadingRecommendations(false);
        }
    }, [semanticAvailable]);

    // Perform Search AND Stats based on URL params
    const performSearchAndStats = useCallback(async () => {
        if (esStatus === "disconnected") return;

        setLoading(true);
        setMessage(null);
        setRecommendations([]);
        setLlmAppliedFilters(null);
        setLlmExplanation(null);

        // Build params from URL (source of truth)
        const params = new URLSearchParams(searchParams.toString());
        if (!params.has("page")) params.set("page", "1");
        if (!params.has("size")) params.set("size", "20");
        if (searchMode !== "highlights") {
            params.set("sort", sortOrder);
        } else {
            params.delete("sort");
        }

        try {
            let searchData: SearchResponse;

            // Use semantic highlights endpoint if searchMode is highlights
            if (searchMode === "highlights" && semanticAvailable) {
                const highlightParams = new URLSearchParams();
                highlightParams.set("k", params.get("size") || "20");
                if (params.get("match_id")) highlightParams.set("match_id", params.get("match_id")!);
                if (params.get("winner")) highlightParams.set("winner", params.get("winner")!);
                if (params.get("serveur")) highlightParams.set("serveur", params.get("serveur")!);
                if (params.get("set_num")) highlightParams.set("set_num", params.get("set_num")!);

                const highlightRes = await fetch(`${API_URL}/api/semantic/highlights?${highlightParams.toString()}`);
                if (highlightRes.ok) {
                    const highlightData = await highlightRes.json();
                    searchData = {
                        points: highlightData.points || [],
                        total: highlightData.total || 0,
                        page: 1,
                        size: 20,
                        pages: 1
                    };
                } else {
                    throw new Error("Highlights API error");
                }
            } else if (searchMode === "llm" && params.get("q") && llmAvailable) {
                const llmRes = await fetch(`${API_URL}/api/search/llm-search?${params.toString()}`);
                if (!llmRes.ok) {
                    const errorText = await llmRes.text();
                    throw new Error(`LLM Search API error (${llmRes.status}): ${errorText}`);
                }
                searchData = await llmRes.json();
            } else if (searchMode === "semantic" && params.get("q") && semanticAvailable) {
                // Semantic Search for text query
                const semanticParams = new URLSearchParams();
                semanticParams.set("q", params.get("q")!);
                semanticParams.set("k", params.get("size") || "20");
                const filtersList = [
                    "match_id",
                    "winner",
                    "serveur",
                    "set_num",
                    "faute_type",
                    "winning_shot",
                    "service_lateralite",
                    "service_zone",
                    "nb_coups_min",
                    "nb_coups_max"
                ];
                filtersList.forEach(f => {
                    if (params.get(f)) semanticParams.set(f, params.get(f)!);
                });

                const semanticRes = await fetch(`${API_URL}/api/semantic/search?${semanticParams.toString()}`);
                if (!semanticRes.ok) {
                    throw new Error("Semantic Search API error");
                }
                searchData = await semanticRes.json();
            } else {
                // Standard search
                const searchRes = await fetch(`${API_URL}/api/search?${params.toString()}`);
                if (!searchRes.ok) {
                    const errorText = await searchRes.text();
                    throw new Error(`Search API error (${searchRes.status}): ${errorText}`);
                }
                searchData = await searchRes.json();
            }

            if (!searchData) {
                throw new Error("Search API returned null data");
            }

            setResults(searchData.points || []);
            setTotal(searchData.total || 0);
            setPages(searchData.pages || 0);
            if (searchData.message) setMessage(searchData.message);
            if (searchData.mode === "llm") {
                setLlmAppliedFilters(searchData.applied_filters || null);
                setLlmExplanation(searchData.llm_explanation || null);
            }

            // Save queue (for continuous play)
            if (searchData.points && searchData.points.length > 0 && typeof window !== "undefined") {
                const queue = searchData.points.map((p) => ({
                    videoSlug: getSlug(p.match_id),
                    clipId: getClipId(p)
                }));
                localStorage.setItem("pp_queue", JSON.stringify(queue));
            }

            // Fetch recommendations
            const hasFilters = searchData.mode === "llm"
                ? Boolean(searchData.applied_filters && Object.keys(searchData.applied_filters).length > 0)
                : Array.from(params.entries()).some(([key, val]) =>
                    !["page", "size", "mode"].includes(key) && val
                );

            if (hasFilters && searchData.points?.length > 0) {
                // Normal case: recommend similar to current results
                fetchRecommendations(searchData.points.map(p => p.id));
            } else if (hasFilters && searchData.points?.length === 0 && semanticAvailable) {
                // No results case: show highlights as suggestions
                setLoadingRecommendations(true);
                try {
                    const highlightRes = await fetch(`${API_URL}/api/semantic/highlights?k=6`);
                    if (highlightRes.ok) {
                        const highlightData = await highlightRes.json();
                        setRecommendations(highlightData.points || []);
                    }
                } catch (error) {
                    console.warn("Failed to fetch highlight suggestions", error);
                } finally {
                    setLoadingRecommendations(false);
                }
            }

            // 2. Fetch Stats with SAME params (for contextual filtering)
            const statsParams = new URLSearchParams();
            const statsSource =
                searchData.mode === "llm" && searchData.applied_filters
                    ? Object.entries(searchData.applied_filters)
                    : Array.from(params.entries()).filter(([key]) => !["page", "size", "mode", "sort", "q"].includes(key));

            statsSource.forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== "") {
                    statsParams.set(key, String(value));
                }
            });

            const statsRes = await fetch(`${API_URL}/api/search/stats?${statsParams.toString()}`);
            if (statsRes.ok) {
                const statsData: SearchStats = await statsRes.json();
                if (statsData) setStats(statsData);
            } else {
                console.warn("Stats API failed", statsRes.status);
            }

        } catch (error: any) {
            setMessage(`Error: ${error.message || "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    }, [searchParams, esStatus, searchMode, sortOrder, semanticAvailable, llmAvailable, fetchRecommendations]);

    // Effect to run search when URL params or sort mode change
    useEffect(() => {
        performSearchAndStats();
    }, [performSearchAndStats]);

    // Load favorites once
    useEffect(() => {
        if (typeof window === "undefined") return;
        const items = loadFavorites();
        setFavoriteIds(new Set(items.map((f) => f.id)));
    }, []);



    // Keep sortOrder in sync with URL (back/forward navigation)
    useEffect(() => {
        setSortOrder(searchParams.get("sort") || "chronological");
        setSearchMode(
            searchParams.get("mode") === "llm"
                ? "llm"
                : searchParams.get("mode") === "highlights"
                    ? "highlights"
                : "semantic"
        );
        setQuery(searchParams.get("q") || "");
        setFilters({
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
    }, [searchParams]);

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
        updateUrl({ q: query, sort: sortOrder, mode: searchMode, ...filters });
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



    const handleSortChange = (value: string) => {
        setSortOrder(value);
        updateUrl({ sort: value });
    };

    const handleModeChange = (value: SearchMode) => {
        setSearchMode(value);
        updateUrl({ mode: value });
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

    const getDurationFrames = (result: SearchResult) => {
        const duration = result.duree_frames ?? result.duree;
        return typeof duration === "number" ? duration : undefined;
    };

    const formatFilterLabel = (key: string) => {
        const labels: Record<string, string> = {
            match_id: "Match",
            player: "Joueur",
            winner: "Gagnant",
            serveur: "Serveur",
            set_num: "Set",
            nb_coups_min: "Coups min",
            nb_coups_max: "Coups max",
            duree_min: "Durée min",
            duree_max: "Durée max",
            effet: "Effet",
            lateralite: "Latéralité",
            faute_type: "Faute",
            winning_shot: "Dernier coup",
            winning_shot_status: "Type de point",
            zone: "Zone",
            service_zone: "Zone de service",
            service_lateralite: "Main de service",
        };
        return labels[key] || key;
    };

    const toggleFavorite = (result: SearchResult) => {
        const videoSlug = getSlug(result.match_id);
        const clipId = getClipId(result);
        const id = `${videoSlug}_${clipId}`;
        const item = {
            id,
            videoSlug,
            clipId,
            title: `Set ${result.set_num} · Point ${result.point_id}`,
            addedAt: Date.now(),
        };
        const updated = favoriteIds.has(id)
            ? removeFavorite(id)
            : upsertFavorite(item);
        setFavoriteIds(new Set(updated.map((f: any) => f.id)));
    };

    const buildDescription = (result: SearchResult) => {
        const parts: string[] = [];
        const durationFrames = getDurationFrames(result);
        if (result.set_num !== undefined && result.point_id !== undefined) {
            parts.push(`Set ${result.set_num} · Point ${result.point_id}`);
        }
        if (result.nb_coups !== undefined) {
            parts.push(`${result.nb_coups} coups`);
        }
        if (durationFrames !== undefined) {
            const sec = Math.max(1, Math.round(durationFrames / 25));
            parts.push(`~${sec}s`);
        }
        if (result.serveur) {
            parts.push(`Service ${result.serveur}${result.service_zone ? ` (${result.service_zone})` : ""}${result.service_lateralite ? ` main ${result.service_lateralite.replace("_", " ")}` : ""}`);
        }
        if (result.winner) {
            parts.push(`Point remporté par ${result.winner}${result.is_point_gagnant ? " (gagnant direct)" : ""}`);
        }
        if (result.faute_type && result.faute_type !== "pt_gagne") {
            parts.push(`Fin sur faute : ${result.faute_type}`);
        }
        if (result.dernier_coup) {
            parts.push(`Dernier coup : ${result.dernier_coup}`);
        }
        return parts.join(". ") + ".";
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
                    <Link
                        href="/favorites"
                        className="px-4 py-3 border border-input rounded-lg text-sm text-foreground bg-card hover:bg-muted transition-colors"
                    >
                        Favoris
                    </Link>
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

                {/* Sort selector */}
                <div className="flex flex-wrap items-center gap-3 mt-2">
                    <label className="text-sm text-muted-foreground">Trier les résultats :</label>
                    <select
                        value={sortOrder}
                        onChange={(e) => handleSortChange(e.target.value)}
                        disabled={searchMode === "highlights"}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                    >
                        <option value="chronological">Chronologique</option>
                        <option value="longest">Plus long</option>
                        <option value="shortest">Plus court</option>
                        <option value="most_shots">Plus de coups</option>
                        <option value="least_shots">Moins de coups</option>
                        <option value="winners">Points gagnants en premier</option>
                        <option value="errors">Fautes adverses en premier</option>
                    </select>
                    {searchMode === "highlights" && (
                        <span className="text-xs text-amber-500">
                            Tri désactivé en mode Highlights
                        </span>
                    )}
                </div>

                {/* Sort Mode Selector */}
                {(semanticAvailable || llmAvailable) && (
                    <div className="flex items-center gap-4 mt-3">
                        <span className="text-sm text-muted-foreground">Mode :</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => handleModeChange("semantic")}
                                disabled={!semanticAvailable}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${searchMode === "semantic"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-card border border-input text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                Semantic
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeChange("llm")}
                                disabled={!llmAvailable}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${searchMode === "llm"
                                    ? "bg-emerald-600 text-white"
                                    : "bg-card border border-input text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                LLM Filters
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeChange("highlights")}
                                disabled={!semanticAvailable}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${searchMode === "highlights"
                                    ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white"
                                    : "bg-card border border-input text-muted-foreground hover:text-foreground"
                                    }`}
                            >
                                Highlights
                            </button>
                        </div>
                        {searchMode === "semantic" && (
                            <span className="text-xs text-muted-foreground">
                                Recherche par embeddings
                            </span>
                        )}
                        {searchMode === "llm" && (
                            <span className="text-xs text-emerald-400">
                                Le LLM transforme ta requete en filtres deterministes
                            </span>
                        )}
                        {searchMode === "highlights" && (
                            <span className="text-xs text-amber-500">
                                Points gagnants avec longs échanges
                            </span>
                        )}
                    </div>
                )}
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

            {searchMode === "llm" && llmAppliedFilters && Object.keys(llmAppliedFilters).length > 0 && (
                <div className="mb-6 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-emerald-300">Filtres interprétés</span>
                        {Object.entries(llmAppliedFilters).map(([key, value]) => (
                            <span
                                key={key}
                                className="px-2 py-1 rounded-full text-xs border border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            >
                                {formatFilterLabel(key)}: {String(value)}
                            </span>
                        ))}
                    </div>
                    {llmExplanation && (
                        <p className="text-xs text-emerald-100/80">{llmExplanation}</p>
                    )}
                </div>
            )}

            {/* Results count */}
            {total > 0 && (
                <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
                    <p>
                        Found {total} result{total !== 1 ? "s" : ""}
                    </p>
                    <Link
                        href={
                            results.length > 0
                                ? `/watch/${getSlug(results[0].match_id)}?clip=${getClipId(results[0])}&queue=1&backUrl=${encodeURIComponent(getBackUrl())}`
                                : "#"
                        }
                        className="px-3 py-1 rounded-md border border-input bg-card text-foreground hover:bg-muted transition-colors"
                    >
                        Lecture continue
                    </Link>
                </div>
            )}

            {/* Results Grid - Using grid for better visualization with thumbnails */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8">
                {results.map((result) => {
                    const videoSlug = getSlug(result.match_id);
                    const clipId = getClipId(result);
                    const durationFrames = getDurationFrames(result);
                    const backUrl = encodeURIComponent(getBackUrl());
                    const favId = `${videoSlug}_${clipId}`;
                    const isFav = favoriteIds.has(favId);

                    return (
                        <div key={result.id} className="group block">
                            <Link
                                href={`/watch/${videoSlug}?clip=${clipId}&backUrl=${backUrl}`}
                                className="block"
                            >
                                {/* Thumbnail - clean */}
                                <div className="aspect-video overflow-hidden rounded-xl">
                                    <img
                                        src={`${API_URL}/api/videos/${videoSlug}/clips/${clipId}/thumbnail`}
                                        alt={`Point ${result.point_id}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => e.currentTarget.style.display = 'none'}
                                    />
                                </div>

                                {/* Info - YouTube style with Roboto */}
                                <div className="pt-3 pb-4 px-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span
                                            className="text-xs font-medium"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                color: '#f5f5f7',
                                            }}
                                        >
                                            {result.winner}
                                        </span>
                                        <span
                                            className="text-xs"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                color: '#aaaaaa',
                                            }}
                                        >
                                            {result.nb_coups} shots
                                            {durationFrames ? ` • ~${Math.round(durationFrames / 25)}s` : ""}
                                        </span>
                                    </div>

                                    <div
                                        className="text-sm mb-1"
                                        style={{
                                            fontFamily: "'Roboto', Arial, sans-serif",
                                            color: '#f5f5f7',
                                        }}
                                    >
                                        <span style={{ color: '#aaaaaa' }}>Service:</span> <span style={{ fontWeight: 500 }}>{result.serveur}</span>
                                    </div>

                                    {result.faute_type && (
                                        <div
                                            className="text-xs"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                color: '#aaaaaa',
                                            }}
                                        >
                                            {result.faute_type === 'pt_gagne' ? 'Winning point' : `Fault: ${result.faute_type}`}
                                        </div>
                                    )}

                                    {/* Display last shot if interesting */}
                                    {result.dernier_coup && (
                                        <div
                                            className="text-xs mt-1"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                color: '#aaaaaa',
                                            }}
                                        >
                                            Last shot: {result.dernier_coup}
                                        </div>
                                    )}

                                    {/* Score display if available */}
                                    {(result.score_A !== undefined && result.score_B !== undefined) && (
                                        <div
                                            className="mt-2 text-xs pt-2 flex justify-between"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                borderTop: '1px solid #3a3a3c',
                                                color: '#aaaaaa',
                                            }}
                                        >
                                            <span>Score: {result.score_A} - {result.score_B}</span>
                                        </div>
                                    )}

                                </div>
                            </Link>
                            <div className="mt-1 flex justify-end">
                                <button
                                    onClick={() => toggleFavorite(result)}
                                    className={`px-3 py-1 text-sm rounded-full border transition-colors flex items-center justify-center ${isFav
                                        ? "border-amber-400 bg-amber-400/20 text-amber-300"
                                        : "border-input bg-card text-foreground hover:bg-muted"
                                        }`}
                                >
                                    <span style={{ color: isFav ? '#fbbf24' : '#f5f5f7', fontSize: '14px' }}>
                                        {isFav ? "♥" : "♡"}
                                    </span>
                                </button>
                            </div>
                        </div>
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

            {/* Recommendations Section */}
            {recommendations.length > 0 && (
                <div className={`mt-12 ${results.length > 0 ? 'border-t border-border pt-8' : ''}`}>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-8 w-1 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full"></div>
                        <h2 className="text-xl font-semibold text-foreground">
                            {results.length === 0
                                ? "Découvrez nos meilleurs points"
                                : "Vous pourriez aussi aimer..."}
                        </h2>
                        <span className="text-sm text-muted-foreground">
                            ({recommendations.length} {results.length === 0 ? "highlights" : "points similaires"})
                        </span>
                    </div>

                    {loadingRecommendations ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {recommendations.map((rec) => {
                                const videoSlug = getSlug(rec.match_id);
                                const clipId = getClipId(rec);
                                const durationFrames = getDurationFrames(rec);
                                return (
                                    <Link
                                        key={rec.id}
                                        href={`/watch/${videoSlug}?clip=${clipId}&backUrl=${encodeURIComponent(getBackUrl())}`}
                                        className="group bg-card rounded-lg overflow-hidden border-2 border-amber-500/30 hover:border-amber-500 transition-all hover:shadow-lg hover:shadow-amber-500/10"
                                    >
                                        {/* Thumbnail */}
                                        <div className="aspect-video bg-muted relative">
                                            <div className="absolute top-2 left-2 z-10 bg-black/60 px-2 py-0.5 rounded text-xs font-mono text-white">
                                                Set {rec.set_num} | Pt {rec.point_id}
                                            </div>
                                            <div className="absolute top-2 right-2 z-10">
                                                <span className="bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 rounded text-xs font-medium text-white">
                                                    Similaire
                                                </span>
                                            </div>
                                            <img
                                                src={`${API_URL}/api/videos/${videoSlug}/clips/${clipId}/thumbnail`}
                                                alt={`Point ${rec.point_id}`}
                                                className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                                onError={(e) => e.currentTarget.style.display = 'none'}
                                            />
                                        </div>

                                        {/* Info */}
                                        <div className="p-3">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${rec.winner === 'FAN-ZHENDONG' ? 'bg-blue-500/10 text-blue-500' : 'bg-red-500/10 text-red-500'
                                                    }`}>
                                                    {rec.winner}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {rec.nb_coups} shots
                                                    {durationFrames ? ` • ~${Math.round(durationFrames / 25)}s` : ""}
                                                </span>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            )
            }

            {/* Pagination */}
            {
                pages > 1 && (
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
                )
            }
        </main >
    );
}

// Suspense wrapper is required when using useSearchParams in client component
export default function SearchPage() {
    return (
        <div
            className="min-h-screen"
            style={{
                background: '#1c1c1e',
                color: '#f5f5f7',
            }}
        >
            {/* Header - Glassmorphism */}
            <header
                className="sticky top-0 z-50"
                style={{
                    background: 'rgba(44, 44, 46, 0.8)',
                    backdropFilter: 'blur(15px)',
                    WebkitBackdropFilter: 'blur(15px)',
                    borderBottom: '1px solid #3a3a3c',
                }}
            >
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 transition-colors"
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
                            >Back</span>
                        </Link>
                        <div
                            className="h-4 w-px"
                            style={{ background: '#3a3a3c' }}
                        />
                        <h1
                            className="text-lg font-medium"
                            style={{
                                fontFamily: "'Playfair Display', Georgia, serif",
                                color: '#f5f5f7',
                                letterSpacing: '-0.02em',
                            }}
                        >
                            Search Points
                        </h1>
                    </div>

                    <ThemeToggle />
                </div>
            </header>

            <Suspense fallback={
                <div
                    className="p-8 text-center"
                    style={{ color: '#86868b', fontFamily: "'Inter', sans-serif" }}
                >
                    Loading search...
                </div>
            }>
                <SearchContent />
            </Suspense>
        </div>
    );
}
