// Les faits de la pass : ce qu'elle juge d'une livraison, ce qu'elle en décide,
// et le grant sous lequel elle merge.
import type { CoureurDesGates } from "./gates.ts";
import type { Ressource } from "./station.ts";

// Ce que le second juge répond d'une livraison qui touche à ses juges : le
// contrôle n'est pas affaibli, il l'est, ou cela ne peut pas s'établir.
export const VERDICTS_DU_SECOND_JUGE = ["not-weakened", "weakened", "cannot-establish"] as const;
export type VerdictDuSecondJuge = (typeof VERDICTS_DU_SECOND_JUGE)[number];

// La seule action qu'un grant couvre au jalon 1.
export type ActionDeGrant = "merge";
// Ce qui éteint un grant sans le chef : sa date, ou son compte d'usages.
export type CauseDExtinction = "until" | "uses";

// Le plafond de durée que les gates se donnent, franchi : ce qu'elles ont
// coûté de processeur, leur plafond, et la ligne où elles le disent.
export type Depassement = { cpuSeconds: number; limitSeconds: number; line: string };

// Ce que les gates du projet ont dit. `skipped` : non jouées — la fusion ne
// s'est pas faite, ou il n'y avait rien à fusionner.
export type Gates = {
  // `green` : sorties en 0 — ou rouges par leur seul plafond de durée, que le
  // runtime ne juge pas (`overCeiling` le porte, `code` reste le leur).
  outcome: "green" | "red" | "timeout" | "skipped";
  code: number | null;
  // Les lignes `FAIL` de leur sortie — celle du plafond de durée mise à part —,
  // et sa fin.
  failures: string[];
  tail: string;
  // Leur plafond de durée franchi, qu'il soit leur seul rouge ou non. Absent :
  // il ne l'est pas, ou elles n'en déclarent pas.
  overCeiling?: Depassement;
  // Rouges parce que leur garde d'horloge a coupé leurs tests, sans qu'aucun
  // n'ait échoué avant la coupure — et pour rien d'autre : la ligne où elles
  // le disent. Sur une machine saturée, ce rouge est celui de la charge, pas
  // du code (voir `GATES_COUPEES`). Absent : elles ne le disent pas.
  clockGuardCut?: string;
  // Ce qu'elles ont déclaré d'elles-mêmes et du projet, par leurs lignes
  // `MESURE  <nom>=<nombre>`. Absent : elles n'ont rien déclaré.
  measures?: Record<string, number>;
  // Combien de fois ce qui a la forme d'identifiants de Claude a été masqué
  // dans leur sortie, setup compris. Absent : jamais.
  credentialsMasked?: number;
  // Non rejouées : le passage vert du ticket, sur le même arbre et la même
  // configuration, qu'elles reprennent (`empreinte-des-gates.ts`) — son rang au
  // journal, qui l'avait joué, son ticket, et quand. Absent : jouées.
  reused?: { seq: number; runner: CoureurDesGates; ticket: number; at: string };
};

// Un job de CI, ou un statut de commit.
export type Check = { name: string; outcome: "green" | "red" | "pending"; conclusion: string; url: string | null };

// Ce que la CI du commit a dit. `none` : le commit n'a aucun check — ni vert ni
// rouge, le verdict repose alors sur les seules gates. `skipped` : non lue — les
// gates étaient déjà rouges, ou le reviewer l'était avant qu'elle ne conclue —
// ou lue rouge sur une branche qui n'a pas la tête de la base : elle n'a pas
// jugé ce qui sera mergé, et `checks` garde ce qu'elle disait.
export type CI = { outcome: "green" | "red" | "none" | "skipped"; checks: Check[] };

export type Verdict = "green" | "red";

// Un constat du reviewer. `blocking` : la livraison ne passe pas telle quelle,
// il repart au cook. `remark` : le chef le lit, rien n'est retenu.
export type Finding = { severity: "blocking" | "remark"; file: string | null; text: string };

// Ce que le reviewer a dit d'une livraison. `skipped` : non appelé — les gates
// étaient déjà rouges, ou la branche en conflit. `run` : sa relecture, dont le
// calibrage et le coût sont dans son `cook.launched` et son `cook.exited`.
export type Review = { outcome: "green" | "red" | "skipped"; run: string | null; summary: string | null; findings: Finding[] };

