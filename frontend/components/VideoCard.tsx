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
            <div className="relative rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 transition-all duration-300 hover:border-zinc-700 hover:shadow-xl hover:shadow-purple-500/10 hover:scale-[1.02]">
                {/* Thumbnail placeholder */}
                <div className="aspect-video bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center relative overflow-hidden">
                    {/* Video icon */}
                    <svg
                        className="w-16 h-16 text-zinc-700 group-hover:text-purple-500/50 transition-colors duration-300"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M8 5v14l11-7z" />
                    </svg>

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
                    <h3 className="text-zinc-100 font-medium text-sm truncate group-hover:text-white transition-colors">
                        {title}
                    </h3>
                    {description && (
                        <p className="text-zinc-500 text-xs mt-1 line-clamp-2">
                            {description}
                        </p>
                    )}
                </div>
            </div>
        </Link>
    );
}
