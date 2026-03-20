import Link from "next/link";
import { API_URL } from "@/lib/api";

interface VideoCardProps {
    id: string;
    title: string;
    description?: string;
}

/**
 * VideoCard component - Displays a video thumbnail with hover effects
 * Modern Luxury Editorial / YouTube seamless style
 */
export default function VideoCard({ id, title, description }: VideoCardProps) {
    return (
        <Link href={`/watch/${id}`} className="group block">
            {/* Thumbnail - Seamless, no border */}
            <div
                className="aspect-video relative overflow-hidden"
                style={{ borderRadius: '12px' }}
            >
                <img
                    src={`${API_URL}/api/videos/${id}/thumbnail`}
                    alt={title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />

                {/* Fallback pattern (visible if img hidden) */}
                <div
                    className="absolute inset-0 flex items-center justify-center -z-10 bg-card border border-border"
                >
                    <svg
                        className="w-12 h-12 transition-colors duration-300 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                    </svg>
                </div>
            </div>

            {/* Video info - YouTube style with Roboto */}
            <div className="pt-3 pb-6 px-0">
                <h3
                    className="text-sm font-medium line-clamp-2 leading-snug"
                    style={{
                        fontFamily: "'Roboto', Arial, sans-serif",
                        color: 'var(--foreground)',
                        fontWeight: 500,
                    }}
                >
                    {title}
                </h3>
                {description && (
                    <p
                        className="text-xs mt-1 line-clamp-2"
                        style={{
                            fontFamily: "'Roboto', Arial, sans-serif",
                            color: 'var(--muted-foreground)',
                            fontWeight: 400,
                        }}
                    >
                        {description}
                    </p>
                )}
            </div>
        </Link>
    );
}

