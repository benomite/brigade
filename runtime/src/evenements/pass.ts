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
// rouge, le verdict repose alors sur les seules gates. `skipped` : non lue — les
// gates étaient déjà rouges, ou le reviewer l'était avant qu'elle ne conclue.
export type CI = { outcome: "green" | "red" | "none" | "skipped"; checks: Check[] };

export type Verdict = "green" | "red";

// Un constat du reviewer. `blocking` : la livraison ne passe pas telle quelle,
// il repart au cook. `remark` : le chef le lit, rien n'est retenu.
export type Finding = { severity: "blocking" | "remark"; file: string | null; text: string };

// Ce que le reviewer a dit d'une livraison. `skipped` : non appelé — les gates
// étaient déjà rouges, ou la branche en conflit. `run` : sa relecture, dont le
// calibrage et le coût sont dans son `cook.launched` et son `cook.exited`.
export type Review = { outcome: "green" | "red" | "skipped"; run: string | null; summary: string | null; findings: Finding[] };

// Pourquoi la pass s'arrête sur une livraison verte sans la merger.
export const SANS_GRANT = "no-grant";
export const JUGES_MODIFIES = "judge-modified";

// Pourquoi la pass remonte au chef sans renvoyer au cook.
// `review-unreadable` : le reviewer a répondu, mais sa réponse ne se lit pas —
// ni verte ni rouge. `review-unsendable` : sa consigne ne tient pas dans une
// commande, la relecture ne peut pas partir.
export type MotifDeRemontee = "returns-exhausted" | "wrong-base" | "no-gates" | "ci-silent" | "review-unreadable" | "review-unsendable";

export type FaitPass =
  // Les commandes du chef. Sans `grant.activated`, il n'y a pas de grant.
  | { type: "grant.activated"; payload: { action: ActionDeGrant } }
  | { type: "grant.revoked"; payload: { action: ActionDeGrant } }
  // La pass prend une livraison : le run, sa PR, le commit qu'elle va juger.
  // Sans PR : le ticket n'a produit aucun diff.
  | { type: "pass.started"; payload: { run: string; pr: string | null; number: number | null; sha: string } }
  // Le reviewer a relu la livraison du `run`, sur ce commit : la même ne se
  // relit pas. `review` : le run de sa relecture. `unreadable` : il a répondu,
  // mais rien ne s'y lit — `reason` dit quoi. `truncated` : le diff ne tenait
  // pas dans sa consigne, il a dû lire le reste dans le worktree.
  | {
      type: "pass.reviewed";
      payload: {
        run: string;
        sha: string;
        review: string;
        outcome: "green" | "red" | "unreadable";
        summary: string | null;
        findings: Finding[];
        reason: string | null;
        truncated: boolean;
      };
    }
  // Le verdict, avec ce qui l'a produit : les gates, la CI, le reviewer.
  // `findings` : ce qui repart au cook quand il est rouge. `judgeModified` : la
  // livraison touche à ses propres juges (gates, setup, workflows). `noDiff` :
  // le ticket n'a produit aucun diff — ni gates, ni CI, ni PR, le reviewer est
  // le seul juge.
  | {
      type: "pass.judged";
      payload: {
        run: string;
        pr: string | null;
        number: number | null;
        sha: string;
        verdict: Verdict;
        gates: Gates;
        ci: CI;
        review: Review;
        findings: string[];
        judgeModified: boolean;
        noDiff: boolean;
      };
    }
  // L'intention de merger, écrite avant l'appel à GitHub : c'est l'usage du
  // grant. `verdict` : le numéro de séquence du `pass.judged` qui l'autorise.
  | { type: "grant.used"; payload: { action: ActionDeGrant; pr: string; number: number; sha: string; base: string; verdict: number } }
  // Le résultat. `by` : la pass, ou quelqu'un d'autre (le chef, à la main).
  // `reconciled` : constaté après coup, le runtime étant mort entre l'intention
  // et le résultat.
  | { type: "merge.done"; payload: { pr: string; sha: string | null; by: "pass" | "outside"; reconciled: boolean } }
  | { type: "merge.failed"; payload: { pr: string; sha: string; reason: string } }
  // Verte et sans diff : rien à merger, le ticket est servi sur la foi de sa
  // relecture. `verdict` : le numéro de séquence du `pass.judged` qui le sert.
  | { type: "pass.served"; payload: { verdict: number } }
  // Verte, mais non mergée : la pass s'arrête là et dit pourquoi.
  | { type: "pass.held"; payload: { reason: string } }
  // Rouge : les findings repartent à un cook, dans le worktree de la livraison.
  | { type: "pass.returned"; payload: { n: number; findings: string[] } }
  // La pass cesse de renvoyer, ou refuse de juger : au chef.
  | { type: "pass.escalated"; payload: { reason: MotifDeRemontee } };
