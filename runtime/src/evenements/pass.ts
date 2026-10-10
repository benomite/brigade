// Les faits de la pass : ce qu'elle juge d'une livraison, ce qu'elle en décide,
// et le grant sous lequel elle merge.
import type { Ressource } from "./station.ts";

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
  // Ce qu'elles ont déclaré d'elles-mêmes et du projet, par leurs lignes
  // `MESURE  <nom>=<nombre>`. Absent : elles n'ont rien déclaré.
  measures?: Record<string, number>;
  // Combien de fois ce qui a la forme d'identifiants de Claude a été masqué
  // dans leur sortie, setup compris. Absent : jamais.
  credentialsMasked?: number;
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

// Pourquoi une livraison attend, sans verdict ou sans merge : la base est
// rouge — une livraison se juge fusionnée avec elle, et son rouge n'est celui
// d'aucun cook —, ou la machine n'a pas de quoi rejuger. Elle repart seule.
export const BASE_ROUGE = "base-red";
export const MACHINE_SATUREE = "machine-saturated";
export type MotifDAttente = typeof BASE_ROUGE | typeof MACHINE_SATUREE;

// Pourquoi la pass remonte au chef sans renvoyer au cook : un motif par geste.
// `still-red` : la livraison est rouge et personne ne la corrigera plus — les
// renvois sont épuisés, ou le manager a choisi de remonter. Au chef de
// reprendre le ticket ou de le retirer. `unjudged` : la pass n'a pas pu juger —
// la PR ne vise pas la base, le projet n'a pas de gates, le worktree ou la
// fusion manquent, la CI se tait, la relecture ne part pas ou ne se lit pas,
// les secrets du projet manquent. Au chef de lever l'empêchement, ou de juger
// lui-même. `manager-split` : le manager a redécoupé le ticket, ses
// sous-tickets portent le travail — aucun geste. `cause` dit lequel des cas,
// d'un mot ; le commentaire d'issue dit le détail.
export const ENCORE_ROUGE = "still-red";
export const NON_JUGEE = "unjudged";
export const REDECOUPE = "manager-split";
export type MotifDeRemontee = typeof ENCORE_ROUGE | typeof NON_JUGEE | typeof REDECOUPE;
export const DU_MANAGER = "manager-escalated";

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
  // La pass prend une livraison : le run, sa PR, le commit qu'elle va juger.
  // Sans PR : le ticket n'a produit aucun diff.
  | { type: "pass.started"; payload: { run: string; pr: string | null; number: number | null; sha: string } }
  // La PR de la livraison, ouverte par la pass : la station n'avait pas pu
  // l'ouvrir à la fin du cook. Écrit avant tout jugement et toute remontée —
  // c'est par lui que la livraison porte sa PR. `reconciled` : retrouvée sur
  // GitHub, le runtime étant mort entre son ouverture et ce fait.
  | { type: "pass.pr-opened"; payload: { pr: string; number: number; reconciled: boolean } }
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
        declarations?: string[];
        noDiff: boolean;
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
  | { type: "pass.waiting"; payload: { reason: MotifDAttente } }
  // Les gates jouées sur la base elle-même, hors ticket : après des merges
  // faits hors du runtime, ou parce qu'une livraison fusionnée avec elle est
  // rouge — à qui est ce rouge ? `tickets` : ceux dont le merge était à
  // vérifier. `skipped` : elles n'ont pas pu se jouer — la base n'a pas de
  // gates, ou l'essai ne se fait pas. Sur une base déjà vue rouge, un contrôle
  // non joué ne lève rien : `red` nomme alors le commit du rouge qui reste.
  // `reason`, sur un `skipped` : l'essai ne s'est pas fait, et ce que git en a dit.
  | { type: "base.checked"; payload: { sha: string; outcome: "green" | "red" | "skipped"; gates: Gates; tickets: number[]; red?: string; reason?: string } }
  // Le chef demande que les gates d'une base rouge soient rejouées sans
  // attendre qu'elle bouge. Le contrôle suivant, quel qu'il soit, sert la demande.
  | { type: "base.recheck-requested"; payload: Record<string, never> }
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
  | { type: "pass.returned"; payload: { n: number; findings: string[] } }
  // Rouge, et la pass passe la main au manager : c'est lui qui dira la suite —
  // un renvoi à un autre calibrage, un redécoupage, une remontée.
  | { type: "pass.deferred"; payload: Record<string, never> }
  // La pass cesse de renvoyer, ou refuse de juger : au chef.
  | { type: "pass.escalated"; payload: { reason: MotifDeRemontee; cause?: string } }
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
