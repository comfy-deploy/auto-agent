import React, { useState, useCallback, useRef } from 'react';
import { useUploadStore } from '../stores/upload-store';
import { cn } from '../lib/utils';

interface FileDropZoneProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function FileDropZone({ children, className, disabled = false }: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const { addUpload } = useUploadStore();
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    setDragCounter(prev => prev + 1);
    
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const hasFiles = Array.from(e.dataTransfer.items).some(item => item.kind === 'file');
      if (hasFiles) {
        setIsDragOver(true);
      }
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    setDragCounter(prev => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragOver(false);
      }
      return newCounter;
    });
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    e.dataTransfer.dropEffect = 'copy';
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    setIsDragOver(false);
    setDragCounter(0);
    
    const files = Array.from(e.dataTransfer.files);
    
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const imageFiles = files.filter(file => allowedTypes.includes(file.type));
    
    if (imageFiles.length === 0) {
      console.warn('No valid image files found. Only JPG and PNG files are supported.');
      return;
    }
    
    imageFiles.forEach(file => {
      console.log(`Adding file to upload queue: ${file.name} (${file.type})`);
      addUpload(file);
    });
    
    const filteredCount = files.length - imageFiles.length;
    if (filteredCount > 0) {
      console.warn(`${filteredCount} file(s) were filtered out. Only JPG and PNG files are supported.`);
    }
  }, [disabled, addUpload]);

  return (
    <div
      ref={dropZoneRef}
      className={cn(
        "relative",
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
      
      {/* Drag overlay */}
      {isDragOver && !disabled && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center backdrop-blur-sm">
          <div className="text-center p-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary/20 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-primary mb-2">
              Drop images here
            </h3>
            <p className="text-sm text-muted-foreground">
              Supports JPG and PNG files
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
