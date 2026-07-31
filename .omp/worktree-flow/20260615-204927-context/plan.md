# Context

The harness needs a way to ground its generation using external knowledge from the web, without bloating the minimal agent runtime with built-in tool calling. We will add a "Web Search & Grounding" skill (`core.web-search-grounding`) that pre-fetches search results via Tavily and injects them into the prompt before passing the synthesized task to the agent.

# Approach

1. **Environment Config**:
   - Edit `.env.example` to append `TAVILY_API_KEY=""`.

2. **Implement the Skill Logic**:
   - Create `src/server/skills/web-search.ts` with a single exported function `runWebSearchGroundingSkill(input: { userId: string; workspaceId: string; prompt?: string; model?: string; outputPath?: string; })`.
   - **Query Generation**: Use `getDefaultModelProvider` to call the user's default model with a system prompt: "You are a web search query generator. Based on the user's task, generate up to 3 web search queries to gather necessary context. Return JSON: { \"queries\": [\"query1\"] }."
   - Extract the JSON using the existing `extractJsonObjectText` from `src/server/skill-chains/types.ts` and parse it with Zod.
   - **Contingency/Fallback**: If the model returns invalid JSON, catch the error and fallback to using `[input.prompt.slice(0, 100)]` as the single query.
   - **Fetch**: Make standard `fetch` POST requests to `https://api.tavily.com/search` for each query (params: `api_key`, `query`, `include_answer: true`, `max_results: 3`).
   - Format the results into a markdown string containing the queries, the Tavily summary answer, and the result title/urls/content.
   - **Synthesize**: Prepend the formatted search results to the original prompt: `"Web Search Context:\n[RESULTS]\n\nTask:\n[ORIGINAL_PROMPT]"`.
   - Forward the synthetic prompt to the existing `minimalAgentRuntime.run(...)`.

3. **Wire into the Registry**:
   - Edit `src/server/skills/registry.ts`.
   - Add `"core.web-search-grounding"` to the `BUILT_IN_SKILLS` constant with the name "Web Search & Grounding" and required permissions `["files:read", "files:write", "models:generate"]`.
   - In the `runSkill` switch statement, add a case for `"core.web-search-grounding"` that calls the new `runWebSearchGroundingSkill` function.

4. **Update Skill Chain Configuration**:
   - Edit `src/server/skill-chains/types.ts` to append `"core.web-search-grounding"` to the `EXECUTABLE_CHAIN_SKILL_IDS` array so it can be chained.
   - Edit `src/server/skill-chains/builder.ts` to replace the hardcoded `Allowed executable skill IDs: core.research-synthesis.` in `CHAIN_BUILDER_SYSTEM_PROMPT` with dynamic string interpolation: `Allowed executable skill IDs: ${EXECUTABLE_CHAIN_SKILL_IDS.join(", ")}.`

# Critical files & anchors

- `src/server/skills/web-search.ts` (new) — houses the 2-step pre-fetch + synthesis logic.
- `src/server/skills/registry.ts` (`BUILT_IN_SKILLS`) — registers the new capability.
- `src/server/skill-chains/types.ts` (`EXECUTABLE_CHAIN_SKILL_IDS`) — whitelists the skill for chain use.
- `src/server/skill-chains/builder.ts` (`CHAIN_BUILDER_SYSTEM_PROMPT`) — ensures the chain planner knows the new skill exists.

# Verification

1. Export a valid `TAVILY_API_KEY` locally.
2. In the UI or via `curl`, trigger the `core.web-search-grounding` skill (or ask the Chain Builder to create a chain using it) with the prompt "Summarize the latest major news regarding SpaceX launches."
3. Wait for completion and read the generated output file.
4. **Expected**: The output markdown should explicitly reference recent SpaceX launches sourced from the web, proving the search context was successfully injected and utilized.

# Assumptions & contingencies

- **Tavily Reliability**: We assume Tavily will return relatively quickly. If Tavily fails or times out, the `fetch` will throw and fail the agent run with a clear message, rather than silently ignoring the missing context.
- **Model extraction failure**: If the initial model call fails to generate valid JSON, we fall back to searching the truncated original prompt instead of aborting the run.
