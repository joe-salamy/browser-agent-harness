# Browser Agent Harness Product Brief

## Working concept

Build a generic, open-source browser agent harness for knowledge-work products.

This is not a software-generation product. It is not a coding-agent IDE. The point is to bring the power of modern agent harnesses into a browser environment for every domain where users need agents to inspect materials, follow instructions, use tools, call models, and produce work product.

Good downstream products could be legal research and drafting tools, consulting analysis workspaces, marketing campaign assistants, diligence rooms, compliance review systems, procurement assistants, internal operations copilots, or any other document/data-heavy professional workflow.

The base layer must stay use-case agnostic. Legal is an intended application area, but the core should not bake in legal concepts, software-development concepts, marketing concepts, or any single profession’s workflow.

## Target audience

Primary audience: builders who want to create browser-based agent products without rebuilding the same foundation every time.

They should be able to understand:

- What the product is trying to become.
- What belongs in the generic harness layer.
- Which architecture choices are recommended by default.
- Where the project should stay neutral rather than locking users into one model, vendor, storage backend, integration ecosystem, or professional domain.

## Product goal

Create a browser-native foundation layer for building agent-powered knowledge-work products.

The harness should provide:

- A web UI for interacting with agents.
- Authenticated user access.
- Per-project workspaces for documents, data, instructions, and outputs.
- Upload, download, read, write, transform, and export workflows for project files.
- Multi-model support.
- Skill and instruction systems for reusable workflows.
- MCP connectivity for external tools, data sources, and document systems.
- Permission boundaries, logs, and auditability for agent actions.
- A lightweight baseline that contributors can understand and extend.

## Product stance

The base product should be domain-neutral.

It should not assume:

- The user is writing code.
- The output is an app.
- The workspace is a Git repository.
- The main artifact is source code.
- The domain is legal, consulting, marketing, finance, or any other vertical.

It should assume:

- Users bring documents, data, context, and goals.
- Agents need controlled access to files, tools, models, and external systems.
- Professional workflows need reviewability, traceability, and permissioning.
- Vertical products can be built with skills, templates, integrations, and domain-specific UI on top of the same generic substrate.

## MVP recommendation

The MVP should be opinionated enough to work end-to-end, but generic enough to avoid domain and platform lock-in.

Recommended MVP default:

- Frontend and app shell: Next.js with TypeScript.
- Backend API: Next.js server routes or a small separate TypeScript service.
- Storage abstraction: provider interface with one default implementation.
- Initial storage backend: S3-compatible object storage, with local filesystem storage for development.
- Database: Postgres for users, workspaces, metadata, model configs, permissions, and file indexes.
- Auth: Auth.js or another standard OAuth/email auth layer.
- Agent runtime: wrap an existing lightweight harness instead of inventing one immediately.
- Model gateway: OpenRouter first, with a provider abstraction for direct APIs later.
- File handling: native text/Markdown/JSON support in core; complex office formats handled through skills/scripts.
- MCP: first-class connection registry and per-workspace MCP permissions.
- Audit trail: record agent runs, tool calls, file writes, MCP use, and exports.

This keeps the first version buildable while preserving future portability.

## Core MVP features

### 1. Authentication

The site must support authenticated users.

MVP auth should include:

- User accounts.
- Session management.
- Workspace ownership.
- Basic access control for files, integrations, and model credentials.

Recommended default: use a standard auth library rather than building auth from scratch.

OAuth support matters because many professional workflows require linking external accounts later: document stores, knowledge bases, CRMs, practice-management systems, marketing systems, or enterprise identity providers.

### 2. Workspaces

Each workspace should have its own isolated folder structure and configuration.

A workspace should include:

- A root directory.
- Files and folders.
- Workspace-level instructions.
- Skill definitions or skill references.
- MCP connection permissions.
- Model/provider settings.
- Audit/log history.

The workspace abstraction is central. Agents should operate inside one workspace boundary by default.

Use “workspace” instead of “repository” or “case” in core naming. Domain-specific products can rename it in their UI.

