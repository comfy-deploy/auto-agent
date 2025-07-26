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

    const handleLoadStart = () => {
        setIsLoading(true);
        setHasLoaded(false);
    };

    const handleLoad = () => {
        setIsLoading(false);
        setHasLoaded(true);
    };

    if (item.type === 'image') {
        return (
            <div className={cn("relative", className)} >
                {/* Shimmer skeleton loader */}
                {(isLoading || !hasLoaded) && (
                    <div className="absolute inset-0 bg-muted animate-pulse rounded"
                        style={style}
                    >
                        <div className="w-full h-full bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite] rounded"></div>
                    </div>
                )}

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
                    onClick={onClick}
                />

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
                <video
                    src={item.url}
                    className={cn(
                        "w-full h-full object-cover",
                        onClick && "cursor-pointer"
                    )}
                    style={style}
                    autoPlay={autoPlay}
                    controls={controls}
                    muted={muted}
                    onClick={onClick}
                />

                {!controls && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-4 h-4 border-l-2 border-white border-l-white/80 border-transparent ml-1"></div>
                    </div>
                )}
            </div>
        );
    }

    return null;
} 