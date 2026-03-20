"use client";

import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { API_URL } from "@/lib/api";
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
    clip_path?: string;
    winner?: string;
    serveur?: string;
    faute_type?: string;
    dernier_coup?: string;
    service_zone?: string;
    service_lateralite?: string;
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
    [key: string]: string | number | boolean | null | undefined;
}

interface SearchResponse {
    points: SearchResult[];
    total: number;
    page: number;
    size: number;
    pages: number;
    mode?: string;
    message?: string;
    llm_provider?: string;
    parsed_filters?: Record<string, string | number>;
    explicit_filters?: Record<string, string | number>;
    applied_filters?: Record<string, string | number>;
    filter_changes?: Array<{
        key: string;
        label: string;
        value?: string | number | null;
        previous_value?: string | number | null;
        change_type: string;
    }>;
    applied_sort?: string;
    llm_explanation?: string | null;
    original_query?: string;
}

interface RecommendationResponse {
    total: number;
    recommendations: SearchResult[];
}

interface SuggestionResponse {
    query: string;
    suggestions: string[];
}

interface SearchStats {
    total_points: number;
    matches: { id: string; count: number }[];
    players: string[];
    winners: string[];
    serveurs: string[];
    sets: number[];
    fautes: string[];
    winning_shots: string[];
    service_zones: string[];
    service_lateralites: string[];
    nb_coups: { min: number; max: number; avg: number };
    duree?: { min: number; max: number; avg: number };
}

type SearchMode = "semantic" | "highlights" | "llm";
const FILTER_KEYS = [
    "match_id",
    "player",
    "set_num",
    "winner",
    "serveur",
    "faute_type",
    "winning_shot",
    "winning_shot_status",
    "service_lateralite",
    "service_zone",
    "nb_coups_min",
    "nb_coups_max"
] as const;
type FilterKey = typeof FILTER_KEYS[number];
type FiltersState = Record<FilterKey, string>;
const HIGHLIGHT_WEIGHT_FIELDS = [
    { key: "duration_weight", label: "Duree reelle", defaultValue: 35, description: "duree_secondes" },
    { key: "rally_depth_weight", label: "Profondeur du rallye", defaultValue: 15, description: "nb_coups" },
    { key: "effects_variety_weight", label: "Variete des effets", defaultValue: 15, description: "sequence_effets" },
    { key: "laterality_variety_weight", label: "Variete des lateralites", defaultValue: 10, description: "sequence_lateralites" },
    { key: "zone_variety_weight", label: "Variete des zones", defaultValue: 10, description: "sequence_zones" },
    { key: "finish_weight", label: "Fin de point", defaultValue: 10, description: "pt_gagne + dernier coup" },
    { key: "pressure_weight", label: "Pression du score", defaultValue: 5, description: "score serre / balle de set" }
] as const;
type HighlightWeightKey = typeof HIGHLIGHT_WEIGHT_FIELDS[number]["key"];
type HighlightWeightsState = Record<HighlightWeightKey, string>;
type SearchParamsLike = { get: (key: string) => string | null };
const HIGHLIGHT_WEIGHT_KEYS = HIGHLIGHT_WEIGHT_FIELDS.map((field) => field.key);

const getDefaultHighlightWeights = (): HighlightWeightsState => ({
    duration_weight: "35",
    rally_depth_weight: "15",
    effects_variety_weight: "15",
    laterality_variety_weight: "10",
    zone_variety_weight: "10",
    finish_weight: "10",
    pressure_weight: "5"
});

const readHighlightWeightsFromParams = (params: SearchParamsLike): HighlightWeightsState => {
    const defaults = getDefaultHighlightWeights();

    HIGHLIGHT_WEIGHT_FIELDS.forEach((field) => {
        const value = params.get(field.key);
        if (value !== null && value.trim() !== "") {
            defaults[field.key] = value;
        }
    });

    return defaults;
};

const sanitizeHighlightWeights = (weights: HighlightWeightsState): HighlightWeightsState => {
    const sanitized = getDefaultHighlightWeights();

    HIGHLIGHT_WEIGHT_FIELDS.forEach((field) => {
        const rawValue = weights[field.key].trim();
        const parsedValue = Number.parseFloat(rawValue);
        sanitized[field.key] = Number.isFinite(parsedValue) && parsedValue >= 0
            ? String(parsedValue)
            : String(field.defaultValue);
    });

    return sanitized;
};

