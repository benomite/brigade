// The closer's correction ticket for a project's time drift (#2363).
// The station may already have opened a correction ticket at once when the max was passed
// (#2336, #2337). So: look for an open correction ticket of the project first; if there is
// one, complete it with the finding; otherwise open one. Never two open at once.
//
// Self-contained: it takes a finding (`closer-github-durees`) and a GitHub client, and only
// writes to GitHub. It asks the chef for nothing.

import { createHash } from "node:crypto";
import type { Finding } from "../closer-github-durees/derive.ts";

export const CORRECTION_LABEL = "correction";

export type CorrectionIssue = { number: number; title: string; body: string; state: "open" | "closed" };

// What this module needs of GitHub. The caller wires it to the real one.
export type GithubClient = {
  // The issues carrying `label`, in any state; the module keeps the open ones.
  listIssues(query: { label: string }): Promise<CorrectionIssue[]>;
  createIssue(issue: { title: string; body: string; labels: string[] }): Promise<{ number: number }>;
  updateIssueBody(number: number, body: string): Promise<void>;
};

export type CorrectionResult = { action: "opened" | "completed" | "unchanged"; number: number };

const projectMarker = (project: string) => `<!-- brigade:correction project=${encodeURIComponent(project)} -->`;

// One finding writes one block; the same finding (same cause, same numbers) is the same block.
function findingMarker(finding: Finding): string {
  const digest = createHash("sha256").update(JSON.stringify([finding.cause, finding.numbers])).digest("hex").slice(0, 12);
  return `<!-- brigade:closer-finding ${digest} -->`;
}

function findingBlock(finding: Finding): string {
  const n = finding.numbers;
  return [
    findingMarker(finding),
    `**Closer finding — ${finding.cause}**`,
    "",
    finding.sentence,
    "",
    `- median ticket: ${Math.round(n.medianSeconds.before)} s → ${Math.round(n.medianSeconds.after)} s`,
    `- ${n.part}: ${Math.round(n.partMedianSeconds.before)} s → ${Math.round(n.partMedianSeconds.after)} s`,
    `- tickets compared: ${n.tickets.before} then ${n.tickets.after}${n.since === null ? "" : `, since ${n.since}`}`,
  ].join("\n");
}

function openingBody(project: string, finding: Finding): string {
  return [projectMarker(project), `The tickets of ${project} take longer. Correct the cause below.`, "", findingBlock(finding)].join("\n");
}

const hasProject = (issue: CorrectionIssue, project: string) => issue.body.includes(projectMarker(project));

export async function writeCorrection(project: string, finding: Finding, github: GithubClient): Promise<CorrectionResult> {
  const issues = await github.listIssues({ label: CORRECTION_LABEL });
  // A closed ticket blocks nothing; with several open (should not happen), the oldest takes it.
  const open = issues.filter((issue) => issue.state === "open" && hasProject(issue, project)).sort((a, b) => a.number - b.number)[0];
  if (open === undefined) {
    const created = await github.createIssue({
      title: `Correct the time drift of ${project}: ${finding.cause}`,
      body: openingBody(project, finding),
      labels: [CORRECTION_LABEL],
    });
    return { action: "opened", number: created.number };
  }
  if (open.body.includes(findingMarker(finding))) return { action: "unchanged", number: open.number };
  await github.updateIssueBody(open.number, `${open.body.trimEnd()}\n\n${findingBlock(finding)}\n`);
  return { action: "completed", number: open.number };
}
