"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VideoCard from "@/components/VideoCard";
import ThemeToggle from "@/components/ThemeToggle";
import { API_URL } from "@/lib/api";

interface Video {
  id: string;
  title: string;
  description?: string;
}

export default function Home() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/videos`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch videos");
        return res.json();
      })
      .then((data) => {
        setVideos(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const navButtonStyle = {
    background: 'var(--secondary)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    color: 'var(--foreground)',
    fontFamily: "'Inter', sans-serif",
  } as const;

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
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              color: 'var(--foreground)',
              letterSpacing: '-0.02em',
            }}
          >
            Video Gallery
          </h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/search"
              className="flex items-center gap-2 px-4 py-2 text-sm transition-all duration-200"
              style={navButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, #0a84ff 12%, var(--card))';
                e.currentTarget.style.borderColor = '#0a84ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </Link>
            <Link
              href="/visualization"
              className="flex items-center gap-2 px-4 py-2 text-sm transition-all duration-200"
              style={navButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, #10b981 12%, var(--card))';
                e.currentTarget.style.borderColor = '#10b981';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                viewBox="0 0 24 24"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Visualisation
            </Link>
            <Link
              href="/compare"
              className="flex items-center gap-2 px-4 py-2 text-sm transition-all duration-200"
              style={navButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'color-mix(in srgb, #ff453a 12%, var(--card))';
                e.currentTarget.style.borderColor = '#ff453a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              Compare
            </Link>
            <Link
              href="/sketch"
              className="flex items-center gap-2 px-4 py-2 text-sm transition-all duration-200"
              style={{
                background: 'var(--secondary)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                color: 'var(--foreground)',
                fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 159, 10, 0.1)';
                e.currentTarget.style.borderColor = '#ff9f0a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--secondary)';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              Sketch
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-10 h-10 rounded-full animate-spin"
              style={{
                border: '3px solid var(--border)',
                borderTopColor: '#0a84ff',
              }}
            />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-12">
            <p
              className="text-sm"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: 'var(--muted-foreground)',
              }}
            >
              Unable to connect to server. Make sure the backend is running.
            </p>
            <code
              className="mt-2 text-xs block"
              style={{ color: 'color-mix(in srgb, var(--muted-foreground) 80%, transparent)' }}
            >
              uvicorn main:app --reload
            </code>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && videos.length === 0 && (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 mx-auto mb-4 flex items-center justify-center"
              style={{
                borderRadius: '16px',
                background: 'color-mix(in srgb, var(--card) 84%, transparent)',
                border: '1px solid var(--border)',
              }}
            >
              <svg
                className="w-10 h-10"
                fill="none"
                stroke="var(--muted-foreground)"
                strokeWidth="1.25"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                color: 'var(--muted-foreground)',
              }}
            >
              No videos available
            </p>
            <p
              className="text-sm mt-1"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: 'color-mix(in srgb, var(--muted-foreground) 80%, transparent)',
              }}
            >
              Add videos to the backend/videos folder
            </p>
          </div>
        )}

        {/* Video grid */}
        {!loading && !error && videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                id={video.id}
                title={video.title}
                description={video.description}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

