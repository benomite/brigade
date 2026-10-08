// Les faits de la pass : ce qu'elle juge d'une livraison, ce qu'elle en décide,
// et le grant sous lequel elle merge.

// La seule action qu'un grant couvre au jalon 1.
export type ActionDeGrant = "merge";

// Ce que les gates du projet ont dit. `skipped` : non jouées — le worktree
// n'était pas celui qui a été poussé.
export type Gates = {
  outcome: "green" | "red" | "timeout" | "skipped";
  code: number | null;
  // Les lignes `FAIL` de leur sortie, et sa fin.
  failures: string[];
  tail: string;
};

// Un job de CI, ou un statut de commit.
export type Check = { name: string; outcome: "green" | "red" | "pending"; conclusion: string; url: string | null };

// Ce que la CI du commit a dit. `none` : le commit n'a aucun check — ni vert ni
// rouge, le verdict repose alors sur les seules gates. `skipped` : non lue, les
// gates étaient déjà rouges.
export type CI = { outcome: "green" | "red" | "none" | "skipped"; checks: Check[] };

export type Verdict = "green" | "red";

// Pourquoi la pass s'arrête sur une livraison verte sans la merger.
export const SANS_GRANT = "no-grant";
export const JUGES_MODIFIES = "judge-modified";

// Pourquoi la pass remonte au chef sans renvoyer au cook.
export type MotifDeRemontee = "returns-exhausted" | "wrong-base" | "no-gates" | "ci-silent";

export type FaitPass =
  // Les commandes du chef. Sans `grant.activated`, il n'y a pas de grant.
  | { type: "grant.activated"; payload: { action: ActionDeGrant } }
  | { type: "grant.revoked"; payload: { action: ActionDeGrant } }
  // La pass prend une livraison : le run, sa PR, le commit qu'elle va juger.
  | { type: "pass.started"; payload: { run: string; pr: string; number: number; sha: string } }
  // Le verdict, avec ce qui l'a produit. `findings` : ce qui repart au cook
  // quand il est rouge. `judgeModified` : la livraison touche à ses propres
  // juges (gates, setup, workflows).
  | {
      type: "pass.judged";
      payload: { run: string; pr: string; number: number; sha: string; verdict: Verdict; gates: Gates; ci: CI; findings: string[]; judgeModified: boolean };
    }
  // L'intention de merger, écrite avant l'appel à GitHub : c'est l'usage du
  // grant. `verdict` : le numéro de séquence du `pass.judged` qui l'autorise.
  | { type: "grant.used"; payload: { action: ActionDeGrant; pr: string; number: number; sha: string; base: string; verdict: number } }
  // Le résultat. `by` : la pass, ou quelqu'un d'autre (le chef, à la main).
  // `reconciled` : constaté après coup, le runtime étant mort entre l'intention
  // et le résultat.
  | { type: "merge.done"; payload: { pr: string; sha: string | null; by: "pass" | "outside"; reconciled: boolean } }
  | { type: "merge.failed"; payload: { pr: string; sha: string; reason: string } }
  // Verte, mais non mergée : la pass s'arrête là et dit pourquoi.
  | { type: "pass.held"; payload: { reason: string } }
  // Rouge : les findings repartent à un cook, dans le worktree de la livraison.
  | { type: "pass.returned"; payload: { n: number; findings: string[] } }
  // La pass cesse de renvoyer, ou refuse de juger : au chef.
  | { type: "pass.escalated"; payload: { reason: MotifDeRemontee } };
