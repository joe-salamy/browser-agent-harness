# Audit Summary

## Worktree

- Path: `C:/Users/joesa/Code/browser-agent-harness-context`
- Branch: `feature/context`
- Base used for diff: `master` at merge-base `d43eff9d27b1d82e66467225a263b8fdfc14e77d`

## Prior implementation summary

The prior pass added `core.web-search-grounding`, registered it as a built-in skill, added it to executable skill-chain allowlists, updated chain-builder prompt construction, added `TAVILY_API_KEY` to `.env.example`, and verified focused skill/registry/chain tests plus typecheck/lint.

## Skills loaded

- `audit-worktree`: required audit workflow.
- `agent-mcp-safety-reviewer`: prompt construction, model calls, runtime trust boundaries, and tool/skill permission risks.
- `secret-credential-security-reviewer`: Tavily API key placement and non-leakage.
- `typescript-strict-maintainer`: exported runtime request type and strict boundary handling.
- `vitest-playwright-quality-engineer`: focused regression test coverage.

## Issues found and fixes applied

1. Tavily authentication used `api_key` in the JSON body. Current Tavily endpoint docs require bearer authentication. Fixed `src/server/skills/web-search.ts` to send `Authorization: Bearer <key>` and removed `api_key` from the request body.
2. Tavily fetch had no timeout and could hang skill execution. Added a 30-second `AbortSignal.timeout(...)` and normalized timeout/network/schema failures to predictable messages.
3. Tavily HTTP errors included the generated query text in the thrown error. Sanitized status errors so private prompt-derived queries are not persisted in chain state or surfaced in internal error text.
4. Web search results were concatenated into the minimal runtime `prompt` field, which the runtime system prompt treats as the user's trusted task. Added `AgentSupplementalContext`, serialized `supplementalContexts` as untrusted JSON data in `minimalAgentRuntime`, and changed web search grounding to pass the original prompt unchanged while putting formatted web results in `supplementalContexts`.

## Files changed by audit

- `src/server/agents/runtime.ts`
- `src/server/agents/minimal-runtime.ts`
- `src/server/agents/minimal-runtime.test.ts`
- `src/server/skills/web-search.ts`
- `src/server/skills/web-search.test.ts`

## Commit

- Audit fix commit: `2a1c2ad23ec5ad1daf85607a886735c83b869f9a` (`Fix audit findings`)

## Verification

- `npm run test -- src/server/agents/minimal-runtime.test.ts src/server/skills/web-search.test.ts src/server/skills/registry.test.ts src/server/skill-chains/builder.test.ts src/server/skill-chains/types.test.ts` — passed, 5 files / 26 tests.
- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.

## Skipped checks

- Live Tavily/UI verification was not run because no real `TAVILY_API_KEY` was available and live external results depend on third-party service state.
- Full test suite was not run; focused runtime/skill/registry/chain tests plus typecheck/lint cover the changed seams.

## Residual risks

- The runtime still depends on the final model obeying the untrusted supplemental-context boundary; the boundary is now explicit in the system prompt and JSON shape, but prompt-injection risk from hostile web content cannot be eliminated entirely.
