"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { FavoriteItem, loadFavorites, removeFavorite } from "@/lib/favorites";

const API_URL = "http://localhost:8001";

export default function FavoritesPage() {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

    useEffect(() => {
        setFavorites(loadFavorites());
    }, []);

    const handleRemove = (id: string) => {
        const updated = removeFavorite(id);
        setFavorites(updated);
    };

    return (
        <div
            className="min-h-screen"
            style={{
                background: '#1c1c1e',
                color: '#f5f5f7',
            }}
        >
            {/* Header */}
            <header
                className="sticky top-0 z-50"
                style={{
                    background: 'rgba(44, 44, 46, 0.8)',
                    backdropFilter: 'blur(15px)',
                    WebkitBackdropFilter: 'blur(15px)',
                    borderBottom: '1px solid #3a3a3c',
                }}
            >
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/search"
                            className="flex items-center gap-2 transition-colors"
                            style={{ color: '#86868b' }}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.25" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                            </svg>
                            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '0.875rem' }}>Retour</span>
                        </Link>
                        <h1
                            style={{
                                fontFamily: "'Playfair Display', Georgia, serif",
                                fontSize: '1.5rem',
                                fontWeight: 600,
                                letterSpacing: '-0.02em',
                            }}
                        >
                            ⭐ Mes Favoris
                        </h1>
                    </div>
                    <ThemeToggle />
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-10">
                {favorites.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-lg" style={{ color: '#86868b' }}>
                            Aucun favori pour l&apos;instant.
                        </p>
                        <Link
                            href="/search"
                            className="mt-4 inline-block px-6 py-3 rounded-lg text-sm font-medium"
                            style={{ background: '#0a84ff', color: '#fff' }}
                        >
                            Rechercher des points
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8">
                        {favorites.map((fav) => (
                            <div key={fav.id} className="group">
                                <Link
                                    href={`/watch/${fav.videoSlug}?clip=${fav.clipId}`}
                                    className="block"
                                >
                                    <div className="aspect-video overflow-hidden rounded-xl">
                                        {fav.thumbnail && (
                                            <img
                                                src={fav.thumbnail}
                                                alt={fav.title || "Favori"}
                                                className="w-full h-full object-cover"
                                                onError={(e) => (e.currentTarget.style.display = "none")}
                                            />
                                        )}
                                    </div>
                                    <div className="pt-3 pb-2 px-0">
                                        <div
                                            className="text-sm font-medium"
                                            style={{ fontFamily: "'Roboto', Arial, sans-serif", color: '#f5f5f7' }}
                                        >
                                            {fav.title || fav.id}
                                        </div>
                                        {fav.matchLabel && (
                                            <div
                                                className="text-xs mt-1"
                                                style={{ fontFamily: "'Roboto', Arial, sans-serif", color: '#aaaaaa' }}
                                            >
                                                {fav.matchLabel}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                                <button
                                    onClick={() => handleRemove(fav.id)}
                                    className="mt-1 px-3 py-1 text-xs rounded-full border border-red-500/50 text-red-400 hover:bg-red-500/20 transition-colors"
                                >
                                    Retirer
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
