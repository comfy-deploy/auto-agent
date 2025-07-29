// Read-only example chat IDs - centralized configuration
export const READ_ONLY_EXAMPLE_CHAT_IDS = ['xtxBPAEijQ7WV4YC', '3Yp6RLKO0WzPftrf'] as const;

// Type for example chat ID
export type ExampleChatId = typeof READ_ONLY_EXAMPLE_CHAT_IDS[number];

// Helper function to check if a chat ID is a read-only example
export const isReadOnlyChat = (chatId: string): boolean => {
  return READ_ONLY_EXAMPLE_CHAT_IDS.includes(chatId as ExampleChatId);
}; 