### 3. File storage and document workflows

The harness must let users upload, download, store, read, write, transform, and export files.

Core MVP file support:

- `.txt`
- `.md`
- `.json`
- `.csv`
- common plain-text formats

The agent should be able to:

- Inspect a workspace tree.
- Read files through controlled APIs.
- Create files.
- Edit supported text files.
- Save generated artifacts.
- Export results back to the user.

Recommended storage design:

- Store file bytes in object storage.
- Store metadata, ownership, paths, content type, versions, and permissions in Postgres.
- Expose file operations through a narrow filesystem-like interface used by agents.

This should support knowledge-work artifacts first: memos, briefs, summaries, spreadsheets, transcripts, contracts, policies, research packets, presentations, and structured data.

### 4. Office document handling

DocX, Excel, PowerPoint, PDFs, and similar binary/structured document formats should not be first-class core editing primitives in the MVP.

Recommended default:

- Core supports upload, download, storage, metadata, and export for these files.
- Reading/extraction can be supported through skills.
- Creating/editing complex formats should be implemented through skills or scripts.

Reason: keeping DocX/XLSX/PPTX/PDF editing in the core harness increases complexity, dependencies, edge cases, and maintenance burden. A skill-based approach is more extensible and keeps the baseline lightweight.

Example skill responsibilities:

- Extract text from `.docx` or PDF.
- Convert spreadsheet sheets to CSV/JSON for agent inspection.
- Apply scripted edits to a workbook.
- Generate a new DocX from a template.
- Produce a slide outline or presentation file.
- Export structured data back into office formats.

### 5. Multi-model support

The harness must support multiple models and providers.

Recommended MVP:

- Use OpenRouter as the first provider because it exposes many models through one API shape.
- Define an internal model-provider interface from day one.
- Store provider credentials securely per user or workspace.
- Allow workspace-level default model selection.

Future provider support:

- Direct OpenAI API.
- Anthropic API.
- Google API.
- Local or self-hosted model gateways.
- Subscription-based account linking where allowed by provider terms.

Important distinction: API-key routing is straightforward. Using consumer subscriptions like ChatGPT or other hosted subscriptions may involve product, legal, and technical constraints. The harness should support account/provider abstractions without assuming every subscription can be programmatically used as an API backend.

### 6. Agent harness foundation

The product should use an existing open-source agent harness as the foundation where practical.

Recommended direction:

- Start with the lightest harness that already supports the necessary agent loop, tool execution, instructions, skills, hooks, and file operations.
- Avoid adopting a large framework unless its extension points clearly reduce browser-integration work.
- Keep coding-agent assumptions out of the core API even if the first harness came from software-development tooling.

Decision guidance:

- A lightweight Pi-style foundation is attractive if the goal is a small, understandable baseline that contributors can adapt.
- A more feature-rich OpenCode-style foundation is attractive if built-in extensibility, provider support, and agent workflows are more important than minimalism.
- General agent frameworks such as Mastra, LangGraph, or the Vercel AI SDK may be useful in specific layers, but the web product should not become a thin demo around any one framework.
- The MVP should wrap the harness behind an internal runtime interface so the web product is not permanently coupled to one implementation.

Recommended MVP stance: prefer lightweight and composable first. Add heavier harness capabilities only when the browser product needs them.

### 7. Skills, instructions, and hooks

The harness should support modern agent-harness features without tying them to a single domain.

Core concepts:

- Workspace instructions.
- User-level and workspace-level rules.
- Skills that package reusable workflows, scripts, prompts, tools, and instructions.
- Hooks for lifecycle events.
- Tool permissions and sandboxing.

Useful hooks:

- Before model call.
- After model response.
- Before tool execution.
- After file write.
- Before workspace export/download.
- On MCP connection use.

Skills should be the preferred extension point for specialized workflows such as legal document review, consulting research synthesis, market analysis, office document editing, import/export pipelines, or domain-specific integrations.

### 8. MCP integrations

MCP support should be a first-class product feature.

MVP support should include:

