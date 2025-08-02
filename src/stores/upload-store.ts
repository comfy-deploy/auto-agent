import { create } from 'zustand';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  url?: string;
  error?: string;
}

interface UploadStore {
  uploads: UploadItem[];
  addUpload: (file: File) => string;
  updateUpload: (id: string, updates: Partial<UploadItem>) => void;
  removeUpload: (id: string) => void;
  clearCompleted: () => void;
  getCompletedUrls: () => string[];
}

export const useUploadStore = create<UploadStore>((set, get) => ({
  uploads: [],
  
  addUpload: (file: File) => {
    const id = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const uploadItem: UploadItem = {
      id,
      file,
      progress: 0,
      status: 'pending'
    };
    
    set((state) => ({
      uploads: [...state.uploads, uploadItem]
    }));
    
    uploadFile(id, file);
    
    return id;
  },
  
  updateUpload: (id: string, updates: Partial<UploadItem>) => {
    set((state) => ({
      uploads: state.uploads.map(upload =>
        upload.id === id ? { ...upload, ...updates } : upload
      )
    }));
  },
  
  removeUpload: (id: string) => {
    set((state) => ({
      uploads: state.uploads.filter(upload => upload.id !== id)
    }));
  },
  
  clearCompleted: () => {
    set((state) => ({
      uploads: state.uploads.filter(upload => upload.status !== 'completed')
    }));
  },
  
  getCompletedUrls: () => {
    return get().uploads
      .filter(upload => upload.status === 'completed' && upload.url)
      .map(upload => upload.url!);
  }
}));

async function uploadFile(uploadId: string, file: File) {
  const { updateUpload } = useUploadStore.getState();
  
  try {
    updateUpload(uploadId, { status: 'uploading', progress: 0 });
    
    const formData = new FormData();
    formData.append('file', file);
    
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        updateUpload(uploadId, { progress });
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);
          updateUpload(uploadId, {
            status: 'completed',
            progress: 100,
            url: response.url
          });
        } catch (error) {
          updateUpload(uploadId, {
            status: 'error',
            error: 'Failed to parse response'
          });
        }
      } else {
        let errorMessage = 'Upload failed';
        try {
          const errorResponse = JSON.parse(xhr.responseText);
          errorMessage = errorResponse.error || errorMessage;
        } catch {
          errorMessage = `Upload failed with status ${xhr.status}`;
        }
        updateUpload(uploadId, {
          status: 'error',
          error: errorMessage
        });
      }
    });
    
    xhr.addEventListener('error', () => {
      updateUpload(uploadId, {
        status: 'error',
        error: 'Network error during upload'
      });
    });
    
    xhr.open('POST', '/api/upload');
    xhr.send(formData);
    
  } catch (error) {
    updateUpload(uploadId, {
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
