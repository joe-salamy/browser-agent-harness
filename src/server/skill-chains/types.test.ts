import { describe, expect, it } from "vitest";
import {
  EXECUTABLE_CHAIN_SKILL_IDS,
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
      id: "market-research",
      skillId: "core.research-synthesis",
      prompt: "Research the idea.",
      outputPath:
        "chains/research-plan-implementation/{{runId}}/{{stepIndex}}-market-research.md",
    },
  ],
};

describe("skill chain manifest validation", () => {
  it("accepts a valid builder-style manifest", () => {
    expect(parseSkillChainManifest(validManifest).steps[0]?.skillId).toBe(
      EXECUTABLE_CHAIN_SKILL_IDS[0],
    );
  });

  it("accepts web search grounding as an executable step", () => {
    expect(
      parseSkillChainManifest({
        ...validManifest,
        steps: [
          { ...validManifest.steps[0], skillId: "core.web-search-grounding" },
        ],
      }).steps[0]?.skillId,
    ).toBe("core.web-search-grounding");
  });

  it("rejects chain builder as an executable step", () => {
    expect(() =>
      parseSkillChainManifest({
        ...validManifest,
        steps: [{ ...validManifest.steps[0], skillId: "core.chain-builder" }],
      }),
    ).toThrow("Invalid skill chain manifest.");
  });

  it("rejects duplicate step ids", () => {
    expect(() =>
      parseSkillChainManifest({
        ...validManifest,
        steps: [
          validManifest.steps[0],
          { ...validManifest.steps[0], prompt: "Research again." },
        ],
      }),
    ).toThrow("Invalid skill chain manifest.");
  });

  it("rejects unsafe output path templates at the manifest boundary", () => {
    expect(() =>
      parseSkillChainManifest({
        ...validManifest,
        steps: [{ ...validManifest.steps[0], outputPath: "../escape.md" }],
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
            outputPath: "chains/example/{{runId}}/{{constructor}}.md",
          },
        ],
      }),
    ).toThrow("Invalid skill chain manifest.");
  });

  it("rejects unknown output path template tokens", () => {
    expect(() =>
      renderSkillChainOutputPath({
        template: "chains/example/{{runId}}/{{constructor}}.md",
        runId: "run-1",
        stepId: "market-research",
        stepIndex: 0,
      }),
    ).toThrow(
      "Unsupported template token in outputPath for step market-research.",
    );
  });
});

describe("chain builder JSON extraction", () => {
  it("accepts exact JSON object text", () => {
    expect(extractJsonObjectText(JSON.stringify(validManifest))).toBe(
      JSON.stringify(validManifest),
    );
  });

  it("accepts one json fenced block", () => {
    const json = JSON.stringify(validManifest, null, 2);
    expect(extractJsonObjectText("```json\n" + json + "\n```")).toBe(json);
  });

  it("rejects prose around JSON", () => {
    expect(() =>
      extractJsonObjectText(
        `Here is the manifest:\n${JSON.stringify(validManifest)}`,
      ),
    ).toThrow("Expected a single JSON object.");
  });
});
