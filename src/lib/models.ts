export type TextModel = {
  id: string;
  label: string;
};

export const TEXT_MODELS: TextModel[] = [
  { id: "anthropic/claude-4-sonnet", label: "Claude 4 Sonnet" },
  { id: "openai/gpt-5", label: "GPT-5" },
];

export const DEFAULT_TEXT_MODEL = TEXT_MODELS[0].id;
