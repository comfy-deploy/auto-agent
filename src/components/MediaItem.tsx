import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface MediaItemProps {
    item: {
        id: string;
        type: 'image' | 'video';
        url: string;
        width?: number;
        height?: number;
    };
    className?: string;
    imageClassName?: string;
    style?: React.CSSProperties;
    onClick?: () => void;
    showDimensions?: boolean;
    autoPlay?: boolean;
    controls?: boolean;
    muted?: boolean;
}

export function MediaItem({
    item,
    className,
    imageClassName,
    style,
    onClick,
    showDimensions = false,
    autoPlay = false,
    controls = false,
    muted = false
}: MediaItemProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    const handleLoadStart = () => {
        setIsLoading(true);
        setHasLoaded(false);
        setHasError(false);
    };

    const handleLoad = () => {
        setIsLoading(false);
        setHasLoaded(true);
        setHasError(false);
    };

    const handleError = () => {
        setIsLoading(false);
        setHasLoaded(false);
        setHasError(true);
    };

    if (item.type === 'image') {
        return (
            <div className={cn("relative", className)} >
                {/* Shimmer skeleton loader */}
                {(isLoading || !hasLoaded) && !hasError && (
                    <div className="absolute inset-0 bg-muted animate-pulse rounded"
                        style={style}
                    >
                        <div className="w-full h-full bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite] rounded"></div>
                    </div>
                )}

                {/* Error state for images */}
                {hasError && (
                    <div className={cn("flex items-center justify-center bg-muted text-muted-foreground rounded", imageClassName)}
                        style={style}
                    >
                        <div className="text-center p-2">
                            <div className="text-lg">🖼️</div>
                            <div className="text-xs">Failed to load</div>
                        </div>
                    </div>
                )}

                {!hasError && (
                    <img
                        src={item.url}
                        alt="Media content"
                        className={cn(
                            "transition-opacity duration-300 ease-in-out",
                            hasLoaded && !isLoading ? "opacity-100" : "opacity-0",
                            onClick && "cursor-pointer",
                            imageClassName
                        )}
                        style={style}
                        onLoadStart={handleLoadStart}
                        onLoad={handleLoad}
                        onError={handleError}
                        onClick={onClick}
                    />
                )}

                {showDimensions && item.width && item.height && hasLoaded && (
                    <div className="text-xs text-gray-500 mt-1">
                        {item.width} × {item.height}
                    </div>
                )}
            </div>
        );
    }

    if (item.type === 'video') {
        return (
            <div className={cn("relative", className)}>
                {/* Shimmer skeleton loader for videos */}
                {(isLoading || !hasLoaded) && !hasError && (
                    <div className={cn("absolute inset-0 bg-muted animate-pulse rounded", imageClassName)}
                        style={style}
                    >
                        <div className="w-full h-full bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite] rounded"></div>
                    </div>
                )}

                {/* Error state for videos */}
                {hasError && (
                    <div className={cn("flex items-center justify-center bg-muted text-muted-foreground rounded", imageClassName)}
                        style={style}
                    >
                        <div className="text-center p-2">
                            <div className="text-lg">🎥</div>
                            <div className="text-xs">Failed to load</div>
                        </div>
                    </div>
                )}

                {!hasError && (
                    <video
                        src={item.url}
                        className={cn(
                            "transition-opacity duration-300 ease-in-out rounded",
                            hasLoaded && !isLoading ? "opacity-100" : "opacity-0",
                            onClick && "cursor-pointer",
                            imageClassName // Apply the same size constraints as images
                        )}
                        style={style}
                        autoPlay={autoPlay}
                        controls={controls}
                        muted={muted}
                        onLoadStart={handleLoadStart}
                        onLoadedData={handleLoad}
                        onError={handleError}
                        onClick={onClick}
                        preload="metadata"
                    />
                )}

                {/* Improved play button overlay */}
                {!controls && hasLoaded && !hasError && (
                    <div 
                        className="absolute inset-0 flex items-center justify-center bg-black/20 rounded cursor-pointer"
                        onClick={onClick}
                    >
                        <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors">
                            <svg 
                                width="12" 
                                height="14" 
                                viewBox="0 0 12 14" 
                                fill="none" 
                                className="ml-0.5"
                            >
                                <path 
                                    d="M0 0V14L12 7L0 0Z" 
                                    fill="currentColor"
                                />
                            </svg>
                        </div>
                    </div>
                )}

                {showDimensions && item.width && item.height && hasLoaded && (
                    <div className="text-xs text-gray-500 mt-1">
                        {item.width} × {item.height}
                    </div>
                )}
            </div>
        );
    }

    return null;
} 