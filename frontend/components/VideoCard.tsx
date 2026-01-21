import Link from "next/link";

interface VideoCardProps {
    id: string;
    title: string;
    description?: string;
}

/**
 * VideoCard component - Displays a video thumbnail with hover effects
 */
export default function VideoCard({ id, title, description }: VideoCardProps) {
    return (
        <Link href={`/watch/${id}`} className="group block">
            <div className="relative rounded-xl overflow-hidden bg-card border border-border transition-all duration-300 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 hover:scale-[1.02]">
                {/* Thumbnail */}
                <div className="aspect-video bg-muted relative overflow-hidden">
                    <img
                        src={`http://localhost:8000/api/videos/${id}/thumbnail`}
                        alt={title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />

                    {/* Fallback pattern (visible if img hidden) */}
                    <div className="absolute inset-0 bg-gradient-to-br from-muted to-card flex items-center justify-center -z-10">
                        <svg
                            className="w-16 h-16 text-muted-foreground group-hover:text-primary/50 transition-colors duration-300"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>

                    {/* Hover overlay with play button */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform duration-300">
                            <svg className="w-7 h-7 text-zinc-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Video info */}
                <div className="p-4">
                    <h3 className="text-foreground font-medium text-sm truncate group-hover:text-primary transition-colors">
                        {title}
                    </h3>
                    {description && (
                        <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
                            {description}
                        </p>
                    )}
                </div>
            </div>
        </Link>
    );
}
