import OpenAI from "openai";
import type { GenerateTextInput, GenerateTextResult, ModelProviderAdapter } from "@/server/models/provider";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";

export class OpenRouterAdapter implements ModelProviderAdapter {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
        "X-Title": "Browser Agent Harness",
      },
    });
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const completion = await this.client.chat.completions.create({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
    });
    return {
      text: completion.choices[0]?.message?.content ?? "",
      rawUsage: completion.usage,
    };
  }
}