const buildHighlightWeightUrlParams = (weights: HighlightWeightsState): Record<string, string> => {
    const sanitized = sanitizeHighlightWeights(weights);
    const urlParams: Record<string, string> = {};

    HIGHLIGHT_WEIGHT_FIELDS.forEach((field) => {
        urlParams[field.key] = sanitized[field.key] === String(field.defaultValue) ? "" : sanitized[field.key];
    });

    return urlParams;
};

const getHighlightWeightTotal = (weights: HighlightWeightsState): number => (
    HIGHLIGHT_WEIGHT_FIELDS.reduce((sum, field) => {
        const parsedValue = Number.parseFloat(weights[field.key]);
        return sum + (Number.isFinite(parsedValue) ? parsedValue : 0);
    }, 0)
);

const hasCustomHighlightWeights = (weights: HighlightWeightsState): boolean => (
    HIGHLIGHT_WEIGHT_FIELDS.some((field) => {
        const parsedValue = Number.parseFloat(weights[field.key]);
        const currentValue = Number.isFinite(parsedValue) ? parsedValue : field.defaultValue;
        return Math.abs(currentValue - field.defaultValue) > 1e-6;
    })
);

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
    const [showHighlightSettings, setShowHighlightSettings] = useState(false);
    const [highlightWeights, setHighlightWeights] = useState<HighlightWeightsState>(
        readHighlightWeightsFromParams(searchParams)
    );
    const [highlightWeightDraft, setHighlightWeightDraft] = useState<HighlightWeightsState>(
        readHighlightWeightsFromParams(searchParams)
    );
    const [recommendations, setRecommendations] = useState<SearchResult[]>([]);
    const [loadingRecommendations, setLoadingRecommendations] = useState(false);
    const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
    const [llmAppliedFilters, setLlmAppliedFilters] = useState<Record<string, string | number> | null>(null);
    const [llmParsedFilters, setLlmParsedFilters] = useState<Record<string, string | number> | null>(null);
    const [llmFilterChanges, setLlmFilterChanges] = useState<SearchResponse["filter_changes"]>([]);
    const [llmExplanation, setLlmExplanation] = useState<string | null>(null);
    const [llmProvider, setLlmProvider] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const suggestionBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    // Filters state
    const [filters, setFilters] = useState<FiltersState>({
        match_id: searchParams.get("match_id") || "",
        player: searchParams.get("player") || "",
        set_num: searchParams.get("set_num") || "",
        winner: searchParams.get("winner") || "",
        serveur: searchParams.get("serveur") || "",
        faute_type: searchParams.get("faute_type") || "",
        winning_shot: searchParams.get("winning_shot") || "",
        winning_shot_status: searchParams.get("winning_shot_status") || "",
        service_lateralite: searchParams.get("service_lateralite") || "",
        service_zone: searchParams.get("service_zone") || "",
        nb_coups_min: searchParams.get("nb_coups_min") || "",
        nb_coups_max: searchParams.get("nb_coups_max") || ""
    });

    // Current page from URL
    const currentPage = Number(searchParams.get("page")) || 1;
    const highlightWeightTotal = getHighlightWeightTotal(highlightWeightDraft);
    const hasCustomHighlightProfile = hasCustomHighlightWeights(highlightWeights);

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

    const syncLlmFiltersToUrl = useCallback((applied: Record<string, string | number>) => {
        const params = new URLSearchParams(searchParams.toString());
        let changed = false;

        FILTER_KEYS.forEach((key) => {
            const nextValue = applied[key];
            const normalizedValue = nextValue === undefined || nextValue === null ? "" : String(nextValue);
            const currentValue = params.get(key) || "";

            if (normalizedValue) {
                if (currentValue !== normalizedValue) {
                    params.set(key, normalizedValue);
                    changed = true;
                }
            } else if (currentValue) {
                params.delete(key);
                changed = true;
            }
        });

        if (changed) {
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [pathname, router, searchParams]);

    // Perform Search AND Stats based on URL params
    const performSearchAndStats = useCallback(async () => {
        if (esStatus === "disconnected") return;

        setLoading(true);
        setMessage(null);
        setRecommendations([]);
        setLlmAppliedFilters(null);
        setLlmParsedFilters(null);
        setLlmFilterChanges([]);
        setLlmExplanation(null);
        setLlmProvider(null);

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
                HIGHLIGHT_WEIGHT_FIELDS.forEach((field) => {
                    if (params.get(field.key)) {
                        highlightParams.set(field.key, params.get(field.key)!);
                    }
                });

                const highlightRes = await fetch(`${API_URL}/api/semantic/highlights?${highlightParams.toString()}`);
                if (highlightRes.ok) {
                    const highlightData = await highlightRes.json();
                    searchData = {
                        mode: highlightData.mode || "highlights",
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
                setLlmParsedFilters(searchData.parsed_filters || null);
                setLlmFilterChanges(searchData.filter_changes || []);
                setLlmExplanation(searchData.llm_explanation || null);
                setLlmProvider(searchData.llm_provider || null);
                if (searchData.applied_filters) {
                    syncLlmFiltersToUrl(searchData.applied_filters);
                }
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
                    !["page", "size", "mode", ...HIGHLIGHT_WEIGHT_KEYS].includes(key) && val
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
                    : Array.from(params.entries()).filter(([key]) => !["page", "size", "mode", "sort", "q", ...HIGHLIGHT_WEIGHT_KEYS].includes(key));

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

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            setMessage(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    }, [searchParams, esStatus, searchMode, sortOrder, semanticAvailable, llmAvailable, fetchRecommendations, syncLlmFiltersToUrl]);

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
        const nextHighlightWeights = readHighlightWeightsFromParams(searchParams);
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
            player: searchParams.get("player") || "",
            set_num: searchParams.get("set_num") || "",
            winner: searchParams.get("winner") || "",
            serveur: searchParams.get("serveur") || "",
            faute_type: searchParams.get("faute_type") || "",
            winning_shot: searchParams.get("winning_shot") || "",
            winning_shot_status: searchParams.get("winning_shot_status") || "",
            service_lateralite: searchParams.get("service_lateralite") || "",
            service_zone: searchParams.get("service_zone") || "",
            nb_coups_min: searchParams.get("nb_coups_min") || "",
            nb_coups_max: searchParams.get("nb_coups_max") || ""
        });
        setHighlightWeights(nextHighlightWeights);
        setHighlightWeightDraft(nextHighlightWeights);
    }, [searchParams]);

    useEffect(() => {
        if (suggestionBlurTimeoutRef.current) {
            clearTimeout(suggestionBlurTimeoutRef.current);
        }

        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2 || esStatus !== "connected") {
            setSuggestions([]);
            setShowSuggestions(false);
            setLoadingSuggestions(false);
            setActiveSuggestionIndex(-1);
            return;
        }

        const timeoutId = setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const params = new URLSearchParams({
                    q: trimmedQuery,
                    limit: "8"
                });
                const res = await fetch(`${API_URL}/api/search/suggestions?${params.toString()}`);
                if (!res.ok) {
                    throw new Error("Suggestions API error");
                }

                const data: SuggestionResponse = await res.json();
                const nextSuggestions = data.suggestions || [];
                setSuggestions(nextSuggestions);
                setShowSuggestions(nextSuggestions.length > 0);
                setActiveSuggestionIndex(-1);
            } catch (error) {
                console.warn("Failed to fetch suggestions", error);
                setSuggestions([]);
                setShowSuggestions(false);
            } finally {
                setLoadingSuggestions(false);
            }
        }, 220);

        return () => clearTimeout(timeoutId);
    }, [query, esStatus]);

    useEffect(() => {
        if (searchMode !== "llm" || !llmAppliedFilters) {
            return;
        }

        setFilters((currentFilters) => {
            const nextFilters: FiltersState = { ...currentFilters };
            let hasChanged = false;

            FILTER_KEYS.forEach((key) => {
                const nextValue = llmAppliedFilters[key];
                const normalizedValue = nextValue === undefined || nextValue === null ? "" : String(nextValue);
                if (nextFilters[key] !== normalizedValue) {
                    nextFilters[key] = normalizedValue;
                    hasChanged = true;
                }
            });

            return hasChanged ? nextFilters : currentFilters;
        });
    }, [searchMode, llmAppliedFilters]);

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
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        const nextParams = searchMode === "llm"
            ? Object.fromEntries(FILTER_KEYS.map((key) => [key, ""]))
            : filters;
        updateUrl({ q: query, sort: sortOrder, mode: searchMode, ...nextParams });
    };

    const submitSuggestion = (suggestion: string) => {
        setQuery(suggestion);
        setShowSuggestions(false);
        setActiveSuggestionIndex(-1);
        const nextParams = searchMode === "llm"
            ? Object.fromEntries(FILTER_KEYS.map((key) => [key, ""]))
            : filters;
        updateUrl({ q: suggestion, sort: sortOrder, mode: searchMode, ...nextParams });
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

    const handleHighlightWeightChange = (key: HighlightWeightKey, value: string) => {
        setHighlightWeightDraft((currentWeights) => ({
            ...currentWeights,
            [key]: value
        }));
    };

    const handleApplyHighlightWeights = () => {
        const nextWeights = sanitizeHighlightWeights(highlightWeightDraft);
        setHighlightWeights(nextWeights);
        setHighlightWeightDraft(nextWeights);
        setShowHighlightSettings(false);
        updateUrl(buildHighlightWeightUrlParams(nextWeights));
    };

    const handleResetHighlightWeights = () => {
        const defaultWeights = getDefaultHighlightWeights();
        setHighlightWeights(defaultWeights);
        setHighlightWeightDraft(defaultWeights);
        updateUrl(buildHighlightWeightUrlParams(defaultWeights));
    };

    const handleModeChange = (value: SearchMode) => {
        setSearchMode(value);
        if (value !== "highlights") {
            setShowHighlightSettings(false);
        }
        // Clear LLM-specific state when leaving LLM mode
        const extraResets: Record<string, string> = { mode: value };
        if (value !== "llm") {
            setLlmAppliedFilters(null);
            setLlmParsedFilters(null);
            setLlmFilterChanges([]);
            setLlmExplanation(null);
            setLlmProvider(null);
        }
        updateUrl(extraResets);
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

    const formatFilterValue = (key: string, value: string | number | null | undefined) => {
        if (value === null || value === undefined || value === "") return "aucune valeur";
        if ((key === "service_lateralite" || key === "lateralite") && typeof value === "string") {
            return value.replace("_", " ");
        }
        return String(value);
    };

    const getFilterChangeText = (change: NonNullable<SearchResponse["filter_changes"]>[number]) => {
        const currentValue = formatFilterValue(change.key, change.value);
        const previousValue = formatFilterValue(change.key, change.previous_value);

        if (change.change_type === "added_by_llm") {
            return `${change.label}: ${currentValue} ajoute par le LLM`;
        }
        if (change.change_type === "confirmed_by_user") {
            return `${change.label}: ${currentValue} confirme`;
        }
        if (change.change_type === "overridden_by_user") {
            return `${change.label}: ${previousValue} propose par le LLM, remplace par ${currentValue}`;
        }
        return `${change.label}: ${currentValue}`;
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
        setFavoriteIds(new Set(updated.map((f: { id: string }) => f.id)));
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
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onFocus={() => {
                                if (suggestions.length > 0) setShowSuggestions(true);
                            }}
                            onBlur={() => {
                                suggestionBlurTimeoutRef.current = setTimeout(() => {
                                    setShowSuggestions(false);
                                    setActiveSuggestionIndex(-1);
                                }, 120);
                            }}
                            onKeyDown={(e) => {
                                if (!showSuggestions || suggestions.length === 0) {
                                    return;
                                }

                                if (e.key === "ArrowDown") {
                                    e.preventDefault();
                                    setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
                                    return;
                                }

                                if (e.key === "ArrowUp") {
                                    e.preventDefault();
                                    setActiveSuggestionIndex((prev) => (
                                        prev <= 0 ? suggestions.length - 1 : prev - 1
                                    ));
                                    return;
                                }

                                if (e.key === "Enter" && activeSuggestionIndex >= 0) {
                                    e.preventDefault();
                                    submitSuggestion(suggestions[activeSuggestionIndex]);
                                    return;
                                }

                                if (e.key === "Escape") {
                                    setShowSuggestions(false);
                                    setActiveSuggestionIndex(-1);
                                }
                            }}
                            placeholder="Recherche sémantique... ex: topspin winner, long rally"
                            className="w-full px-4 py-3 bg-card border border-input rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors"
                        />
                        {showSuggestions && (suggestions.length > 0 || loadingSuggestions) && (
                            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-xl border border-input bg-[#2c2c2e] shadow-2xl">
                                {loadingSuggestions && (
                                    <div className="px-4 py-3 text-sm text-[#aaaaaa]">
                                        Suggestions...
                                    </div>
                                )}
                                {suggestions.map((suggestion, index) => (
                                    <button
                                        key={`${suggestion}-${index}`}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => submitSuggestion(suggestion)}
                                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors"
                                        style={{
                                            background: index === activeSuggestionIndex ? "#3a3a3c" : "transparent",
                                            color: "#f5f5f7",
                                            fontFamily: "'Roboto', Arial, sans-serif",
                                        }}
                                    >
                                        <span>{suggestion}</span>
                                        <span className="text-xs" style={{ color: "#86868b" }}>
                                            suggestion
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
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

                    <select
                        value={filters.player}
                        onChange={(e) => handleFilterChange("player", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Joueur: Tous</option>
                        {stats?.players.map((player) => (
                            <option key={player} value={player}>{player}</option>
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

                    <select
                        value={filters.winning_shot_status}
                        onChange={(e) => handleFilterChange("winning_shot_status", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Type de point: Tous</option>
                        <option value="winner">Point gagnant</option>
                        <option value="error">Faute adverse</option>
                    </select>

                    {/* Set */}
                    <select
                        value={filters.set_num}
                        onChange={(e) => handleFilterChange("set_num", e.target.value)}
                        className="px-3 py-2 bg-card border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    >
                        <option value="">Set: All</option>
                        {(stats?.sets?.length ? stats.sets : [1, 2, 3, 4, 5, 6, 7]).map(n => (
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
                            <span className="text-xs text-muted-foreground">
                                Les filtres de l&apos;interface sont renseignes automatiquement par le LLM.
                            </span>
                        )}
                        {searchMode === "highlights" && (
                            <span className="text-xs text-amber-500">
                                Points gagnants avec longs échanges
                            </span>
                        )}
                    </div>
                )}

                {searchMode === "highlights" && (
                    <div className="rounded-xl border border-amber-500/30 bg-[color-mix(in_srgb,var(--card)_92%,#f59e0b_8%)]">
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div>
                                <div className="text-sm font-medium text-foreground">
                                    Ponderations des highlights
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Valeurs par defaut: 35/15/15/10/10/10/5
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {hasCustomHighlightProfile && (
                                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-200">
                                        Profil personnalise
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setShowHighlightSettings((currentValue) => !currentValue)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-card px-3 py-2 text-sm text-amber-700 transition-colors hover:border-amber-500/50 hover:text-amber-800 dark:text-amber-100 dark:hover:text-white"
                                >
                                    <SlidersHorizontal className="h-4 w-4" />
                                    Parametres
                                </button>
                            </div>
                        </div>

                        {showHighlightSettings && (
                            <div className="border-t border-amber-500/20 px-4 py-4">
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    {HIGHLIGHT_WEIGHT_FIELDS.map((field) => (
                                        <label
                                            key={field.key}
                                            className="rounded-lg border border-amber-500/20 bg-[color-mix(in_srgb,var(--card)_90%,#f59e0b_10%)] p-3"
                                        >
                                            <span className="mb-1 block text-sm font-medium text-foreground">
                                                {field.label}
                                            </span>
                                            <span className="mb-2 block text-xs text-muted-foreground">
                                                {field.description}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.5"
                                                    value={highlightWeightDraft[field.key]}
                                                    onChange={(e) => handleHighlightWeightChange(field.key, e.target.value)}
                                                    className="w-full rounded-lg border border-amber-400/20 bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:border-amber-400"
                                                />
                                                <span className="text-sm text-muted-foreground">%</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-xs text-muted-foreground">
                                        Total actuel: {highlightWeightTotal % 1 === 0 ? highlightWeightTotal.toFixed(0) : highlightWeightTotal.toFixed(1)}%.
                                        {" "}Le backend renormalise automatiquement si le total n&apos;est pas a 100%.
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleResetHighlightWeights}
                                            className="rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-700 transition-colors hover:border-amber-500/50 hover:text-amber-800 dark:text-amber-100 dark:hover:text-white"
                                        >
                                            Reinitialiser
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleApplyHighlightWeights}
                                            className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                                        >
                                            Appliquer
                                        </button>
                                    </div>
                                </div>
                            </div>
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

            {searchMode === "llm" && ((llmAppliedFilters && Object.keys(llmAppliedFilters).length > 0) || llmExplanation) && (
                <div className="mb-6 rounded-xl border border-emerald-500/30 bg-[color-mix(in_srgb,var(--card)_92%,#10b981_8%)] overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-emerald-500/20">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">🤖</span>
                            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">Interprétation LLM</span>
                        </div>
                        {llmProvider && (
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                                OpenAI · {llmProvider}
                            </span>
                        )}
                    </div>

                    <div className="px-4 py-3 space-y-3">
                        {/* LLM Explanation */}
                        {llmExplanation && (
                            <p className="text-sm text-foreground/80 italic">
                                &ldquo;{llmExplanation}&rdquo;
                            </p>
                        )}

                        {/* Applied filter chips */}
                        {llmAppliedFilters && Object.keys(llmAppliedFilters).length > 0 && (
                            <div>
                                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Filtres appliqués</div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {Object.entries(llmAppliedFilters).map(([key, value]) => (
                                        <span
                                            key={key}
                                            className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-200"
                                        >
                                            <span className="text-emerald-500/70 dark:text-emerald-400/60">{formatFilterLabel(key)}:</span>
                                            {formatFilterValue(key, value)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Filter changes (added/overridden by LLM or user) */}
                        {llmFilterChanges && llmFilterChanges.length > 0 && (
                            <div>
                                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Changements</div>
                                <div className="flex flex-col gap-1">
                                    {llmFilterChanges.map((change) => (
                                        <div
                                            key={`${change.key}-${change.change_type}-${String(change.value)}`}
                                            className="flex items-center gap-2 text-xs text-foreground/70"
                                        >
                                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                                                change.change_type === "added_by_llm"
                                                    ? "bg-emerald-500"
                                                    : change.change_type === "overridden_by_user"
                                                        ? "bg-amber-500"
                                                        : "bg-blue-500"
                                            }`} />
                                            {getFilterChangeText(change)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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
                        <div key={result.id} className="group block rounded-2xl border border-border bg-card/70 p-3 shadow-sm transition-colors hover:bg-card">
                            <Link
                                href={`/watch/${videoSlug}?clip=${clipId}&backUrl=${backUrl}`}
                                className="block"
                            >
                                {/* Thumbnail - clean */}
                                <div className="aspect-video overflow-hidden rounded-xl border border-border/60">
                                    <img
                                        src={`${API_URL}/api/videos/${videoSlug}/clips/${clipId}/thumbnail`}
                                        alt={`Point ${result.point_id}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => e.currentTarget.style.display = 'none'}
                                    />
                                </div>

                                {/* Info - YouTube style with Roboto */}
                                <div className="pt-3 pb-2 px-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span
                                            className="text-xs font-medium"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                color: 'var(--foreground)',
                                            }}
                                        >
                                            {result.winner}
                                        </span>
                                        <span
                                            className="text-xs"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                color: 'var(--muted-foreground)',
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
                                            color: 'var(--foreground)',
                                        }}
                                    >
                                        <span style={{ color: 'var(--muted-foreground)' }}>Service:</span> <span style={{ fontWeight: 500 }}>{result.serveur}</span>
                                    </div>

                                    {result.faute_type && (
                                        <div
                                            className="text-xs"
                                            style={{
                                                fontFamily: "'Roboto', Arial, sans-serif",
                                                color: 'var(--muted-foreground)',
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
                                                color: 'var(--muted-foreground)',
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
                                                borderTop: '1px solid var(--border)',
                                                color: 'var(--muted-foreground)',
                                            }}
                                        >
                                            <span>Score: {result.score_A} - {result.score_B}</span>
                                        </div>
                                    )}

                                </div>
                            </Link>
                            <div className="mt-2 flex justify-end">
                                <button
                                    onClick={() => toggleFavorite(result)}
                                    className={`px-3 py-1 text-sm rounded-full border transition-colors flex items-center justify-center ${isFav
                                        ? "border-amber-400 bg-amber-400/20 text-amber-300"
                                        : "border-input bg-card text-foreground hover:bg-muted"
                                        }`}
                                >
                                    <span style={{ color: isFav ? '#fbbf24' : 'var(--foreground)', fontSize: '14px' }}>
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
                background: 'var(--background)',
                color: 'var(--foreground)',
            }}
        >
            {/* Header - Glassmorphism */}
            <header
                className="sticky top-0 z-50"
                style={{
                    background: 'color-mix(in srgb, var(--card) 80%, transparent)',
                    backdropFilter: 'blur(15px)',
                    WebkitBackdropFilter: 'blur(15px)',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4 justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-2 transition-colors"
                            style={{ color: 'var(--muted-foreground)' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--foreground)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--muted-foreground)'}
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
                            style={{ background: 'var(--border)' }}
                        />
                        <h1
                            className="text-lg font-medium"
                            style={{
                                fontFamily: "'Playfair Display', Georgia, serif",
                                color: 'var(--foreground)',
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
                    style={{ color: 'var(--muted-foreground)', fontFamily: "'Inter', sans-serif" }}
                >
                    Loading search...
                </div>
            }>
                <SearchContent />
            </Suspense>
        </div>
    );
}