// Pourquoi la pass s'arrête sur une livraison verte sans la merger : un motif
// par geste du chef. `no-grant` : accorder le grant, ou merger à la main.
// `review-required` : la relire, puis la merger à la main — elle touche à ses
// juges, ou à ce que le projet déclare au runtime pour s'ouvrir (son réseau,
// ses secrets). `merge-refused` : GitHub a refusé le merge — lever ce qu'il
// dit, puis merger à la main. `cause` précise sans rien changer au geste.
export const SANS_GRANT = "no-grant";
export const A_RELIRE = "review-required";
export const MERGE_REFUSE = "merge-refused";
export type MotifDArret = typeof SANS_GRANT | typeof A_RELIRE | typeof MERGE_REFUSE;
// Ce que `cause` dit d'une livraison à relire : ses juges, ou les fichiers de
// déclaration qu'elle touche.
export const JUGES_MODIFIES = "judge-modified";
const PREFIXE_DECLARATIONS = "declaration-modified: ";
export const causeDeDeclarations = (fichiers: string[]) => `${PREFIXE_DECLARATIONS}${fichiers.join(", ")}`;
// Les fichiers que nomme la cause d'un arrêt, si elle est de celles-là.
export const declarationsDeLaCause = (cause: string | null) => (cause?.startsWith(PREFIXE_DECLARATIONS) ? cause.slice(PREFIXE_DECLARATIONS.length) : null);

// La cause d'une remontée `unjudged` qu'écrivait la pass avant #1820, quand la
// CI de la livraison était rouge deux fois, relancée entre-temps, sur le même
// test qu'elle ne touche pas. Elle n'en écrit plus — ce test part à la cuisine
// en ticket `fix` (`pass.ci-set-aside`) —, mais un journal d'avant la porte.
const PREFIXE_TEST_INSTABLE = "unstable-test: ";
// Les tests que nomme la cause d'une remontée, si elle est de celles-là.
export const testsInstablesDeLaCause = (cause: string | null) => (cause?.startsWith(PREFIXE_TEST_INSTABLE) ? cause.slice(PREFIXE_TEST_INSTABLE.length) : null);

// Pourquoi une livraison attend, sans verdict ou sans merge : la base est
// rouge — une livraison se juge fusionnée avec elle, et son rouge n'est celui
// d'aucun cook —, ou la machine n'a pas de quoi rejuger. Elle repart seule.
export const BASE_ROUGE = "base-red";
export const MACHINE_SATUREE = "machine-saturated";
// Ses gates ont été coupées par leur garde d'horloge sur une machine saturée,
// sans aucun test en échec : ni verdict ni renvoi, elles sont rejouées dès que
// la machine ne l'est plus. Coupées à nouveau, c'est un rouge.
export const GATES_COUPEES = "gates-cut-saturated";
// Ce que la file et la carte en disent, en une ligne.
export const DIRE_GATES_COUPEES = "gates rejouées plus tard : machine saturée, aucun test en échec";
export const DIRE_GATES_COUPEES_EN = "gates replayed later: machine saturated, no test failing";
// La cuisine est en pause pour le renommage du code (pause/pause.ts) : une
// livraison verte n'est pas mergée avant la fin de la pause, puis repart seule.
export const EN_PAUSE = "paused";
// L'interrupteur du projet est éteint (interrupteur.ts) : une livraison verte
// n'est pas mergée tant qu'il l'est, puis repart seule quand il est rallumé.
export const PROJET_ETEINT = "project-off";
export type MotifDAttente = typeof BASE_ROUGE | typeof MACHINE_SATUREE | typeof GATES_COUPEES | typeof EN_PAUSE | typeof PROJET_ETEINT;

