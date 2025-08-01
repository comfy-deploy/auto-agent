// Read-only example chat IDs - centralized configuration
export const READ_ONLY_EXAMPLE_CHAT_IDS = ['xtxBPAEijQ7WV4YC', '3Yp6RLKO0WzPftrf'] as const;

// Type for example chat ID
export type ExampleChatId = typeof READ_ONLY_EXAMPLE_CHAT_IDS[number];

// Helper function to check if a chat ID is a read-only example
export const isReadOnlyChat = (chatId: string): boolean => {
  return READ_ONLY_EXAMPLE_CHAT_IDS.includes(chatId as ExampleChatId);
};

// Helper function to check if a chat ID is published (and thus read-only)
export const isPublishedChat = async (chatId: string): Promise<boolean> => {
  if (!chatId) return false;
  
  try {
    const response = await fetch(`/api/chat/${chatId}/published`);
    if (response.ok) {
      const data = await response.json();
      return data.published;
    }
  } catch (error) {
    console.error('Error checking if chat is published:', error);
  }
  
  return false;
};

// Helper function to check if a chat is read-only (either example or published)
export const isChatReadOnly = async (chatId: string): Promise<boolean> => {
  if (isReadOnlyChat(chatId)) {
    return true;
  }
  
  return await isPublishedChat(chatId);
}; 