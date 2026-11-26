// The quality figures the autonomy policy reads in the runtime (politique.ts, #4380), in the shape of
// autonomie/chiffres/chiffres.ts, over the last 30 days:
//   - the reverts: the commits of the base, as the project's clone fetches it, that carry git's trailer
//     `This reverts commit <sha>` (`commitsRevertes`), each with the tickets its reverted commits cite — `#12` in
//     their subject, or the `cook/<n>-` branch a merge commit names (`ticketDuMerge`);
//   - the escaped bugs: the issues GitHub gives as changed in the period, labelled `bug`, created in it, each with
//     the tickets its title or body cites.
// A read that fails throws: the policy then moves nothing, and the runtime says why.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ticketDuMerge } from "../../closer-github-passe/derive-github.ts";
import type { Depot as DepotDeStation } from "../../depot.ts";
import type { GitHub } from "../../github.ts";
import { commitsRevertes, LABEL_BUG, type BugEchappe, type Revert } from "../chiffres/chiffres.ts";
import type { ChiffresDeQualite } from "./politique.ts";

const PERIODE_MS = 30 * 24 * 3600_000;
const TICKET = /#(\d+)\b/g;
const cites = (texte: string): number[] => Array.from(texte.matchAll(TICKET), ([, n]) => Number(n));

export type SourcesDeLaQualite = {
  depot: Pick<DepotDeStation, "rapatrier">;
  clone: string;
  base: string;
  // `owner/name`: the repository the bugs are named in.
  depotGitHub: string;
  github: Pick<GitHub, "issuesDepuis">;
  env?: NodeJS.ProcessEnv;
};

export async function lireLaQualite({ depot, clone, base, depotGitHub, github, env = process.env }: SourcesDeLaQualite, maintenant: Date): Promise<ChiffresDeQualite> {
  const depuis = new Date(maintenant.getTime() - PERIODE_MS);
  const git = async (...args: string[]) => String((await promisify(execFile)("git", args, { cwd: clone, env: { ...env, GIT_OPTIONAL_LOCKS: "0" }, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024 * 1024 })).stdout);
  await depot.rapatrier();
  const reverts: Revert[] = [];
  const journal = await git("log", `--since=${depuis.toISOString()}`, "--format=%H%x1f%B%x1e", `origin/${base}`);
  for (const entree of journal.split("\x1e")) {
    const [sha = "", message = ""] = entree.trim().split("\x1f");
    const revertes = commitsRevertes(message);
    if (sha === "" || revertes.length === 0) continue;
    const tickets = new Set<number>();
    for (const reverte of revertes) {
      // A reverted commit the clone does not hold cites no ticket.
      const sujet = await git("log", "-1", "--format=%s", reverte).catch(() => "");
      for (const ticket of [...cites(sujet), ticketDuMerge(sujet)]) if (ticket !== null) tickets.add(ticket);
    }
    reverts.push({ depot: depotGitHub, sha, revertes, tickets: [...tickets].sort((a, b) => a - b) });
  }
  const bugsEchappes: BugEchappe[] = (await github.issuesDepuis(depuis.toISOString()))
    .filter(({ labels, createdAt }) => labels.map((label) => label.toLowerCase()).includes(LABEL_BUG) && Date.parse(createdAt) >= depuis.getTime())
    .flatMap(({ number, title, body }) => {
      const tickets = [...new Set(cites(`${title}\n${body}`))].filter((ticket) => ticket !== number).sort((a, b) => a - b);
      return tickets.length === 0 ? [] : [{ depot: depotGitHub, bug: number, titre: title, url: `https://github.com/${depotGitHub}/issues/${number}`, tickets }];
    });
  return { bugsEchappes, reverts };
}
