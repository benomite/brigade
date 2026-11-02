// The CI duration of the last merges, for the `measures` report: from the start of the first
// check of the merge commit to the end of the last. Read-only; the GitHub read is injected,
// so the tests replay recorded answers and never touch the network.
import { execFile } from "node:child_process";

export const CI_TARGET_S = 60;
export const CI_MERGES = 10;

export type GetJson = (path: string) => Promise<unknown>;
export type CiMerge = { pr: number; seconds: number };
export type CiDuration = { merges: CiMerge[] } | { unavailable: string };

type RawPull = { number: number; merged_at: string | null; merge_commit_sha: string | null };
type RawCheck = { started_at: string | null; completed_at: string | null };

export function durationSeconds(checks: RawCheck[]): number | null {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const check of checks) {
    if (!check.started_at || !check.completed_at) continue;
    starts.push(Date.parse(check.started_at));
    ends.push(Date.parse(check.completed_at));
  }
  if (starts.length === 0) return null;
  const seconds = (Math.max(...ends) - Math.min(...starts)) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export async function measureCiDuration(repo: string, get: GetJson, count = CI_MERGES): Promise<CiDuration> {
  try {
    const pulls = (await get(`repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`)) as RawPull[];
    if (!Array.isArray(pulls)) return { unavailable: "unreadable answer from GitHub" };
    const merged = pulls
      .filter((pull) => pull.merged_at && pull.merge_commit_sha)
      .sort((a, b) => Date.parse(b.merged_at!) - Date.parse(a.merged_at!))
      .slice(0, count);
    const merges: CiMerge[] = [];
    for (const pull of merged) {
      const answer = (await get(`repos/${repo}/commits/${pull.merge_commit_sha}/check-runs?per_page=100`)) as { check_runs?: RawCheck[] };
      const seconds = durationSeconds(answer?.check_runs ?? []);
      if (seconds !== null) merges.push({ pr: pull.number, seconds });
    }
    return { merges };
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message.split("\n")[0]! : String(error) };
  }
}

const format = (seconds: number) => `${Math.round(seconds)} s`;

export function describeCiDuration(result: CiDuration, count = CI_MERGES): string[] {
  const title = `CI duration of the last ${count} merges`;
  if ("unavailable" in result) return [`${title}: unavailable (${result.unavailable})`];
  if (result.merges.length < count) return [`${title}: only ${result.merges.length} merge${result.merges.length === 1 ? "" : "s"} available`];
  const worst = Math.max(...result.merges.map((merge) => merge.seconds));
  const mid = median(result.merges.map((merge) => merge.seconds));
  return [
    title,
    ...result.merges.map((merge) => `  #${merge.pr}  ${format(merge.seconds)}${merge.seconds > CI_TARGET_S ? "  OVER TARGET" : ""}`),
    `  median ${format(mid)} (target ${CI_TARGET_S} s)${mid > CI_TARGET_S ? "  OVER TARGET" : ""}`,
    `  worst ${format(worst)}`,
  ];
}

export function ghGet(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    execFile("gh", ["api", path], { maxBuffer: 64 * 1024 * 1024, timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`gh api failed: ${stderr.trim() || error.message}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error("unreadable answer from GitHub")); }
    });
  });
}

// The section as `measures` prints it: nothing when the repository is not declared.
export async function ciDurationSection(repo: string | undefined, get: GetJson = ghGet): Promise<string[]> {
  if (!repo) return [];
  return describeCiDuration(await measureCiDuration(repo, get));
}
