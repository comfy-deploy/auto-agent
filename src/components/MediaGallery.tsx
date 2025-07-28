import React from 'react';
import { MediaItem } from './MediaItem';
import { cn } from '@/lib/utils';

interface MediaGalleryProps {
  items: Array<{
    id: string;
    type: 'image' | 'video';
    url: string;
    width?: number;
    height?: number;
  }>;
  onItemClick: (item: {
    id: string;
    type: 'image' | 'video';
    url: string;
    width?: number;
    height?: number;
  }) => void;
  className?: string;
  itemClassName?: string;
  mediaClassName?: string;
  layout?: 'horizontal' | 'grid';
  showLabels?: boolean;
}

export function MediaGallery({
  items,
  onItemClick,
  className,
  itemClassName,
  mediaClassName = "h-16 w-16 object-cover max-h-16",
  layout = 'horizontal',
  showLabels = false
}: MediaGalleryProps) {
  if (items.length === 0) return null;

  return (
    <div className={cn(
      "media-gallery", // Add class for CSS targeting
      layout === 'horizontal' 
        ? "flex gap-2 overflow-x-auto scrollbar-hide" 
        : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2",
      className
    )}>
      {items.map((item, index) => (
        <div key={item.id} className={cn(
          "flex-shrink-0 relative group rounded-lg overflow-hidden border hover:-translate-y-2 transition-transform duration-200 ease-out",
          layout === 'grid' && "aspect-square",
          // Add height constraint for the container
          "max-h-20",
          itemClassName
        )}>
          {showLabels && (
            <div className="absolute top-1 left-1 z-10 bg-black/50 text-white text-xs px-1 py-0.5 rounded">
              {item.type === "image" ? "🖼️" : "🎥"} {index + 1}
            </div>
          )}
          <MediaItem
            item={item}
            imageClassName={cn(
              mediaClassName,
              // Extra height constraint specifically for videos
              item.type === 'video' && "max-h-16"
            )}
            onClick={() => onItemClick(item)}
            muted={item.type === 'video'}
          />
        </div>
      ))}
    </div>
  );
} 