- Register an MCP server connection.
- Attach MCP connections to a workspace.
- Control which agents/tools can use each connection.
- Surface available MCP tools/resources to the agent runtime.
- Log MCP use for review and auditability.

Clear first use case: external document and data access.

Examples:

- Google Drive-like document stores.
- Notion-style workspaces.
- Cloud object storage.
- Internal knowledge bases.
- CRMs.
- Marketing systems.
- Practice-management systems.
- Research databases.
- Project management tools.

The product should avoid hard-coding one provider as the only path. MCP should be the generic integration layer.

## Architecture recommendation

### Default architecture

Use a pragmatic web-first stack:

- Next.js and TypeScript for UI and application routes.
- Postgres for relational state.
- S3-compatible object storage for workspace files.
- Redis or a queue later if background jobs become necessary.
- A separate agent worker process once agent execution outgrows request/response lifetimes.

This keeps the MVP simple while leaving room for a more scalable deployment model.

### Compute model

Recommended initial model:

- Web app handles UI, auth, workspace metadata, and file APIs.
- Agent execution runs in isolated server-side workers.
- Workers access files through the workspace filesystem abstraction.
- Workers call models through provider adapters.
- Workers access MCP through a controlled connection layer.

Avoid running untrusted agent code directly inside the main web server process.

### Deployment model

Recommended default: support simple deployment first, but design around portable interfaces.

Good MVP path:

- Vercel or similar platform for the web app.
- Managed Postgres.
- S3-compatible storage.
- Separate worker deployment for agent execution if needed.

AWS is a strong long-term option, but it is likely too complex as the only recommended starting point. The architecture should not assume AWS-only services. S3-compatible storage and Postgres keep the design portable.

## Language recommendation

Do not write the whole product in Rust for the MVP.

Recommended default:

- TypeScript for the web app, API, model adapters, auth, and orchestration.
- Rust only for isolated performance-sensitive components if a real bottleneck appears.

Reason:

- The product is browser-first.
- Most complexity is product architecture, auth, storage, provider integration, sandboxing, permissions, and agent UX.
- TypeScript aligns with the web stack and reduces contributor friction.
- Rust can improve speed and safety in specific subsystems, but rewriting the full app in Rust would slow MVP delivery without proving a user-facing benefit.

## What belongs in core vs skills

Core should provide the stable platform primitives:

- Auth.
- Workspaces.
- File storage.
- Basic text/structured-data editing.
- Agent runtime interface.
- Model provider interface.
- Instructions/rules.
- Skill loading/execution.
- MCP connection management.
- Permission boundaries.
- Audit logs.
- Export/download flows.

Skills should provide specialized behavior:

- Legal document review.
- Consulting research synthesis.
- Marketing campaign workflows.
- Financial or diligence analysis.
- Office document parsing/editing.
- Data import/export.
- Provider-specific workflows.
- Domain-specific automation.
- Reusable scripts.
- Advanced file transformations.

This split keeps the repository lightweight while making it extensible.

## Non-goals for the MVP

The MVP should not try to solve everything at once.

Defer:

- Vertical-specific legal product features in core.
- Vertical-specific marketing or consulting product features in core.
- Full collaborative editing.
- Advanced billing and subscription management.
- Native browser editing for every binary document format.
- A custom model gateway replacing existing providers.
- A fully custom agent framework.
- AWS-only infrastructure templates.
- Desktop app packaging.
- Software app generation as a core workflow.
- Git-first repository workflows as a core assumption.

## Resolved implementation decisions

These decisions should guide implementation planning:

1. Wrap a lightweight Pi-style harness first.
   - Rationale: a small, composable harness is the best fit for a domain-neutral browser product. It reduces the risk of leaking coding-agent assumptions such as repositories, terminals, source files, and app generation into the core API.
   - Implementation guardrail: expose the harness through an internal agent-runtime interface so the product can replace or augment the runtime later without changing workspace, file, skill, model, MCP, or audit APIs.

