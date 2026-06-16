"use client";

import type { AutomationSkillOption } from "./types";

export function SkillsBrowser({ skills }: { skills: AutomationSkillOption[] }) {
  return (
    <section className="card">
      <h2>Available skills</h2>
      <p className="muted">
        Chain-runnable skills can be referenced by skill-chain manifests.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Source</th>
            <th scope="col">Description</th>
            <th scope="col">Chain runnable</th>
            <th scope="col">Entrypoint</th>
            <th scope="col">References</th>
            <th scope="col">Scripts</th>
            <th scope="col">Required permissions</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((skill) => (
            <tr key={skill.id}>
              <td>{skill.id}</td>
              <td>{skill.source}</td>
              <td>{skill.description}</td>
              <td>{skill.chainRunnable ? "yes" : "no"}</td>
              <td>{skill.hasEntrypoint ? "yes" : "no"}</td>
              <td>{skill.referenceCount}</td>
              <td>{skill.scriptCount}</td>
              <td>
                {skill.requiredPermissions.length > 0
                  ? skill.requiredPermissions.join(", ")
                  : "None"}
              </td>
            </tr>
          ))}
          {skills.length === 0 ? (
            <tr>
              <td colSpan={8}>No skills are available.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