// Pourquoi la pass cesse de renvoyer au cook : un motif par suite.
// `still-red` : la livraison est rouge et ses renvois ne la corrigeront plus —
// les renvois sont épuisés, ou le manager a choisi de remonter. `unjudged` : la
// pass n'a pas pu juger — la PR ne vise pas la base, le projet n'a pas de
// gates, le worktree ou la fusion manquent, la CI se tait, la relecture ne part
// pas ou ne se lit pas, les secrets du projet manquent. L'un et l'autre vont à
// la cuisine, pas au chef (`remontee-a-la-cuisine.ts`, #1826) — sauf les
// secrets, que lui seul pose, et la remontée du manager avec une carte.
// `manager-split` : le manager a redécoupé le ticket, ses sous-tickets portent
// le travail — aucun geste. `cause` dit lequel des cas, d'un mot ; le
// commentaire d'issue dit le détail.
export const ENCORE_ROUGE = "still-red";
export const NON_JUGEE = "unjudged";
export const REDECOUPE = "manager-split";
export type MotifDeRemontee = typeof ENCORE_ROUGE | typeof NON_JUGEE | typeof REDECOUPE;
export const DU_MANAGER = "manager-escalated";
// La cause d'un `still-red` sur une livraison hors du rail : aucun cook ne la
// reprend, elle remonte dès son premier rouge.
export const HORS_RAIL = "off-rail";

// Un journal écrit avant le regroupement porte un nom par cas : il se relit
// sous le motif du geste, son ancien nom en cause.
const ARRETS_D_AVANT: Array<[string, MotifDArret]> = [
  [JUGES_MODIFIES, A_RELIRE],
  [PREFIXE_DECLARATIONS, A_RELIRE],
];
const REMONTEES_D_AVANT: Record<string, MotifDeRemontee> = {
  "returns-exhausted": ENCORE_ROUGE,
  [DU_MANAGER]: ENCORE_ROUGE,
  "wrong-base": NON_JUGEE,
  "no-gates": NON_JUGEE,
  "worktree-lost": NON_JUGEE,
  "ci-silent": NON_JUGEE,
  "review-unreadable": NON_JUGEE,
  "review-unsendable": NON_JUGEE,
  "review-refused": NON_JUGEE,
  "secrets-unavailable": NON_JUGEE,
};
const PREFIXE_REFUS = `${MERGE_REFUSE}: `;
type Motif = { reason: string; cause: string | null };
const lu = (payload: { reason?: unknown; cause?: unknown }): Motif => ({ reason: typeof payload.reason === "string" ? payload.reason : "", cause: typeof payload.cause === "string" ? payload.cause : null });
// Le motif d'un `pass.held`, quel que soit l'âge du journal.
export function motifDArret(payload: { reason?: unknown; cause?: unknown }): Motif {
  const { reason, cause } = lu(payload);
  if (reason.startsWith(PREFIXE_REFUS)) return { reason: MERGE_REFUSE, cause: reason.slice(PREFIXE_REFUS.length) };
  const avant = ARRETS_D_AVANT.find(([nom]) => reason.startsWith(nom));
  return avant ? { reason: avant[1], cause: reason } : { reason, cause };
}
// Le motif d'un `pass.escalated`, de même.
export function motifDeRemontee(payload: { reason?: unknown; cause?: unknown }): Motif {
  const { reason, cause } = lu(payload);
  const avant = Object.hasOwn(REMONTEES_D_AVANT, reason) ? REMONTEES_D_AVANT[reason] : undefined;
  return avant === undefined ? { reason, cause } : { reason: avant, cause: reason };
}

