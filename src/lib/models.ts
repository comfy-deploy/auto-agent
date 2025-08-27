export type TextModel = {
  id: string;
  label: string;
};

export const TEXT_MODELS: TextModel[] = [
  { id: "openai/gpt-5", label: "GPT-5" },
  { id: "anthropic/claude-4-sonnet", label: "Claude 4 Sonnet" },
];

export const DEFAULT_TEXT_MODEL = "anthropic/claude-4-sonnet";
