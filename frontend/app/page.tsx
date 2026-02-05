"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VideoCard from "@/components/VideoCard";
import ThemeToggle from "@/components/ThemeToggle";

interface Video {
  id: string;
  title: string;
  description?: string;
}

const API_URL = "http://localhost:8000";

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
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{
              color: '#f5f5f7',
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
              style={{
                background: 'rgba(58, 58, 60, 0.6)',
                border: '1px solid #3a3a3c',
                borderRadius: '10px',
                color: '#f5f5f7',
                fontFamily: "'Inter', sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(10, 132, 255, 0.2)';
                e.currentTarget.style.borderColor = '#0a84ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(58, 58, 60, 0.6)';
                e.currentTarget.style.borderColor = '#3a3a3c';
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
                border: '3px solid #3a3a3c',
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
                color: '#86868b',
              }}
            >
              Unable to connect to server. Make sure the backend is running.
            </p>
            <code
              className="mt-2 text-xs block"
              style={{ color: 'rgba(134, 134, 139, 0.8)' }}
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
                background: 'rgba(44, 44, 46, 0.8)',
                border: '1px solid #3a3a3c',
              }}
            >
              <svg
                className="w-10 h-10"
                fill="none"
                stroke="#86868b"
                strokeWidth="1.25"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p
              style={{
                color: '#86868b',
              }}
            >
              No videos available
            </p>
            <p
              className="text-sm mt-1"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: 'rgba(134, 134, 139, 0.8)',
              }}
            >
              Add videos to the backend/videos folder
            </p>
          </div>
        )}

        {/* Video grid */}
        {!loading && !error && videos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-0 gap-y-8">
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

