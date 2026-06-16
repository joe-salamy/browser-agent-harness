import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  runtimeRun: vi.fn(),
}));

vi.mock("@/server/models/credentials", () => ({
  getDefaultModelProvider: vi.fn(async () => ({
    provider: "OPENROUTER",
    model: "openai/gpt-4.1-mini",
    adapter: { generateText: mocks.generateText },
  })),
}));

vi.mock("@/server/models/openrouter", () => ({
  resolveOpenRouterModel: vi.fn((model?: string) => model ?? "openai/gpt-4.1-mini"),
}));

vi.mock("@/server/agents/minimal-runtime", () => ({
  minimalAgentRuntime: { run: mocks.runtimeRun },
}));

import { runWebSearchGroundingSkill } from "./web-search";

const originalTavilyApiKey = process.env.TAVILY_API_KEY;

function tavilyResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as Response;
}

function tavilyErrorResponse(status: number, statusText: string): Response {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({ detail: { error: "provider detail" } }),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TAVILY_API_KEY = "tavily-test-key";
  vi.stubGlobal("fetch", vi.fn());
  mocks.runtimeRun.mockResolvedValue({ runId: "run-1", status: "SUCCEEDED", outputFileId: "file-1" });
});

afterEach(() => {
  if (originalTavilyApiKey === undefined) {
    delete process.env.TAVILY_API_KEY;
  } else {
    process.env.TAVILY_API_KEY = originalTavilyApiKey;
  }
  vi.unstubAllGlobals();
});

describe("runWebSearchGroundingSkill", () => {
  it("generates queries, fetches Tavily context, and forwards a grounded prompt", async () => {
    const fetchMock = vi.mocked(fetch);
    mocks.generateText.mockResolvedValueOnce({
      text: '```json\n{"queries":["latest SpaceX launches","Falcon 9 launch news"]}\n```',
    });
    fetchMock
      .mockResolvedValueOnce(
        tavilyResponse({
          answer: "SpaceX launched recent Falcon missions.",
          results: [{ title: "Launch update", url: "https://example.com/launch", content: "Recent launch details." }],
        }),
      )
      .mockResolvedValueOnce(
        tavilyResponse({
          answer: "Falcon 9 remains active.",
          results: [{ title: "Falcon news", url: "https://example.com/falcon", content: "Falcon 9 mission details." }],
        }),
      );

    await expect(
      runWebSearchGroundingSkill({
        userId: "user-1",
        workspaceId: "workspace-1",
        prompt: "Summarize the latest major news regarding SpaceX launches.",
        model: "openai/gpt-4.1-mini",
        outputPath: "outputs/spacex.md",
      }),
    ).resolves.toMatchObject({ runId: "run-1", status: "SUCCEEDED" });

    expect(mocks.generateText).toHaveBeenCalledWith({
      model: "openai/gpt-4.1-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            'You are a web search query generator. Based on the user\'s task, generate up to 3 web search queries to gather necessary context. Return JSON: { "queries": ["query1"] }.',
        },
        { role: "user", content: "Summarize the latest major news regarding SpaceX launches." },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstFetchInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.tavily.com/search");
    expect(firstFetchInit.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer tavily-test-key",
    });
    expect(firstFetchInit.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(firstFetchInit.body as string)).toEqual({
      query: "latest SpaceX launches",
      include_answer: true,
      max_results: 3,
    });
    expect(mocks.runtimeRun).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      model: "openai/gpt-4.1-mini",
      outputPath: "outputs/spacex.md",
      prompt: "Summarize the latest major news regarding SpaceX launches.",
      supplementalContexts: [{ label: "Web Search Context", content: expect.stringContaining("https://example.com/launch") }],
    });
    const forwardedInput = mocks.runtimeRun.mock.calls[0]?.[0] as {
      prompt: string;
      supplementalContexts: Array<{ content: string }>;
    };
    expect(forwardedInput.prompt).not.toContain("Web Search Context:");
    expect(forwardedInput.supplementalContexts[0]?.content).toContain("untrusted reference material");
  });

  it("falls back to the first 100 prompt characters when query JSON is invalid", async () => {
    const fetchMock = vi.mocked(fetch);
    const prompt = "x".repeat(120);
    mocks.generateText.mockResolvedValueOnce({ text: "not json" });
    fetchMock.mockResolvedValueOnce(tavilyResponse({ answer: null, results: [] }));

    await runWebSearchGroundingSkill({ userId: "user-1", workspaceId: "workspace-1", prompt });

    const firstFetchInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(firstFetchInit.body as string).query).toBe("x".repeat(100));
    expect(mocks.runtimeRun).toHaveBeenCalledOnce();
  });

  it("fails before model or fetch calls when Tavily is not configured", async () => {
    delete process.env.TAVILY_API_KEY;

    await expect(
      runWebSearchGroundingSkill({ userId: "user-1", workspaceId: "workspace-1", prompt: "Research current news." }),
    ).rejects.toThrow("TAVILY_API_KEY is not configured.");

    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.runtimeRun).not.toHaveBeenCalled();
  });

  it("fails with a sanitized Tavily status error", async () => {
    const fetchMock = vi.mocked(fetch);
    mocks.generateText.mockResolvedValueOnce({ text: '{"queries":["private workspace query"]}' });
    fetchMock.mockResolvedValueOnce(tavilyErrorResponse(401, "Unauthorized"));

    let caughtError: unknown;
    try {
      await runWebSearchGroundingSkill({ userId: "user-1", workspaceId: "workspace-1", prompt: "Research private workspace data." });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe("Tavily search failed (401 Unauthorized).");
    expect((caughtError as Error).message).not.toContain("private workspace query");
  });

  it("fails predictably when Tavily times out", async () => {
    const fetchMock = vi.mocked(fetch);
    mocks.generateText.mockResolvedValueOnce({ text: '{"queries":["current news"]}' });
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "TimeoutError" }));

    await expect(
      runWebSearchGroundingSkill({ userId: "user-1", workspaceId: "workspace-1", prompt: "Research current news." }),
    ).rejects.toThrow("Tavily search timed out.");

    expect(mocks.runtimeRun).not.toHaveBeenCalled();
  });
});
