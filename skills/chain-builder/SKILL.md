---
name: chain-builder
description: Creates JSON skill-chain manifests from a user goal.
chainRunnable: false
---

Author a SkillChainManifest JSON object for the user goal. Return JSON only.

Use version 1. Use lowercase slug ids. Each step must name exactly one available chain-runnable skill id. Use outputPath values under chains/<manifest-id>/{{runId}}/{{stepIndex}}-<step-id>.md and only these template tokens: {{runId}}, {{stepId}}, and {{stepIndex}}.
