import { useEffect, useState } from "react";

/**
 * Custom hook to handle chatId from URL path or query parameters (backward compatible)
 * Works with URLs like /chat/<chatId> (preferred) and ?chatId=<chatId> (fallback)
 * 
 * This is a drop-in replacement for useQueryState('chatId') but prioritizes URL path
 */
export function useChatIdFromPath(options: { 
  defaultValue?: string; 
  serverChatId?: string; // Server-provided chat ID for SSR
  history?: 'push' | 'replace';
  autoMigrateFromQuery?: boolean; // Auto-redirect from ?chatId= to /chat/ format
} = {}) {
  const { defaultValue = '', serverChatId, history = 'push', autoMigrateFromQuery = false } = options;
  
  const extractChatIdFromUrl = () => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      return ''; // Return empty string during SSR, server will provide the value
    }
    
    // First try to get from URL path (/chat/<chatId>)
    const path = window.location.pathname;
    const pathMatch = path.match(/^\/chat\/([^\/]+)$/);
    if (pathMatch) {
      return pathMatch[1];
    }
    
    // Fallback to query parameter (?chatId=<chatId>) for backward compatibility
    const params = new URLSearchParams(window.location.search);
    const queryParamChatId = params.get('chatId');
    if (queryParamChatId) {
      return queryParamChatId;
    }
    
    return '';
  };

  const [chatId, setChatIdState] = useState(() => {
    // During SSR, use server-provided value if available
    if (typeof window === 'undefined') {
      return serverChatId || defaultValue;
    }
    
    // On client, extract from URL
    const urlChatId = extractChatIdFromUrl();
    return urlChatId || serverChatId || defaultValue;
  });

  // Auto-migrate from query parameter to path format (optional)
  useEffect(() => {
    if (typeof window === 'undefined' || !autoMigrateFromQuery) return;
    
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const queryParamChatId = params.get('chatId');
    
    // If we're not on /chat/:id path but have chatId query param, migrate
    if (queryParamChatId && !path.match(/^\/chat\/[^\/]+$/)) {
      const newUrl = `/chat/${queryParamChatId}`;
      if (history === 'push') {
        window.history.pushState({}, '', newUrl);
      } else {
        window.history.replaceState({}, '', newUrl);
      }
      setChatIdState(queryParamChatId);
    }
  }, [autoMigrateFromQuery, history]);

  // Hydration effect: sync with URL on client-side mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // On first mount, check if URL chatId differs from current state
    const urlChatId = extractChatIdFromUrl();
    const finalChatId = urlChatId || serverChatId || defaultValue;
    
    if (finalChatId !== chatId) {
      setChatIdState(finalChatId);
    }
  }, [serverChatId, defaultValue]); // Run when server chat ID or default changes

  // Listen for browser navigation (back/forward buttons)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handlePopState = () => {
      const urlChatId = extractChatIdFromUrl();
      setChatIdState(urlChatId || serverChatId || defaultValue);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [defaultValue, serverChatId]);

  const setChatId = (newChatId: string) => {
    setChatIdState(newChatId);
    
    // Only update browser history on the client side
    if (typeof window !== 'undefined') {
      if (newChatId) {
        const newUrl = `/chat/${newChatId}`;
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

  return [chatId, setChatId] as const;
}