2. Run skills and file-transform scripts in isolated server-side workers.
   - Rationale: skills need enough power to parse files, transform data, call tools, and produce artifacts, but they should not execute inside the main web server process or receive broad filesystem/network access by default.
   - Minimum sandbox: isolated worker process or container; workspace-scoped filesystem API; network access off by default; explicit tool and MCP permissions; CPU, memory, wall-clock, and output-size limits; structured logs for every file write, model call, MCP call, and export.

3. Start workspace versioning with file snapshots.
   - Rationale: immutable file snapshots plus metadata are simple, reviewable, storage-backend neutral, and aligned with audit requirements. This avoids making Git or a specific object-storage provider part of the product model.
   - Implementation guardrail: store file bytes in object storage and store version metadata, authorship, timestamps, run IDs, content type, prior version, and permissions in Postgres.

4. Encrypt user-supplied API keys with envelope encryption and scoped credential records.
   - Rationale: agents need server-side access to provider credentials, but plaintext keys should never be exposed after save and credential blast radius should stay narrow.
   - Recommended model: encrypt each credential at rest with per-record data keys protected by an environment KMS or master key; scope credentials to user, workspace, provider, and permitted agent/runtime use; support rotation and revocation; log credential use without logging secret values.

5. Support remote HTTP/SSE MCP connections first, with stdio MCP for development and self-hosted use.
   - Rationale: HTTP/SSE fits a hosted browser product and remote integrations, while stdio keeps the open-source developer path compatible with today’s local MCP server ecosystem.
   - Implementation guardrail: all MCP connections go through the same registry, workspace permission model, tool allowlists, user consent surface, and audit log.

6. Prove the neutral product with a demo suite, not a single narrow workflow.
   - Rationale: the product should feel universal and capable rather than like a disguised legal, marketing, compliance, or consulting app. The first release should show several domain-neutral workflows built from the same workspace, file, skill, MCP, model, permission, and audit primitives.
   - Demo suite:
     1. Research packet synthesis: upload Markdown, PDF/DocX, and CSV files; set workspace instructions; extract text and structured data through skills; generate a summary, findings table, and recommended next steps.
     2. Policy or compliance review: upload policies, evidence files, and a checklist; have the agent identify gaps, source support, and produce a review memo.
     3. Marketing campaign brief: upload product notes, audience notes, brand guidance, and performance data; have the agent produce a campaign brief, content angles, and channel recommendations.
     4. Internal operations knowledge-base answer: connect one MCP document source; let the agent cite retrieved internal material and produce an answer or operating procedure with logged tool use.
   - Shared proof points: user signs in, creates a workspace, uploads files, configures instructions, runs skills, switches model provider, connects an MCP source, reviews generated files, inspects logs, and downloads/export results.

7. Build legal document review as the first vertical demo on top of the generic core.
   - Rationale: legal is the strongest proof point for sensitive documents, source grounding, citations, permissions, repeatable skills, reviewability, and audit trails.
   - Implementation guardrail: legal concepts must live in optional skills, templates, and vertical UI layers. The core product should not introduce legal-specific names such as matter, pleading, clause, statute, jurisdiction, or citation rule as platform primitives.

## Suggested first demos

The neutral MVP should include a small demo suite that uses the same generic substrate across different knowledge-work patterns:

1. Research packet synthesis.
2. Policy or compliance review.
3. Marketing campaign brief.
4. Internal operations knowledge-base answer through MCP.

Each demo should prove the same core thesis: a browser-based agent harness can manage professional workspaces, use instructions and skills, call multiple models, connect to external systems, preserve permission boundaries, log agent actions, and produce downloadable work product without requiring a local install or assuming a specific domain.

A legal document-review demo should follow as the first vertical layer. It can use the same base layer for contract review, case chronology, research memo drafting, due-diligence extraction, or source-grounded drafting. That should validate the extension model, not redefine the core product as legal-only.

## One-sentence positioning

An open-source, browser-native baseline for building domain-specific agent products with workspaces, files, skills, MCP integrations, permissions, audit logs, and multi-model execution.
