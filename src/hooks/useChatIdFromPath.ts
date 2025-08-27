import { useEffect, useState } from "react";

/**
 * Custom hook to handle chatId from URL path and model from query parameters
 * Works with URLs like /chat/<chatId>?model=<model>
 * Also supports backward compatibility with ?chatId=<chatId> format
 * 
 * This manages both chat ID and model as a cohesive unit
 */
export function useChatIdFromPath(options: { 
  defaultValue?: string; 
  serverChatId?: string; // Server-provided chat ID for SSR
  defaultModel?: string; // Default model to use
  history?: 'push' | 'replace';
  autoMigrateFromQuery?: boolean; // Auto-redirect from ?chatId= to /chat/ format
} = {}) {
  const { defaultValue = '', serverChatId, defaultModel = '', history = 'push', autoMigrateFromQuery = false } = options;
  
  const extractFromUrl = () => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return { chatId: '', model: '' }; // Return empty during SSR
    }
    
    // First try to get chatId from URL path (/chat/<chatId>)
    const path = window.location.pathname;
    const pathMatch = path.match(/^\/chat\/([^\/]+)$/);
    let chatId = '';
    
    if (pathMatch) {
      chatId = pathMatch[1];
    } else {
      // Fallback to query parameter (?chatId=<chatId>) for backward compatibility
      const params = new URLSearchParams(window.location.search);
      const queryParamChatId = params.get('chatId');
      if (queryParamChatId) {
        chatId = queryParamChatId;
      }
    }
    
    // Get model from query parameter
    const params = new URLSearchParams(window.location.search);
    const model = params.get('model') || '';
    
    return { chatId, model };
  };

  const [chatId, setChatIdState] = useState(() => {
    // During SSR, use server-provided value if available
    if (typeof window === 'undefined') {
      return serverChatId || defaultValue;
    }
    
    // On client, extract from URL
    const { chatId: urlChatId } = extractFromUrl();
    return urlChatId || serverChatId || defaultValue;
  });

  const [model, setModelState] = useState(() => {
    // During SSR, use default model
    if (typeof window === 'undefined') {
      return defaultModel;
    }
    
    // On client, extract from URL
    const { model: urlModel } = extractFromUrl();
    return urlModel || defaultModel;
  });

  // Auto-migrate from query parameter to path format (optional)
  useEffect(() => {
    if (typeof window === 'undefined' || !autoMigrateFromQuery) return;
    
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const queryParamChatId = params.get('chatId');
    const queryParamModel = params.get('model');
    
    // If we're not on /chat/:id path but have chatId query param, migrate
    if (queryParamChatId && !path.match(/^\/chat\/[^\/]+$/)) {
      const modelParam = queryParamModel ? `?model=${encodeURIComponent(queryParamModel)}` : '';
      const newUrl = `/chat/${queryParamChatId}${modelParam}`;
      if (history === 'push') {
        window.history.pushState({}, '', newUrl);
      } else {
        window.history.replaceState({}, '', newUrl);
      }
      setChatIdState(queryParamChatId);
      if (queryParamModel) {
        setModelState(queryParamModel);
      }
    }
  }, [autoMigrateFromQuery, history]);

  // Hydration effect: sync with URL on client-side mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // On first mount, check if URL differs from current state
    const { chatId: urlChatId, model: urlModel } = extractFromUrl();
    const finalChatId = urlChatId || serverChatId || defaultValue;
    const finalModel = urlModel || defaultModel;
    
    if (finalChatId !== chatId) {
      setChatIdState(finalChatId);
    }
    if (finalModel !== model) {
      setModelState(finalModel);
    }
  }, [serverChatId, defaultValue, defaultModel]); // Run when server values or defaults change

  // Listen for browser navigation (back/forward buttons)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handlePopState = () => {
      const { chatId: urlChatId, model: urlModel } = extractFromUrl();
      setChatIdState(urlChatId || serverChatId || defaultValue);
      setModelState(urlModel || defaultModel);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultValue, serverChatId, defaultModel]);

  const setChatId = (newChatId: string, newModel?: string) => {
    setChatIdState(newChatId);
    if (newModel !== undefined) {
      setModelState(newModel);
    }
    
    // Only update browser history on the client side
    if (typeof window !== 'undefined') {
      if (newChatId) {
        const modelToUse = newModel !== undefined ? newModel : model;
        const modelParam = modelToUse ? `?model=${encodeURIComponent(modelToUse)}` : '';
        const newUrl = `/chat/${newChatId}${modelParam}`;
        if (history === 'push') {
          window.history.pushState({}, '', newUrl);
        } else {
          window.history.replaceState({}, '', newUrl);
        }
      } else {
        const newUrl = '/';
        if (history === 'push') {
          window.history.pushState({}, '', newUrl);
        } else {
          window.history.replaceState({}, '', newUrl);
        }
      }
    }
  };

  const setModel = (newModel: string) => {
    setModelState(newModel);
    
    // Only update browser history on the client side
    if (typeof window !== 'undefined' && chatId) {
      const modelParam = newModel ? `?model=${encodeURIComponent(newModel)}` : '';
      const newUrl = `/chat/${chatId}${modelParam}`;
      if (history === 'push') {
        window.history.pushState({}, '', newUrl);
      } else {
        window.history.replaceState({}, '', newUrl);
      }
    }
  };

  return [chatId, setChatId, model, setModel] as const;
}