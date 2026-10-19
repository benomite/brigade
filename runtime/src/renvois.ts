// Les renvois : combien d'essais un ticket a demandé, de sa prise à son merge.
// Des fonctions sans effet, qui ne lisent rien : le parcours de chaque ticket
// leur vient de `parcours-des-tickets.ts`, qui le reconstitue du journal.
import type { Signaux } from "./causes-des-ratages.ts";
import { dureeEn } from "./etat.ts";

// Le nombre de tickets servis mesurés, faute d'option.
export const DERNIERS_PAR_DEFAUT = 20;

// Un essai : un cook de ticket lancé pendant le parcours — ni une relecture ni
// un jugement du manager n'en sont. `at` : son lancement. `outcome` : la fin
// que son `cook.exited` dit (`ok` quand il a livré), nulle tant qu'il tourne
// ou s'il est mort avec le runtime. `verdict` : celui de la pass sur ce qu'il a
// livré — le dernier, s'il a été rejugé —, nul si elle ne l'a pas jugé.
// `signaux` : de quoi ranger l'essai dans une cause s'il rate (`causes-des-ratages.ts`).
export type Essai = { run: string; at: string; outcome: string | null; verdict: "green" | "red" | null; signaux?: Signaux };

// Le parcours d'un ticket servi : de sa première prise par une station
// (`takenAt`) à sa fin. `end` : `merged`, sa livraison est dans la base
// d'intégration, quel que soit celui qui l'a mergée ; `served`, il a été servi
// sans diff, donc sans merge ; nulle tant qu'il n'a ni l'un ni l'autre — en
// cours, ou abandonné. `attempts` : ses essais, dans l'ordre de leur lancement.
export type Parcours = { ticket: number; takenAt: string; end: { kind: "merged" | "served"; at: string } | null; attempts: Essai[] };

// Ce que les `n` derniers parcours disent des renvois. `servis` : combien de
// parcours la mesure a regardés — au plus `n`. `retenus` : ceux qui finissent
// sur un merge ; les autres sont `ecartes`. Les trois moyennes ne portent que
// sur les retenus, et sont nulles s'il n'y en a aucun. `premierCoup` : la part
// des retenus mergés sur un seul essai, entre 0 et 1. `essaisMoyens` : leur
// nombre moyen d'essais. `tempsMoyenMs` : le temps moyen de la prise au merge.
export type Renvois = {
  n: number;
  servis: number;
  retenus: number;
  ecartes: number;
  premierCoup: number | null;
  essaisMoyens: number | null;
  tempsMoyenMs: number | null;
};

const moyenne = (valeurs: number[]) => (valeurs.length === 0 ? null : valeurs.reduce((somme, valeur) => somme + valeur, 0) / valeurs.length);

// Les `n` derniers parcours, dans l'ordre de leur prise, dont seuls comptent
// ceux qui finissent sur un merge.
export function mesurerRenvois(parcours: readonly Parcours[], n = DERNIERS_PAR_DEFAUT): Renvois {
  const derniers = parcours.slice(-n);
  const merges = derniers.flatMap((un) => (un.end?.kind === "merged" ? [{ essais: un.attempts.length, ms: Date.parse(un.end.at) - Date.parse(un.takenAt) }] : []));
  return {
    n,
    servis: derniers.length,
    retenus: merges.length,
    ecartes: derniers.length - merges.length,
    premierCoup: moyenne(merges.map(({ essais }) => (essais === 1 ? 1 : 0))),
    essaisMoyens: moyenne(merges.map(({ essais }) => essais)),
    tempsMoyenMs: moyenne(merges.map(({ ms }) => ms)),
  };
}

// La dérive sur le premier coup : les réglages faute de seuil déclaré.
export const SEUIL_PREMIER_COUP_PAR_DEFAUT = 50;
export const FENETRE_PREMIER_COUP_PAR_DEFAUT = 10;

// La part des derniers tickets servis livrés du premier coup, quand elle est
// sous le seuil : `premiers` sur `retenus` (les mergés de la fenêtre), la
// fenêtre et le seuil en %. Nulle au seuil ou au-dessus, et tant que la fenêtre
// n'est pas pleine ou qu'aucun de ses tickets n'est mergé : rien à juger.
export type DerivePremierCoup = { premiers: number; retenus: number; fenetre: number; seuil: number };
export function derivePremierCoup(parcours: readonly Parcours[], { firstTryPercent, firstTryWindow }: { firstTryPercent?: number | null; firstTryWindow?: number | null }): DerivePremierCoup | null {
  const seuil = firstTryPercent ?? SEUIL_PREMIER_COUP_PAR_DEFAUT;
  const fenetre = firstTryWindow ?? FENETRE_PREMIER_COUP_PAR_DEFAUT;
  const { servis, retenus, premierCoup } = mesurerRenvois(parcours, fenetre);
  if (servis < fenetre || premierCoup === null) return null;
  const premiers = Math.round(premierCoup * retenus);
  return (premiers * 100) / retenus < seuil ? { premiers, retenus, fenetre, seuil } : null;
}

// Sa ligne dans `status`, comme la dérive des mesures.
export function direDerivePremierCoupEn({ premiers, retenus, fenetre, seuil }: DerivePremierCoup): string {
  const part = `${premiers}/${retenus}`;
  return retenus === fenetre ? `${part} tickets delivered on the first try (threshold ${seuil}%)` : `${part} merged tickets delivered on the first try, among the last ${fenetre} served (threshold ${seuil}%)`;
}

const dire = (valeur: number, decimales = 1) => valeur.toLocaleString("en-US", { maximumFractionDigits: decimales });
const ligne = (titre: string, valeur: string) => `${titre.padEnd(11)}${valeur}`.trimEnd();
const ECARTES = "not merged (running, dropped, or served without a diff): left out of the count";

// La mesure des renvois, ligne par ligne.
export function decrireRenvois({ n, servis, retenus, ecartes, premierCoup, essaisMoyens, tempsMoyenMs }: Renvois): string[] {
  if (servis === 0) return [ligne("retries", `no served ticket in the log: nothing to measure (N = ${n})`)];
  const tete = ligne(
    "retries",
    `the last ${n} served tickets (N = ${n}): ${servis} in the log, ${retenus} kept, ${ecartes} set aside — ${ECARTES}`,
  );
  if (premierCoup === null || essaisMoyens === null || tempsMoyenMs === null) return [tete, ligne("", "none is merged: nothing to measure")];
  return [
    tete,
    ligne("", `delivered on the first try: ${dire(premierCoup * 100, 0)}% (${Math.round(premierCoup * retenus)} of ${retenus})`),
    ligne("", `attempts per ticket: ${dire(essaisMoyens)} on average`),
    ligne("", `from taking to merge: ${dureeEn(tempsMoyenMs)} on average`),
  ];
}
