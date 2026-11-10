// Les gates d'un projet dont les PR ne portent aucune CI, jouées par une
// station sur la tête d'une PR approuvée (#2456). Sur l'ancien chemin, la pass
// jouait les gates elle-même ; sur l'état GitHub seul, `fusionner` ne merge que
// sur une CI verte de la tête, et un projet qui ne lance rien sur ses PR
// (espace, depuis le 2026-10-22 : ses tests tournent sur la box) attendait sans
// fin.
//
// Le résultat est un statut de commit sur la tête, sous le contexte
// `brigade/gates` : toute station et le chef le lisent sur la PR, et
// `fusionner` le lit comme un check — vert, la PR se merge ; rouge, elle
// repart à un cook comme sur une CI rouge.
//
// Deux stations ne les jouent pas en double. Le statut `pending` est la prise :
// - un statut vert ou rouge sur la tête l'a jugée, rien ne se rejoue ;
// - un `pending` posé il y a moins de `GATES_PERIMEES_MS` dit qu'une station
//   les joue : les autres attendent son verdict ;
// - plus ancien, la station qui l'a posé est tombée pendant : une autre reprend ;
// - posé sous le nom de la station même, il est celui d'un runtime d'avant,
//   arrêté ou tombé pendant : elle reprend sans attendre qu'il périme (une
//   station ne joue jamais deux fois les gates d'une même tête à la fois).
// Deux stations qui posent leur `pending` au même instant se départagent en
// relisant : le plus ancien des `pending` frais l'emporte, l'autre s'efface.
// Ce module ne lit et n'écrit que par le client qu'on lui passe.
import type { StatutDeCommit } from "../github.ts";

export const CONTEXTE_DES_GATES = "brigade/gates";

// Au-delà, un `pending` est celui d'une station tombée pendant les gates.
// Plus long que le plafond des gates par défaut (30 min), setup compris.
export const GATES_PERIMEES_MS = 90 * 60_000;

export type GitHubDesGates = {
  statuts(sha: string, contexte: string): Promise<StatutDeCommit[]>;
  poserStatut(sha: string, statut: { state: StatutDeCommit["state"]; context: string; description: string }): Promise<number>;
};

// Ce que les gates ont dit : vertes ou non, ce qui le résume en une ligne (le
// statut), et ce qui a échoué, en markdown (ce que lira le cook).
export type VerdictDesGates = { vert: boolean; resume: string; detail: string };

// Le lieu des gates, prêt : `jouer` les joue (null : coupées par l'arrêt de la
// station, elles n'ont rien dit), `liberer` le défait. Ou pourquoi elles ne
// peuvent pas se jouer ici — la tête a bougé, le projet n'a pas de gates.
export type LieuDesGates = { jouer(): Promise<VerdictDesGates | null>; liberer(): void } | { nonJouees: string };

// `jouees` : cette station les a jouées, et leur statut est posé. `jugee` : un
// statut vert ou rouge l'avait déjà jugée. `tenues` : une autre station les
// joue, et sa prise périme à `jusqua` (ms). `non-jouees` : elles ne se jouent
// pas ici, et pourquoi.
export type IssueDesGates = { issue: "jouees"; verdict: VerdictDesGates } | { issue: "jugee" } | { issue: "tenues"; par: string; jusqua: number } | { issue: "non-jouees"; motif: string };

const DESCRIPTION_MAX = 140;
const decrire = (texte: string) => (texte.length > DESCRIPTION_MAX ? `${texte.slice(0, DESCRIPTION_MAX - 1)}…` : texte);
export const descriptionEnCours = (station: string) => decrire(`Gates running on station ${station}`);
const stationDe = (description: string) => /on station (\S+)/.exec(description)?.[1] ?? "another station";
const ROUGES = /^Gates red on station \S+: (.+)$/;

// Ce qui a fait rougir les gates de la tête, tel que leur dernier verdict le
// résume dans son statut (sa première ligne FAIL, ou leur coupure), pour le
// renvoi qui la nomme comme l'étape en échec d'un job (#3157) ; null si le
// dernier verdict n'est pas rouge ou ne dit rien. Ses parenthèses deviennent
// des crochets : le renvoi met l'étape entre parenthèses.
export function echecDesGates(statuts: readonly StatutDeCommit[]): string | null {
  const verdict = statuts.filter(({ state }) => state !== "pending").at(-1);
  if (verdict === undefined || verdict.state === "success") return null;
  const resume = ROUGES.exec(verdict.description)?.[1]?.replace(/^FAIL\s+/, "").replace(/\(/g, "[").replace(/\)/g, "]").trim();
  return resume === undefined || resume === "" ? null : resume;
}

const peremption = (statut: StatutDeCommit) => Date.parse(statut.createdAt) + GATES_PERIMEES_MS;
const frais = (statut: StatutDeCommit, maintenant: number) => {
  const fin = peremption(statut);
  return !Number.isNaN(fin) && maintenant < fin;
};

// Les `pending` d'autres stations qui tiennent encore la tête, après le
// dernier verdict, et le sien (`mien`) : les prises en cours, de la plus
// ancienne à la plus récente.
const prises = (statuts: StatutDeCommit[], maintenant: number, station: string, mien?: number) =>
  statuts.filter((statut) => statut.state === "pending" && (statut.id === mien || (frais(statut, maintenant) && stationDe(statut.description) !== station)));
const tenues = (prise: StatutDeCommit): IssueDesGates => ({ issue: "tenues", par: stationDe(prise.description), jusqua: peremption(prise) });

// Joue les gates de la tête `sha` depuis `station`, si personne ne l'a jugée
// et qu'aucune autre ne les joue, et pose leur statut.
export async function jouerLesGatesDeLaTete(
  sha: string,
  { github, station, preparer, maintenant = () => Date.now() }: { github: GitHubDesGates; station: string; preparer: () => Promise<LieuDesGates>; maintenant?: () => number },
): Promise<IssueDesGates> {
  const lus = await github.statuts(sha, CONTEXTE_DES_GATES);
  const dernier = lus.at(-1);
  if (dernier !== undefined && dernier.state !== "pending") return { issue: "jugee" };
  const tenue = prises(lus, maintenant(), station)[0];
  if (tenue !== undefined) return tenues(tenue);
  // Le lieu d'abord : des gates qui ne peuvent pas se jouer ici ne prennent pas la tête.
  const lieu = await preparer();
  if ("nonJouees" in lieu) return { issue: "non-jouees", motif: lieu.nonJouees };
  try {
    const mien = await github.poserStatut(sha, { state: "pending", context: CONTEXTE_DES_GATES, description: descriptionEnCours(station) });
    const premiere = prises(await github.statuts(sha, CONTEXTE_DES_GATES), maintenant(), station, mien)[0];
    if (premiere !== undefined && premiere.id !== mien) return tenues(premiere);
    const verdict = await lieu.jouer();
    // Coupées par l'arrêt : le `pending` reste, et périme.
    if (verdict === null) return { issue: "non-jouees", motif: "the station stopped during the gates" };
    const dit = verdict.resume === "" ? "" : `: ${verdict.resume}`;
    await github.poserStatut(sha, {
      state: verdict.vert ? "success" : "failure",
      context: CONTEXTE_DES_GATES,
      description: decrire(`Gates ${verdict.vert ? "green" : "red"} on station ${station}${dit}`),
    });
    return { issue: "jouees", verdict };
  } finally {
    lieu.liberer();
  }
}
