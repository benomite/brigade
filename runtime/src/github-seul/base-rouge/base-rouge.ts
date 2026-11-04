// Le contrôle de la base sur le chemin GitHub seul (épique #2209) : le port, sur
// des faits GitHub, de ce que fait l'ancienne pass. Le statut de la base est celui
// des checks de son dernier commit. Rouge, la station ne merge rien (hors la
// réparation elle-même), et ouvre un ticket de réparation — un seul par commit
// rouge, quel que soit le nombre de tours ou de stations qui le voient.
//
// Rien n'est tenu hors de GitHub, sauf un cache par station : l'issue de
// réparation porte la marque du commit qu'elle répare (`reparation.ts`), et c'est
// elle qui dit, au tour suivant ou à une autre station, que le rouge a déjà son
// ticket.
import { DE_CONFIANCE } from "../../alimenter.ts";
import { etatDeLaBase, type EtatDeLaBase } from "../../github-etat/etats.ts";
import type { Check } from "../../events/pass.ts";
import type { IssueOuverte } from "../../github.ts";
import { LABELS_REPARATION, marqueDeReparation, shaDeReparation } from "../../reparation.ts";

export type CheckDeLaBase = Pick<Check, "outcome"> & Partial<Pick<Check, "name" | "url">>;

// Ce que le contrôle lit et écrit de GitHub.
export type GitHubDeLaBase = {
  // Le dernier commit de la branche d'intégration.
  teteDeLaBase(): Promise<string>;
  // Les issues modifiées depuis `instant`, ouvertes ou fermées, avec leur corps.
  issuesDepuis(instant: string): Promise<Pick<IssueOuverte, "number" | "body" | "association">[]>;
  // Crée une issue ; rend son numéro.
  creerIssue(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  fermerIssue(numero: number): Promise<void>;
};

// Jusqu'où on cherche, sur GitHub, la réparation d'un rouge dont ce runtime n'a
// pas ouvert le ticket (un autre runtime, ou le sien avant un redémarrage).
const FENETRE_MS = 7 * 24 * 3600 * 1000;

export type ControleDeLaBase = {
  etat: EtatDeLaBase | null;
  // Le commit rouge et le ticket qui le répare ; nuls quand la base n'est pas rouge.
  sha: string | null;
  reparation: number | null;
  // Pourquoi le ticket de réparation n'a pas pu être ouvert ou retrouvé : le tour
  // suivant réessaie, la base rouge n'en retient pas moins les merges.
  erreur?: string;
};

export type OptionsDuControle = {
  github: GitHubDeLaBase;
  base: string;
  maintenant?: () => Date;
};

const court = (sha: string) => sha.slice(0, 7);

export function titreDeLaReparation(base: string, sha: string, echecs: string[]): string {
  const [premier = "checks", ...autres] = echecs;
  return `Repair \`${base}\`, red on ${court(sha)}: ${premier}${autres.length === 0 ? "" : ` (and ${autres.length} more)`}`;
}

export function corpsDeLaReparation(base: string, sha: string, echecs: string[]): string {
  return [
    marqueDeReparation(sha),
    "",
    "## Context",
    "",
    `The integration branch \`${base}\` is red on \`${sha}\`: the CI of that commit fails. While it is red, the kitchen merges nothing — this ticket is the only delivery that is merged on a red base.`,
    "",
    "## What fails",
    "",
    ...(echecs.length === 0 ? ["- (GitHub names no failing check)"] : echecs.map((echec) => `- ${echec}`)),
    "",
    "## Acceptance criteria",
    "",
    `- The CI of \`${base}\` is green once this delivery is merged.`,
    "- What failed is fixed at its cause: no test is removed, skipped or weakened to turn green.",
    "",
    "---",
    "",
    "_Opened by a station, with no gesture from the chef._",
  ].join("\n");
}

// Un ticket est une réparation de base s'il porte la priorité des réparations et
// la marque d'un commit dans son corps.
export const estUneReparation = (corps: string, labels: string[]): boolean => labels.includes("prio:0") && shaDeReparation(corps) !== null;

export function controleDeLaBase({ github, base, maintenant = () => new Date() }: OptionsDuControle) {
  // Cache, pas état : les rouges dont on sait déjà le ticket.
  const connus = new Map<string, number>();
  // Un tour entier sur le même rouge : la lecture de GitHub n'est faite qu'une fois.
  const enCours = new Map<string, Promise<number>>();

  const reparationDe = (sha: string, checks: CheckDeLaBase[]): Promise<number> => {
    const connu = connus.get(sha);
    if (connu !== undefined) return Promise.resolve(connu);
    const deja = enCours.get(sha);
    if (deja !== undefined) return deja;
    const ouverture = (async () => {
      const depuis = new Date(maintenant().getTime() - FENETRE_MS).toISOString();
      // Les réparations de ce rouge, de la plus ancienne à la plus récente.
      const dece = async () =>
        (await github.issuesDepuis(depuis))
          .filter((issue) => DE_CONFIANCE.includes(issue.association) && shaDeReparation(issue.body) === sha)
          .map((issue) => issue.number)
          .sort((x, y) => x - y);
      let [numero] = await dece();
      if (numero === undefined) {
        const echecs = checks.filter((check) => check.outcome === "red").map((check) => check.name ?? "unnamed check");
        const creee = await github.creerIssue({ titre: titreDeLaReparation(base, sha, echecs), corps: corpsDeLaReparation(base, sha, echecs), labels: LABELS_REPARATION });
        // Deux stations qui ont vu le rouge ensemble en ont chacune ouvert une :
        // la plus ancienne reste, l'autre se ferme.
        const [premiere = creee] = await dece();
        if (premiere < creee) await github.fermerIssue(creee);
        numero = Math.min(premiere, creee);
      }
      connus.set(sha, numero);
      return numero;
    })().finally(() => enCours.delete(sha));
    enCours.set(sha, ouverture);
    return ouverture;
  };

  // Lit les checks de la base ; rouges, s'assure que son rouge a un ticket de réparation. Si
  // GitHub refuse la création, l'erreur est rendue : le tour suivant la retente.
  return async (checks: CheckDeLaBase[]): Promise<ControleDeLaBase> => {
    const etat = etatDeLaBase(checks);
    if (etat !== "red") return { etat, sha: null, reparation: null };
    const sha = await github.teteDeLaBase();
    try {
      return { etat, sha, reparation: await reparationDe(sha, checks) };
    } catch (erreur) {
      return { etat, sha, reparation: null, erreur: erreur instanceof Error ? erreur.message : String(erreur) };
    }
  };
}