export type FaitPass =
  // Les commandes du chef. Sans `grant.activated`, il n'y a pas de grant.
  // `until` : l'instant où il s'éteint seul. `uses` : le nombre de merges
  // qu'il couvre. Sans l'un ni l'autre, il est sans échéance.
  | { type: "grant.activated"; payload: { action: ActionDeGrant; until?: string; uses?: number } }
  | { type: "grant.revoked"; payload: { action: ActionDeGrant } }
  // Le chef a demandé ce qu'aucun grant n'autorise : refusé, rien n'est
  // accordé. `line` : la ligne de la liste qui l'interdit.
  | { type: "grant.refused"; payload: { action: string; line: string } }
  // Le chef prolonge un grant actif. `until` : sa nouvelle échéance ; `uses` :
  // les usages qui s'ajoutent à ceux qui restent. Nuls, la limite est levée ;
  // absents, elle ne change pas.
  | { type: "grant.extended"; payload: { action: ActionDeGrant; until?: string | null; uses?: number | null } }
  // Le grant s'est éteint seul : son échéance est passée (`until`), ou son
  // dernier usage est consommé (`uses`). `since` : l'instant où il a cessé de
  // valoir — l'échéance, pas l'heure où le runtime l'a constatée.
  | { type: "grant.expired"; payload: { action: ActionDeGrant; cause: CauseDExtinction; since: string } }
  // Une livraison hors du rail entre en pass : la PR d'une passe de fermeture,
  // qui n'a pas de ticket. Elle y est suivie sous le numéro de sa PR — le
  // `ticket` de ce fait et de tous ceux de sa pass, que GitHub ne donne à
  // aucune issue : c'est sur elle que la pass parle. Jugée et mergée comme
  // toute livraison ; rouge, elle remonte au chef sans renvoi.
  | { type: "pass.entered"; payload: { run: string; branch: string; pr: string; number: number } }
  // Le chef relance le jugement d'une livraison coincée — livrée, jamais jugée,
  // et rien dans sa pass (`file-de-la-pass.ts`) : la pass du runtime qui tourne
  // se réveille sur ce fait et la prend à son tour, par sa file. `run` : la
  // livraison relancée. Ne change aucune phase.
  | { type: "pass.relaunched"; payload: { run: string } }
  // La pass prend une livraison : le run, sa PR, le commit qu'elle va juger.
  // Sans PR : le ticket n'a produit aucun diff.
  | { type: "pass.started"; payload: { run: string; pr: string | null; number: number | null; sha: string } }
  // La PR de la livraison, ouverte par la pass : la station n'avait pas pu
  // l'ouvrir à la fin du cook. Écrit avant tout jugement et toute remontée —
  // c'est par lui que la livraison porte sa PR. `reconciled` : retrouvée sur
  // GitHub, le runtime étant mort entre son ouverture et ce fait.
  | { type: "pass.pr-opened"; payload: { pr: string; number: number; reconciled: boolean } }
  // Le reviewer a relu la livraison du `run`, sur ce commit : lue, la même ne
  // se relit pas. `review` : le run de sa relecture. `unreadable` : il a
  // répondu, mais rien ne s'y lit — `reason` dit quoi ; la relecture lui est
  // alors redemandée, et la même livraison en porte plusieurs. `truncated` : le
  // diff ne tenait pas dans sa consigne, il a dû lire le reste dans le worktree.
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
  // La CI du commit `sha` de la livraison du `run` était rouge sur des tests
  // qu'elle ne touche pas, et sur rien d'autre (`relance-de-ci.ts`) : la pass a
  // relancé les jobs en échec des `runs` de GitHub Actions, au lieu d'en faire
  // un verdict. `checks` : les jobs rouges relancés — tant qu'ils se lisent
  // encore, ils sont en cours. `tests` : les tests en échec, en chemins du
  // dépôt. Une fois par livraison : ni renvoi, ni carte, ni phase changée.
  // `alreadyJudged` : relancés parce qu'un verdict rouge les avait déjà jugés,
  // quoi qu'ils disent — un renvoi ne juge jamais deux fois le même run de CI
  // (#1820). `tests` est alors vide : rien n'a établi le rouge hors de la
  // livraison. Une fois par run jugé.
  | { type: "pass.ci-rerun"; payload: { run: string; sha: string; runs: number[]; checks: Check[]; tests: string[]; alreadyJudged?: true } }
  // La pass va ouvrir le ticket `fix` du `test` instable, rouge deux fois sur le
  // commit `sha` de la livraison (`test-instable.ts`). Écrit avant l'appel à
  // GitHub : la réponse perdue, l'issue se retrouve par sa marque au lieu
  // d'être ouverte deux fois.
  | { type: "pass.test-fix-opening"; payload: { test: string; sha: string } }
  // La CI du commit `sha` est restée rouge, après la relance de ses jobs en
  // échec, sur les mêmes tests que la livraison ne touche pas, la base verte
  // (#1820) : ses jobs rouges, `checks`, sont mis de côté, et la livraison est
  // jugée sans eux. Chaque test part à la cuisine en ticket `fix` : `issue`,
  // ouvert pour lui — ou déjà ouvert, `reused`. Ni renvoi, ni carte.
  | { type: "pass.ci-set-aside"; payload: { sha: string; checks: Check[]; fixes: Array<{ test: string; issue: number; reused: boolean }> } }
  // Les jobs rouges de la CI du commit `sha` qui n'ont jamais été verts sur la
  // base, `base` (#1860) : ils sont dits, pas jugés — la livraison est jugée sans
  // eux. Une fois la base verte sur le job, son rouge se juge de nouveau.
  | { type: "pass.ci-excused"; payload: { sha: string; base: string; checks: Check[] } }
  // La pass va ouvrir le ticket `fix` d'une remontée technique du ticket
  // (`remontee-a-la-cuisine.ts`, #1826) : `cause`, celle de la remontée. Écrit
  // avant l'appel à GitHub, comme celui d'un test instable.
  | { type: "pass.kitchen-fix-opening"; payload: { cause: string } }
  // La cuisine reprend une remontée technique, au lieu de la poser devant le
  // chef (#1826). `move` : `return`, la livraison renvoyée une fois à un cook ;
  // `fix`, le ticket `fix` `issue` ouvert sur sa cause — retrouvé par sa marque,
  // `reconciled` —, le ticket l'attend, 86 ; `resume`, ce `fix` sorti du rail,
  // la livraison renvoyée à un cook ; `none`, plus rien à essayer, le ticket
  // reste 86 sur le rail. Jamais de carte. Un `return` ou un `resume` est suivi
  // du `pass.returned` qui le fait, sans consommer de renvoi.
  | { type: "pass.kitchen-took-over"; payload: { cause: string; move: "return" | "fix" | "resume" | "none"; issue?: number; reconciled?: boolean } }
  // La pass attend la CI du commit `sha` sans qu'aucun check n'existe : la
  // branche porte ces `workflows` (fichiers sous `.github/workflows`), qui se
  // lancent sur une PR vers la base. Une fois par commit ; c'est ce que
  // `pass` et `status` disent attendre.
  | { type: "pass.ci-awaited"; payload: { sha: string; workflows: string[] } }
  // Le verdict, avec ce qui l'a produit : les gates, la CI, le reviewer — et
  // ce sur quoi il porte : `sha`, la tête de la branche ; `base`, la tête de la
  // base avec laquelle elle a été fusionnée ; `merged`, l'arbre obtenu, celui
  // que les gates ont jugé — nul si la fusion ne s'est pas faite (conflit).
  // Sans diff, il n'y a rien à fusionner : ni `base` ni `merged`, comme sur un
  // verdict écrit quand la pass jugeait encore la branche seule.
  // `findings` : ce qui repart au cook quand il est rouge. `judgeModified` : la
  // livraison touche à ses propres juges (gates, setup, workflows).
  // `declarations` : les déclarations du projet qu'elle touche (réseau,
  // secrets) — absent d'un verdict écrit avant que la pass ne les regarde.
  // `noDiff` : le ticket n'a produit aucun diff — ni gates, ni CI, ni PR, le
  // reviewer est le seul juge.
  | {
      type: "pass.judged";
      payload: {
        run: string;
        pr: string | null;
        number: number | null;
        sha: string;
        base?: string;
        merged?: string | null;
        verdict: Verdict;
        gates: Gates;
        ci: CI;
        review: Review;
        findings: string[];
        judgeModified: boolean;
        // Les fichiers de ces juges que la livraison change, avec leurs lignes
        // ajoutées et retirées — absent d'un verdict écrit avant.
        judges?: Array<{ file: string; added: number; removed: number }>;
        declarations?: string[];
        noDiff: boolean;
      };
    }
  // Une livraison verte qui touche à ses juges a été jugée par le second juge,
  // sur ce commit (`run`, le cook ; `sha`) : écrit une fois par livraison. Sa
  // seule question — le contrôle est-il affaibli ? — et sa réponse, avec sa
  // raison. `judge` : son run, distinct de celui du reviewer, `model` et
  // `effort` son calibrage — nuls s'il n'a pas été lancé : aucun calibrage
  // n'est plus fort que celui du reviewer, ou sa fusion ne se fait plus.
  // `reviewer` : le calibrage du premier reviewer à cet instant, et `review`
  // le run de sa relecture — ce qui dit qu'il en est distinct et plus faible.
  // `change` : ce que la livraison change dans ses juges, en quelques mots
  // simples pour le chef (« runs the Windows tests on v2 too ») — absent s'il
  // ne l'a pas dit, ou d'un journal d'avant (#1877).
  | {
      type: "pass.second-judged";
      payload: {
        run: string;
        sha: string;
        judge: string | null;
        model: string | null;
        effort: string | null;
        reviewer: { model: string; effort: string };
        review: string | null;
        verdict: VerdictDuSecondJuge;
        reason: string;
        change?: string;
      };
    }
  // L'intention de merger, écrite avant l'appel à GitHub : c'est l'usage du
  // grant. `verdict` : le numéro de séquence du `pass.judged` qui l'autorise.
  | { type: "grant.used"; payload: { action: ActionDeGrant; pr: string; number: number; sha: string; base: string; verdict: number } }
  // Le résultat. `by` : la pass, ou quelqu'un d'autre (le chef, à la main).
  // `actor` : le compte GitHub qui a mergé — celui que GitHub nomme, ou
  // l'identité de la pass quand elle vient de le faire. Quand la pass a une
  // identité à elle, `by` est ce que ce compte prouve ; sous l'identité unique
  // de la machine, il reste ce que le runtime suppose. Un merge d'avant ce
  // champ, ou dont le compte n'a pas été lu, ne le porte pas.
  // `reconciled` : constaté après coup, le runtime étant mort entre l'intention
  // et le résultat. `unverified` : rien n'a jugé ce merge sur la base telle
  // qu'elle était — il s'est fait hors du runtime : les gates sont à jouer sur
  // la base. Un merge d'avant ce champ ne le porte pas, et n'est pas à vérifier.
  | { type: "merge.done"; payload: { pr: string; sha: string | null; by: "pass" | "outside"; actor?: string; reconciled: boolean; unverified?: boolean } }
  | { type: "merge.failed"; payload: { pr: string; sha: string; reason: string } }
  // Verte et sans diff : rien à merger, le ticket est servi sur la foi de sa
  // relecture. `verdict` : le numéro de séquence du `pass.judged` qui le sert.
  | { type: "pass.served"; payload: { verdict: number } }
  // Verte, mais non mergée : la pass s'arrête là et dit pourquoi. `expired` :
  // faute de grant, parce qu'il s'était éteint seul à cet instant.
  | { type: "pass.held"; payload: { reason: MotifDArret; cause?: string; expired?: string } }
  // GitHub exige une branche à jour et refuse le merge : le verdict devient
  // rouge, `findings` repart au cook.
  | { type: "pass.outdated"; payload: { sha: string; findings: string[] } }
  // Ni jugée ni mergée pour l'instant : elle repartira seule.
  // `sha` : sur `gates-cut-saturated`, le commit dont les gates ont été coupées.
  | { type: "pass.waiting"; payload: { reason: MotifDAttente; sha?: string } }
  // Les gates jouées sur la base elle-même, hors ticket : après des merges
  // faits hors du runtime, ou parce qu'une livraison fusionnée avec elle est
  // rouge — à qui est ce rouge ? `tickets` : ceux dont le merge était à
  // vérifier. `skipped` : elles n'ont pas pu se jouer — la base n'a pas de
  // gates, ou l'essai ne se fait pas. Sur une base déjà vue rouge, un contrôle
  // non joué ne lève rien : `red` nomme alors le commit du rouge qui reste.
  // `reason`, sur un `skipped` : l'essai ne s'est pas fait, et ce que git en a dit.
  | { type: "base.checked"; payload: { sha: string; outcome: "green" | "red" | "skipped"; gates: Gates; tickets: number[]; red?: string; reason?: string } }
  // Le chef demande que les gates d'une base rouge soient rejouées sans
  // attendre qu'elle bouge — ou la pass elle-même, une fois par rouge, avant
  // d'y voir autre chose qu'un rouge passager. L'auteur dit lequel. Le
  // contrôle suivant, quel qu'il soit, sert la demande.
  | { type: "base.recheck-requested"; payload: Record<string, never> }
  // Le rouge de la base a tenu après son rejeu : la pass va ouvrir un ticket de
  // réparation. Écrit avant l'appel à GitHub — un runtime tué entre les deux
  // retrouve l'issue au lieu d'en ouvrir une seconde. `sha` : le rouge à réparer.
  | { type: "base.repair-opening"; payload: { sha: string } }
  // Le ticket de réparation est né, sous le numéro de ce fait : il passe devant
  // tout le rail, et seul il part d'une base rouge. `failures` : les lignes en
  // échec des gates de la base, telles que son issue les nomme. `reconciled` :
  // retrouvé sur GitHub après coup, plutôt que créé.
  | { type: "base.repair-opened"; payload: { sha: string; failures: string[]; reconciled: boolean } }
  // La machine n'a pas de quoi jouer le rejeu demandé : il attend, la pass y
  // revient à chaque tick.
  | { type: "base.recheck-held"; payload: { resource: Ressource; observed: number; limit: number } }
  // La base ne se rapatrie pas — origine injoignable : son contrôle ne peut pas
  // partir, qu'il soit dû à un rejeu demandé, à des merges à vérifier ou à la
  // veille d'une base rouge. `reason` : ce que git en a dit. Écrit une fois par
  // panne, et de nouveau quand son motif change ; la pass y revient à chaque
  // tick. Ne lève ni ne pose aucun rouge.
  | { type: "base.check-held"; payload: { reason: string } }
  // La base se rapatrie de nouveau : son contrôle reprend.
  | { type: "base.check-resumed"; payload: Record<string, never> }
  // Rouge : les findings repartent à un cook, dans le worktree de la livraison.
  // Écrit par la pass, ou par le manager quand elle lui a passé la main.
  // `kitchen` : renvoyée par la cuisine sur une remontée technique
  // (`pass.kitchen-took-over`) — `n` reste celui des renvois déjà consommés.
  | { type: "pass.returned"; payload: { n: number; findings: string[]; kitchen?: true } }
  // Rouge, et la pass passe la main au manager : c'est lui qui dira la suite —
  // un renvoi à un autre calibrage, un redécoupage, une remontée.
  | { type: "pass.deferred"; payload: Record<string, never> }
  // La pass cesse de renvoyer, ou refuse de juger : au chef.
  // `why` : ce qui a empêché le jugement, tel que le commentaire de l'issue le
  // dit — ce que la cuisine reprend (#1826). Absent d'une remontée d'avant.
  | { type: "pass.escalated"; payload: { reason: MotifDeRemontee; cause?: string; why?: string } }
  // La PR de la livraison a été fermée sans être mergée : la pass ne juge, ne
  // renvoie ni ne merge plus cette livraison. Le ticket reste où il était sur
  // le rail — c'est au chef de l'en sortir. Rouverte puis mergée, un
  // `merge.done` suit.
  | { type: "pass.pr-closed"; payload: { pr: string } }
  // Le ticket a quitté le rail sans que sa livraison soit mergée : la pass ne
  // la suit plus. `pr` : la PR de `branch` que GitHub dit encore ouverte — c'est
  // elle que le chef lit sur l'issue —, ou nul s'il n'en reste aucune. Suit un
  // `merge.done` quand la PR avait été mergée à la main avant le départ : la
  // livraison n'est alors pas abandonnée, la pass cesse seulement de la suivre.
  // `closed` : GitHub dit sa PR fermée sans merge au moment où la pass la lâche
  // — le chef l'a refusée, que la pass l'ait déjà constaté ou non. Absent : elle
  // est encore ouverte (`pr`), ou GitHub ne la connaît pas.
  | { type: "pass.abandoned"; payload: { branch: string; pr: string | null; merged?: boolean; closed?: boolean } };

// Ce que la pass écrivait quand elle jugeait la branche seule, puis sa
// rencontre avec la base au moment de merger ; et l'essai à blanc, quand il
// était un fait à lui. Plus rien ne les écrit : ils ne sont là que pour qu'un
// journal d'alors se relise.
export type FaitPassRevolu =
  | { type: "pass.base-moved"; payload: { sha: string; base: string; from: string; behind: number; overlap: string[]; replay: boolean } }
  | { type: "pass.replayed"; payload: { sha: string; base: string; gates: Gates; findings: string[] } }
  | { type: "pass.rehearsed"; payload: Record<string, unknown> };
