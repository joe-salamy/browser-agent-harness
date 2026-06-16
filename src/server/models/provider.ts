export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateTextInput = {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
};

export type GenerateTextResult = { text: string; rawUsage?: unknown };

export interface ModelProviderAdapter {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
}
