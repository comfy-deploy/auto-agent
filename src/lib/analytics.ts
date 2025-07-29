// Google Analytics utility functions
declare global {
  interface Window {
    gtag: (
      command: 'config' | 'event' | 'js' | 'set',
      targetId: string | Date,
      config?: any
    ) => void;
    dataLayer: any[];
  }
}

// Track custom events
export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, parameters);
  }
};

// Track page views (useful for SPA navigation)
export const trackPageView = (url: string, title?: string) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', 'G-JH92Y4NVZM', {
      page_location: url,
      page_title: title,
    });
  }
};

// Track user interactions
export const trackUserAction = (action: string, category?: string, label?: string, value?: number) => {
  trackEvent(action, {
    event_category: category,
    event_label: label,
    value: value,
  });
};

// Track chat interactions
export const trackChatEvent = (action: 'start_chat' | 'send_message' | 'view_example') => {
  trackEvent('chat_interaction', {
    action,
    timestamp: new Date().toISOString(),
  });
}; 