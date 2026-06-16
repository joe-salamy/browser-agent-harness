import OpenAI from "openai";
import type {
  GenerateTextInput,
  GenerateTextResult,
  ModelProviderAdapter,
} from "@/server/models/provider";

export const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_OPENROUTER_TIMEOUT_MS = 60_000;
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.:-]*$/i;

function isValidOpenRouterModelId(model: string): boolean {
  return MODEL_ID_PATTERN.test(model) && !model.includes("..");
}

export function getAllowedOpenRouterModels(): readonly string[] {
  const allowedModels = new Set<string>([DEFAULT_OPENROUTER_MODEL]);
  for (const value of (process.env.OPENROUTER_ALLOWED_MODELS ?? "").split(
    ",",
  )) {
    const model = value.trim();
    if (!model) continue;
    if (!isValidOpenRouterModelId(model)) {
      throw new Error(
        "Configured OpenRouter model allowlist contains an invalid model id.",
      );
    }
    allowedModels.add(model);
  }
  return [...allowedModels];
}

export function resolveOpenRouterModel(requestedModel?: string): string {
  const model = requestedModel?.trim();
  if (!model) return DEFAULT_OPENROUTER_MODEL;
  if (
    !isValidOpenRouterModelId(model) ||
    !getAllowedOpenRouterModels().includes(model)
  ) {
    throw new Error("OpenRouter model is not allowed for this deployment.");
  }
  return model;
}

export function getSafeOpenRouterErrorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
  return typeof status === "number"
    ? `OpenRouter request failed with status ${status}.`
    : "OpenRouter request failed.";
}

export class OpenRouterAdapter implements ModelProviderAdapter {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      timeout: DEFAULT_OPENROUTER_TIMEOUT_MS,
      maxRetries: 0,
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXTAUTH_URL ?? "http://localhost:3000",
        "X-Title": "Browser Agent Harness",
      },
    });
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    try {
      const completion = await this.client.chat.completions.create({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
      });
      const text = completion.choices[0]?.message?.content ?? "";
      if (!text.trim())
        throw new Error("OpenRouter returned an empty response.");
      return {
        text,
        rawUsage: completion.usage,
      };
    } catch (error) {
      throw new Error(getSafeOpenRouterErrorMessage(error));
    }
  }
}
