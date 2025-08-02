import React from 'react';
import { useUploadStore } from '../stores/upload-store';
import { UploadProgress } from './UploadProgress';
import { cn } from '../lib/utils';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

interface GlobalUploadAreaProps {
  className?: string;
}

export function GlobalUploadArea({ className }: GlobalUploadAreaProps) {
  const { uploads, removeUpload, clearCompleted } = useUploadStore();
  
  const activeUploads = uploads.filter(upload => 
    upload.status === 'pending' || upload.status === 'uploading'
  );
  
  const completedUploads = uploads.filter(upload => 
    upload.status === 'completed'
  );
  
  const errorUploads = uploads.filter(upload => 
    upload.status === 'error'
  );

  if (uploads.length === 0) {
    return null;
  }

  return (
    <div className={cn(
      "w-full bg-muted/50 border-b p-4 space-y-4",
      className
    )}>
      {/* Active Uploads */}
      {activeUploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Uploading ({activeUploads.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeUploads.map((upload) => (
              <UploadProgress
                key={upload.id}
                progress={upload.progress}
                fileName={upload.file.name}
                onCancel={() => removeUpload(upload.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Uploads */}
      {completedUploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Ready to send ({completedUploads.length})
            </h3>
            <button
              onClick={clearCompleted}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {completedUploads.map((upload) => (
              <div
                key={upload.id}
                className="relative flex-shrink-0 w-16 h-16 rounded-lg border bg-background overflow-hidden group"
              >
                {upload.url && (
                  <img
                    src={upload.url}
                    alt={upload.file.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                )}
                
                {/* Fallback file icon */}
                <div className="hidden absolute inset-0 flex items-center justify-center bg-muted">
                  <div className="text-xs text-center p-1">
                    <div className="w-6 h-6 mx-auto mb-1 bg-primary/20 rounded flex items-center justify-center">
                      📷
                    </div>
                    <div className="text-[10px] truncate">
                      {upload.file.name.split('.')[0]}
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeUpload(upload.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="Remove image"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Success indicator */}
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center">
                  <CheckCircle className="w-2.5 h-2.5" />
                </div>

                {/* File name tooltip */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                  {upload.file.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Uploads */}
      {errorUploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Failed ({errorUploads.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {errorUploads.map((upload) => (
              <div
                key={upload.id}
                className="relative flex-shrink-0 w-16 h-16 rounded-lg border border-destructive bg-destructive/10 overflow-hidden group"
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-destructive" />
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeUpload(upload.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  title="Remove failed upload"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Error message tooltip */}
                <div 
                  className="absolute bottom-0 left-0 right-0 bg-destructive text-destructive-foreground text-xs px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity"
                  title={upload.error}
                >
                  {upload.error || 'Upload failed'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
