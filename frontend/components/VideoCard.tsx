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
        <Link href={`/watch/${id}`} className="group block p-2 rounded-xl relative">
            {/* Hover halo on the whole card */}
            <div className="absolute 
                inset-0 
                rounded-xl 
                opacity-0 
                scale-95              /* Commence un peu plus petit */
                group-hover:opacity-60 
                group-hover:scale-103     /* S'agrandit au hover */
                transition-all 
                duration-300 
                pointer-events-none" 
                style={{ backgroundColor: 'rgba(142, 144, 148, 0.1)' }} />

            <div className="relative">
            
            <div
                className="aspect-video relative overflow-hidden"
                style={{ borderRadius: '12px' }}
            >
                
                <img
                    src={`http://localhost:8000/api/videos/${id}/thumbnail`}
                    alt={title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />

                

                {/* Fallback pattern (visible if img hidden) */}
                <div
                    className="absolute inset-0 flex items-center justify-center -z-10"
                    style={{
                        background: 'linear-gradient(135deg, #2c2c2e 0%, #1c1c1e 100%)',
                    }}
                >
                    <svg
                        className="w-12 h-12 transition-colors duration-300"
                        fill="none"
                        stroke="#86868b"
                        strokeWidth="1.25"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                    </svg>
                </div>
            </div>

            {/* Video info - YouTube style with Roboto */}
            <div className="pt-4  px-0 relative">
                <h3
                    className="text-sm font-medium line-clamp-2 leading-snug"
                    style={{
                        fontFamily: "'Roboto', Arial, sans-serif",
                        color: '#f5f5f7',
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
                            color: '#aaaaaa',
                            fontWeight: 400,
                        }}
                    >
                        {description}
                    </p>
                )}
            </div>
            </div>
        </Link>
    );
}

