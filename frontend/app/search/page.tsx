"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface SearchResult {
    id: string;
    video_id?: string;
    set_number?: number;
    point_number?: number;
    clip_id?: string;
    winner?: string;
    description?: string;
    score?: string;
    [key: string]: any;
}

interface SearchResponse {
    results: SearchResult[];
    total: number;
    page: number;
    size: number;
    pages: number;
    message?: string;
}

const API_URL = "http://localhost:8000";

export default function SearchPage() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(0);
    const [loading, setLoading] = useState(false);
    const [esStatus, setEsStatus] = useState<"checking" | "connected" | "disconnected">("checking");
    const [message, setMessage] = useState<string | null>(null);

    // Filters
    const [setFilter, setSetFilter] = useState<string>("");
    const [winnerFilter, setWinnerFilter] = useState<string>("");

    // Check ES status on mount
    useEffect(() => {
        fetch(`${API_URL}/api/search/status`)
            .then((res) => res.json())
            .then((data) => {
                setEsStatus(data.elasticsearch.connected ? "connected" : "disconnected");
            })
            .catch(() => setEsStatus("disconnected"));
    }, []);

    // Search function
    const performSearch = useCallback(async () => {
        setLoading(true);
        setMessage(null);

        const params = new URLSearchParams();
        if (query) params.append("q", query);
        if (setFilter) params.append("set_number", setFilter);
        if (winnerFilter) params.append("winner", winnerFilter);
        params.append("page", page.toString());
        params.append("size", "20");

        try {
            const res = await fetch(`${API_URL}/api/search?${params}`);
            const data: SearchResponse = await res.json();

            setResults(data.results);
            setTotal(data.total);
            setPages(data.pages || 0);
            if (data.message) setMessage(data.message);
        } catch (error) {
            setMessage("Error connecting to search service");
        } finally {
            setLoading(false);
        }
    }, [query, setFilter, winnerFilter, page]);

    // Search on Enter or button click
    const handleSearch = (e?: React.FormEvent) => {
        e?.preventDefault();
        setPage(1);
        performSearch();
    };

    // Re-search when page changes
    useEffect(() => {
        if (page > 1) performSearch();
    }, [page]);

    return (
        <div className="min-h-screen bg-[#141414]">
            {/* Header */}
            <header className="sticky top-0 z-50 backdrop-blur-md bg-[#141414]/80 border-b border-zinc-800/50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span className="text-sm">Back</span>
                    </Link>
                    <div className="h-4 w-px bg-zinc-800" />
                    <h1 className="text-lg font-medium text-zinc-100">
                        🔍 Search Points
                    </h1>

                    {/* ES Status */}
                    <div className="ml-auto flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${esStatus === "checking" ? "bg-yellow-500" :
                                esStatus === "connected" ? "bg-green-500" : "bg-red-500"
                            }`} />
                        <span className="text-xs text-zinc-500">
                            {esStatus === "checking" ? "Checking..." :
                                esStatus === "connected" ? "Elasticsearch" : "ES Offline"}
                        </span>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Search Form */}
                <form onSubmit={handleSearch} className="mb-8">
                    <div className="flex flex-col gap-4">
                        {/* Search bar */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search points... (e.g., 'ace', 'backhand winner')"
                                className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                            />
                            <button
                                type="submit"
                                disabled={loading || esStatus !== "connected"}
                                className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                            >
                                {loading ? "..." : "Search"}
                            </button>
                        </div>

                        {/* Filters row */}
                        <div className="flex gap-4 flex-wrap">
                            <select
                                value={setFilter}
                                onChange={(e) => setSetFilter(e.target.value)}
                                className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 text-sm focus:outline-none focus:border-purple-500"
                            >
                                <option value="">All Sets</option>
                                <option value="1">Set 1</option>
                                <option value="2">Set 2</option>
                                <option value="3">Set 3</option>
                                <option value="4">Set 4</option>
                                <option value="5">Set 5</option>
                            </select>

                            <input
                                type="text"
                                value={winnerFilter}
                                onChange={(e) => setWinnerFilter(e.target.value)}
                                placeholder="Winner name..."
                                className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-300 text-sm placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                            />
                        </div>
                    </div>
                </form>

                {/* ES Offline Warning */}
                {esStatus === "disconnected" && (
                    <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <p className="text-red-400 text-sm">
                            ⚠️ Elasticsearch is not running. Start it with:
                        </p>
                        <code className="mt-2 block text-xs text-red-300 font-mono">
                            docker-compose up -d
                        </code>
                    </div>
                )}

                {/* Message */}
                {message && (
                    <div className="mb-8 p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                        <p className="text-zinc-400 text-sm">{message}</p>
                    </div>
                )}

                {/* Results count */}
                {total > 0 && (
                    <p className="mb-4 text-sm text-zinc-500">
                        Found {total} result{total !== 1 ? "s" : ""}
                    </p>
                )}

                {/* Results */}
                <div className="space-y-3">
                    {results.map((result) => (
                        <Link
                            key={result.id}
                            href={`/watch/fan-zhendong-vs-moregard?clip=${result.clip_id || `set_${result.set_number}_point_${result.point_number}`}`}
                            className="block p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:bg-zinc-900 transition-all"
                        >
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center">
                                    <span className="text-lg font-bold text-zinc-500">
                                        {result.point_number ?? "?"}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                            Set {result.set_number}
                                        </span>
                                        {result.winner && (
                                            <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded">
                                                Winner: {result.winner}
                                            </span>
                                        )}
                                        {result.score && (
                                            <span className="text-xs text-zinc-500">
                                                {result.score}
                                            </span>
                                        )}
                                    </div>
                                    {result.description && (
                                        <p className="text-sm text-zinc-400 truncate">
                                            {result.description}
                                        </p>
                                    )}
                                </div>
                                <svg className="w-5 h-5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* Empty state */}
                {!loading && results.length === 0 && esStatus === "connected" && !message && (
                    <div className="text-center py-16">
                        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                            <svg className="w-10 h-10 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <p className="text-zinc-500">Enter a search query to find points</p>
                    </div>
                )}

                {/* Pagination */}
                {pages > 1 && (
                    <div className="mt-8 flex items-center justify-center gap-2">
                        <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 text-sm rounded"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-zinc-500">
                            Page {page} of {pages}
                        </span>
                        <button
                            onClick={() => setPage(Math.min(pages, page + 1))}
                            disabled={page === pages}
                            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 text-sm rounded"
                        >
                            Next
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
