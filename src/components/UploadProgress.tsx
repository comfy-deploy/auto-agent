import React from 'react';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface UploadProgressProps {
  progress: number;
  fileName: string;
  onCancel?: () => void;
  className?: string;
}

export function UploadProgress({
  progress,
  fileName,
  onCancel,
  className
}: UploadProgressProps) {
  const circumference = 2 * Math.PI * 16;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={cn(
      "relative flex-shrink-0 w-16 h-16 rounded-lg border bg-muted overflow-hidden group",
      className
    )}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-10 h-10">
          <svg
            className="w-10 h-10 transform -rotate-90"
            viewBox="0 0 36 36"
          >
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              className="stroke-muted-foreground/20"
              strokeWidth="2"
            />
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              className="stroke-primary"
              strokeWidth="2"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{
                transition: 'stroke-dashoffset 0.3s ease-in-out'
              }}
            />
          </svg>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-foreground">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
          title="Cancel upload"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 truncate">
        {fileName}
      </div>
    </div>
  );
}
