import { describe, expect, it } from "vitest";
import {
  extractJsonObjectText,
  parseSkillChainManifest,
  renderSkillChainOutputPath,
} from "./types";

const validManifest = {
  version: 1,
  id: "research-plan-implementation",
  name: "Research Plan Implementation",
  steps: [
    {
      id: "summarize",
      skillId: "server.research-synthesis",
      prompt: "Summarize the sources.",
      outputPath: "chains/{{runId}}/{{stepIndex}}-{{stepId}}.md",
    },
  ],
};

describe("skill chain manifest validation", () => {
  it("accepts a valid builder-style manifest", () => {
    expect(parseSkillChainManifest(validManifest).steps[0]?.skillId).toBe(
      "server.research-synthesis",
    );
  });

  it("accepts syntactically valid dynamic directory skill ids", () => {
    const manifest = {
      ...validManifest,
      steps: [
        { ...validManifest.steps[0], skillId: "workspace.my-skill" },
        {
          id: "server-step",
          skillId: "server.other-skill",
          prompt: "Run server skill.",
          outputPath: "chains/{{runId}}/02-server-step.md",
        },
      ],
    };

    expect(parseSkillChainManifest(manifest).steps.map((step) => step.skillId)).toEqual([
      "workspace.my-skill",
      "server.other-skill",
    ]);
  });

  it("rejects syntactically invalid skill ids", () => {
    expect(() =>
      parseSkillChainManifest({
        ...validManifest,
        steps: [{ ...validManifest.steps[0], skillId: "toString" }],
      }),
    ).toThrow("Invalid skill chain manifest.");
  });

  it("allows server.chain-builder at schema level for runner and builder validation", () => {
    expect(
      parseSkillChainManifest({
        ...validManifest,
        steps: [{ ...validManifest.steps[0], skillId: "server.chain-builder" }],
      }).steps[0]?.skillId,
    ).toBe("server.chain-builder");
  });

  it("rejects duplicate step ids", () => {
    expect(() =>
      parseSkillChainManifest({
        ...validManifest,
        steps: [validManifest.steps[0], { ...validManifest.steps[0] }],
      }),
    ).toThrow("Invalid skill chain manifest.");
  });

  it("rejects unsafe output path templates at the manifest boundary", () => {
    expect(() =>
      parseSkillChainManifest({
        ...validManifest,
        steps: [
          { ...validManifest.steps[0], outputPath: "../bad/{{runId}}.md" },
        ],
      }),
    ).toThrow("Invalid skill chain manifest.");
  });

  it("rejects inherited output path template tokens at the manifest boundary", () => {
    expect(() =>
      parseSkillChainManifest({
        ...validManifest,
        steps: [
          {
            ...validManifest.steps[0],
            outputPath: "chains/{{runId}}/{{toString}}.md",
          },
        ],
      }),
    ).toThrow("Invalid skill chain manifest.");
  });

  it("rejects unknown output path template tokens", () => {
    expect(() =>
      renderSkillChainOutputPath({
        template: "chains/{{runId}}/{{unknown}}.md",
        runId: "run-1",
        stepId: "step-1",
        stepIndex: 0,
      }),
    ).toThrow("Unsupported template token in outputPath for step step-1.");
  });
});

describe("chain builder JSON extraction", () => {
  it("accepts exact JSON object text", () => {
    expect(extractJsonObjectText('{"version":1}')).toBe('{"version":1}');
  });

  it("accepts one json fenced block", () => {
    expect(extractJsonObjectText('```json\n{"version":1}\n```')).toBe(
      '{"version":1}',
    );
  });

  it("rejects prose around JSON", () => {
    expect(() => extractJsonObjectText('Here is JSON: {"version":1}')).toThrow(
      "Expected a single JSON object.",
    );
  });
});
