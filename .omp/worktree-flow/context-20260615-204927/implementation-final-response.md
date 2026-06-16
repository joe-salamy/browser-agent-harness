Done.

Commit:
- `8b7a84b38a80ae5b43b10c3a51c837ba32677072`
- Message: `Implement plan`

Changed and committed:
- Added `core.web-search-grounding`
- Added Tavily-backed query generation/search grounding skill
- Registered skill in registry
- Added chain allowlist support
- Made chain-builder prompt derive executable IDs dynamically
- Added focused unit coverage
- Added `TAVILY_API_KEY=""` to `.env.example`

Verification:
- `npm test -- src/server/skills/web-search.test.ts src/server/skills/registry.test.ts src/server/skill-chains/builder.test.ts src/server/skill-chains/types.test.ts` â†’ 22 passed
- `npx tsc --noEmit` â†’ passed
- `npm run lint` â†’ passed

Skipped:
- Live Tavily/UI verification; no real `TAVILY_API_KEY` available.

Handoff:
- Wrote `.omp/handoff/implementation-summary.md`
- Left `.omp/handoff/` and `.omp/worktree-flow/` untracked as required.
