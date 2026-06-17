"use client";

import { useState } from "react";
import { ManifestBuilderForm } from "./manifest-builder-form";
import { SkillChainRunForm } from "./skill-chain-run-form";
import { SkillsBrowser } from "./skills-browser";
import type {
  AutomationFileOption,
  AutomationSkillOption,
  BuildManifestResult,
  ManifestSource,
  RunMode,
  SkillChainUiResult,
} from "./types";

type AutomationClientProps = {
  workspaceId: string;
  files: AutomationFileOption[];
  skills: AutomationSkillOption[];
  canEdit: boolean;
};

export function AutomationClient({
  workspaceId,
  files,
  skills,
  canEdit,
}: AutomationClientProps) {
  const [builderResult, setBuilderResult] =
    useState<BuildManifestResult | null>(null);
  const [chainResult, setChainResult] = useState<SkillChainUiResult | null>(
    null,
  );
  const [mode, setMode] = useState<RunMode>("new");
  const [manifestSource, setManifestSource] = useState<ManifestSource>("json");
  const [manifestPath, setManifestPath] = useState("");
  const [initialInput, setInitialInput] = useState("");
  const [resumeStatePath, setResumeStatePath] = useState("");
  const [allowScripts, setAllowScripts] = useState(false);

  return (
    <div className="grid with-top-gap">
      <div className="grid two align-start">
        <ManifestBuilderForm
          workspaceId={workspaceId}
          canEdit={canEdit}
          result={builderResult}
          onResult={setBuilderResult}
          onUseManifest={(nextManifestPath, nextInitialInput) => {
            setMode("new");
            setManifestSource("workspacePath");
            setManifestPath(nextManifestPath);
            setInitialInput(nextInitialInput);
            setChainResult(null);
          }}
        />
        <SkillChainRunForm
          workspaceId={workspaceId}
          files={files}
          canEdit={canEdit}
          result={chainResult}
          mode={mode}
          onModeChange={setMode}
          manifestSource={manifestSource}
          onManifestSourceChange={setManifestSource}
          manifestPath={manifestPath}
          onManifestPathChange={setManifestPath}
          initialInput={initialInput}
          onInitialInputChange={setInitialInput}
          resumeStatePath={resumeStatePath}
          onResumeStatePathChange={setResumeStatePath}
          allowScripts={allowScripts}
          onAllowScriptsChange={setAllowScripts}
          onResult={setChainResult}
        />
      </div>
      <SkillsBrowser skills={skills} />
    </div>
  );
}
