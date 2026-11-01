// What the cadence reads on GitHub: the issues the role filed today, and the
// outside issues overdue for an answer. Its own GitHub client: the poll of the
// open issues keeps its own ETag, apart from the manager's.
import { DE_CONFIANCE } from "../../alimenter.ts";
import type { GitHub, IssueOuverte } from "../../github.ts";
import { DEPOSE_PAR } from "./role.ts";

// An outside issue is overdue once it has waited this long with no answer.
export const RETARD_MS = 24 * 3_600_000;

// The issues carrying `filed-by:product` created on the UTC day `jour`, by the
// role or by hand: the cap counts what is on GitHub, not what the log says.
export async function deposesLe(github: Pick<GitHub, "issuesDepuis">, jour: string): Promise<number> {
  const debut = `${jour}T00:00:00Z`;
  const issues = await github.issuesDepuis(debut);
  return issues.filter((issue) => issue.labels.includes(DEPOSE_PAR) && issue.createdAt >= debut && issue.createdAt.slice(0, 10) === jour).length;
}

export type LecteurDesOuvertes = {
  // The open issues, from the last poll that answered.
  ouvertes(): Promise<IssueOuverte[]>;
  // Those opened by someone other than the chef, more than a day ago, that no
  // one with a hand on the repository has answered yet.
  enRetard(maintenant: Date): Promise<number[]>;
};

export function lecteurDesOuvertes(github: Pick<GitHub, "ouvertes" | "commentaires">): LecteurDesOuvertes {
  let connues: IssueOuverte[] = [];
  // An issue answered stays answered: its comments are read once per change.
  const reponses = new Map<number, { updatedAt: string; repondue: boolean }>();
  const ouvertes = async () => {
    const sondage = await github.ouvertes();
    if (!sondage.inchange) {
      connues = sondage.issues.filter((issue) => issue.pr !== true);
      sondage.confirmer();
    }
    return connues;
  };
  return {
    ouvertes,
    async enRetard(maintenant) {
      const issues = await ouvertes();
      const retard: number[] = [];
      for (const issue of issues) {
        if (DE_CONFIANCE.includes(issue.association)) continue;
        if (maintenant.getTime() - Date.parse(issue.createdAt) < RETARD_MS) continue;
        // A label is an answer: only a hand on the repository can pose one.
        if (issue.labels.length > 0) continue;
        let lue = reponses.get(issue.number);
        if (lue?.updatedAt !== issue.updatedAt) {
          const commentaires = await github.commentaires(issue.number);
          // The kitchen's roles comment under their GitHub App: a bot, not a member.
          const repond = ({ association, author }: { association: string; author: string }) => DE_CONFIANCE.includes(association) || author.endsWith("[bot]");
          lue = { updatedAt: issue.updatedAt, repondue: commentaires.some(repond) };
          reponses.set(issue.number, lue);
        }
        if (!lue.repondue) retard.push(issue.number);
      }
      return retard;
    },
  };
}
