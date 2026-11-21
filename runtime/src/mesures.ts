// Le relevé des mesures tel que le chef le lit : les livraisons mergées mises
// côte à côte par tranches, la pente de chaque mesure. Des fonctions sans effet : tout leur vient
// des projections, rien n'est mesuré ici ni gardé ailleurs.
import type { CookMesure, Delivery } from "./projections/measures.ts";

// Le nombre de merges d'une tranche, faute d'option.
export const PAR_DEFAUT = 10;
// Au-delà, les tranches les plus anciennes ne sont plus montrées.
const TRANCHES_MONTREES = 12;
const GATES = "gates_s";

// Le relevé s'écrit en anglais, nombres compris.
const direEn = (valeur: number, decimales = 1) => valeur.toLocaleString("en-US", { maximumFractionDigits: decimales });
const secondesEn = (valeur: number) => `${direEn(valeur)} s`;
const pourcentEn = (valeur: number) => `${direEn(valeur, 0)}%`;
const octetsEn = (valeur: number) => (valeur < 1000 ? `${direEn(valeur, 0)} B` : valeur < 1_000_000 ? `${direEn(valeur / 1000)} KB` : `${direEn(valeur / 1_000_000)} MB`);

// Les mesures d'état : ce que le projet pèse une fois la livraison mergée,
// sous le nom que ses gates leur donnent.
const ETATS = [
  { nom: "tests", titre: "tests", lire: (valeur: number) => direEn(valeur, 0) },
  { nom: "tests_s", titre: "test suite", lire: secondesEn },
  { nom: "depot_octets", titre: "repo", lire: octetsEn },
  { nom: "contexte_octets", titre: "context", lire: octetsEn },
  { nom: "doc_octets", titre: "docs", lire: octetsEn },
] as const satisfies ReadonlyArray<{ nom: string; titre: string; lire: (valeur: number) => string }>;

function mediane(valeurs: number[]): number | null {
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  const haut = triees[milieu];
  if (haut === undefined) return null;
  return triees.length % 2 === 1 ? haut : ((triees[milieu - 1] ?? haut) + haut) / 2;
}

// La dernière valeur connue d'une mesure : une livraison sans diff, jugée par
// des gates qui ne déclarent rien, ou jugée avant une livraison déjà mergée,
// n'en dit rien.
const derniere = (livraisons: Delivery[], nom: string): number | null => livraisons.findLast((livraison) => livraison.state[nom] !== undefined)?.state[nom] ?? null;

// La part des gates dans le temps d'une livraison : leur durée, rapportée à
// cette durée plus celle de ses cooks. Nulle si l'une des deux manque.
function partDesGates({ gatesS, cooks }: Delivery): number | null {
  const cuisson = cooks.reduce((somme, cook) => somme + (cook.durationMs ?? 0), 0);
  return gatesS === null || cuisson === 0 ? null : (gatesS * 1000) / (gatesS * 1000 + cuisson);
}

// Ce qu'un ticket a demandé de tours, tous ses cooks comptés, sous le
// calibrage du dernier — celui avec lequel il a fini par passer.
function toursDuTicket({ cooks }: Delivery): { calibrage: string; tours: number } | null {
  const calibrage = cooks.at(-1)?.calibration ?? null;
  const comptes = cooks.flatMap((cook) => (cook.turns === null ? [] : [cook.turns]));
  return calibrage === null || comptes.length === 0 ? null : { calibrage, tours: comptes.reduce((somme, tours) => somme + tours, 0) };
}

// Ce qu'un ticket a consommé de tokens : la somme de ses lancements, sous le
// calibrage du dernier. Sa rétro s'écrit dans le dernier message d'un cook : ses
// tokens sont déjà dans ceux du lancement, on ne les ajoute pas. Un lancement dont les tokens ne
// sont pas connus ne compte pas.
function tokensDuTicket({ ticket, cooks }: Delivery): { ticket: number | null; calibrage: string; tokens: number } | null {
  const calibrage = cooks.at(-1)?.calibration ?? null;
  const comptes = cooks.flatMap((cook) => (cook.tokens === null ? [] : [cook.tokens]));
  return calibrage === null || comptes.length === 0 ? null : { ticket, calibrage, tokens: comptes.reduce((somme, tokens) => somme + tokens, 0) };
}

// Le total d'un ticket qui a eu une rétro, et ses deux parts : `ticket` ce qu'il
// a coûté sans elle, `retro` ce qu'elle a coûté — total = ticket + retro. La
// rétro s'écrit dans le dernier message d'un cook : le journal n'en compte
// qu'un total, et la rétro y est déjà ; c'est le ticket sans elle qu'on en
// retranche, pour ne rien compter deux fois.
export type CoutAvecRetro = { ticket: number | null; total: number; sansRetro: number; retro: number };
const retroDuTicket = (livraison: Delivery): CoutAvecRetro | null => {
  const total = tokensDuTicket(livraison)?.tokens;
  const { retroTokens } = livraison;
  if (total === undefined || retroTokens === undefined) return null;
  const retro = Math.min(retroTokens, total);
  return { ticket: livraison.ticket, total, sansRetro: total - retro, retro };
};

// Ce qu'un ticket a été payé, lancement par lancement. `utiles` : les tokens
// de ses lancements qui ont livré — le prix de la livraison. `perdus` : ceux
// des autres, qui n'ont rien produit. `inconnus` : ceux de ses lancements dont
// le journal ne sait pas les tokens — ils ne comptent dans aucune des deux
// sommes ; `tokens` est nul quand c'est le cas de tous. `repris` : ceux de ses
// renvois qui ont repris la session du cook précédent au lieu de repartir de
// zéro — absent s'il n'y en a aucun. La reprise ne change rien aux deux
// sommes : un lancement repris qui livre est utile, perdu sinon, comme un autre.
export type Paiement = { ticket: number | null; lancements: number; inconnus: number; repris?: number; tokens: { utiles: number; perdus: number } | null };

function paiementDuTicket({ ticket, cooks }: Delivery): Paiement {
  const somme = (livre: boolean) => cooks.reduce((total, cook) => total + (cook.delivered === livre ? (cook.tokens ?? 0) : 0), 0);
  const inconnus = cooks.filter((cook) => cook.tokens === null).length;
  const repris = cooks.filter((cook) => cook.resumed === true).length;
  return { ticket, lancements: cooks.length, inconnus, ...(repris === 0 ? {} : { repris }), tokens: inconnus === cooks.length ? null : { utiles: somme(true), perdus: somme(false) } };
}

// Les lancements d'un ticket, et parmi eux ceux qui ont repris une session et
// ceux dont les tokens ne sont pas connus.
function direLancements(lancements: number, repris: number | undefined, inconnus: number): string {
  const dont = [...(repris === undefined ? [] : [`${repris} resumed`]), ...(inconnus === 0 ? [] : [`${inconnus} with unknown tokens`])];
  return `${lancements}${dont.length === 0 ? "" : `, of which ${dont.join(", ")}`}`;
}

// Un ticket lancé une fois, et qui a livré, a coûté son prix : il n'y a rien à
// en lire de plus que ses tokens.
const payePlusieursFoisOuAPerte = (cooks: CookMesure[]) => cooks.length > 1 || cooks.some((cook) => !cook.delivered);

export type Tranche = {
  // Le rang de son premier et de son dernier merge, à partir de 1.
  premier: number;
  dernier: number;
  jusquAu: string;
  // L'état que laisse sa dernière livraison qui en porte un.
  etats: Record<string, number | null>;
  // Les médianes de ses livraisons : la durée de leurs gates, leur part.
  gatesS: number | null;
  partGates: number | null;
  // Par calibrage : la médiane des tours d'un ticket, et sur combien de tickets.
  tours: Map<string, { mediane: number; tickets: number }>;
  // Par calibrage : la médiane des tokens d'un ticket, sur combien de tickets,
  // et le plus cher de la tranche.
  tokens: Map<string, { mediane: number; tickets: number; plusCher: { ticket: number | null; tokens: number } }>;
  // Ceux de ses tickets lancés plus d'une fois, ou dont un lancement n'a rien
  // livré, dans l'ordre de leur merge.
  paiements: Paiement[];
  // Les tickets de la tranche qui ont eu une rétro : leur total, ce qu'ils ont
  // coûté sans elle, et ce qu'elle a coûté.
  retros: CoutAvecRetro[];
};

export function trancher(livraisons: Delivery[], par = PAR_DEFAUT): Tranche[] {
  const tranches: Tranche[] = [];
  for (let debut = 0; debut < livraisons.length; debut += par) {
    const siennes = livraisons.slice(debut, debut + par);
    const parCalibrage = Map.groupBy(siennes.flatMap((livraison) => toursDuTicket(livraison) ?? []), ({ calibrage }) => calibrage);
    const parCout = Map.groupBy(siennes.flatMap((livraison) => tokensDuTicket(livraison) ?? []), ({ calibrage }) => calibrage);
    tranches.push({
      premier: debut + 1,
      dernier: debut + siennes.length,
      jusquAu: siennes.at(-1)?.at ?? "",
      etats: Object.fromEntries(ETATS.map(({ nom }) => [nom, derniere(siennes, nom)])),
      gatesS: mediane(siennes.flatMap((livraison) => livraison.measures[GATES] ?? [])),
      partGates: mediane(siennes.flatMap((livraison) => partDesGates(livraison) ?? [])),
      tours: new Map([...parCalibrage].map(([calibrage, tickets]) => [calibrage, { mediane: mediane(tickets.map(({ tours }) => tours)) ?? 0, tickets: tickets.length }])),
      tokens: new Map(
        [...parCout].map(([calibrage, tickets]) => {
          const [premier, ...autres] = tickets;
          const plusCher = autres.reduce((cher, courant) => (courant.tokens > cher.tokens ? courant : cher), premier as NonNullable<typeof premier>);
          return [calibrage, { mediane: mediane(tickets.map(({ tokens }) => tokens)) ?? 0, tickets: tickets.length, plusCher: { ticket: plusCher.ticket, tokens: plusCher.tokens } }];
        }),
      ),
      paiements: siennes.filter(({ cooks }) => payePlusieursFoisOuAPerte(cooks)).map(paiementDuTicket),
      retros: siennes.flatMap((livraison) => retroDuTicket(livraison) ?? []),
    });
  }
  return tranches;
}

const ABSENT = "—";
const TITRE = 11;
const ligne = (titre: string, valeur: string) => `${titre.padEnd(TITRE)}${valeur}`.trimEnd();

// Des colonnes alignées sur leur cellule la plus large.
function tableau(lignes: string[][]): string[] {
  const largeurs = (lignes[0] ?? []).map((_, colonne) => Math.max(...lignes.map((cellules) => (cellules[colonne] ?? "").length)));
  return lignes.map((cellules) => cellules.map((cellule, colonne) => cellule.padEnd(largeurs[colonne] ?? 0)).join("  ").trimEnd());
}

// De combien une mesure a été multipliée, de la première tranche montrée qui
// la porte à la dernière.
function pente(valeurs: Array<number | null>): string {
  const connues = valeurs.flatMap((valeur) => valeur ?? []);
  const [premiere, fin] = [connues[0], connues.at(-1)];
  return connues.length < 2 || premiere === undefined || fin === undefined || premiere <= 0 ? "" : `×${direEn(fin / premiere)}`;
}

// Le plafond de durée que les gates du projet se donnent : la pass ne le juge
// pas, et ce relevé est l'endroit où ses dépassements se suivent. Rien n'est
// dit tant qu'aucune livraison ne l'a franchi.
function direPlafond(livraisons: Delivery[]): string[] {
  const franchies = livraisons.filter((livraison) => livraison.overCeiling !== undefined);
  const derniere = franchies.at(-1);
  if (derniere?.overCeiling === undefined) return [];
  const { cpuSeconds, limitSeconds } = derniere.overCeiling;
  const trop = limitSeconds > 0 ? ` (+${pourcentEn(((cpuSeconds - limitSeconds) * 100) / limitSeconds)})` : "";
  return [
    ligne(
      "cap",
      `of the gates exceeded on ${franchies.length} of ${livraisons.length} deliveries — not judged by the pass; the latest: ${derniere.ticket === null ? "no ticket" : `#${derniere.ticket}`}, ${secondesEn(cpuSeconds)} of CPU for a cap of ${secondesEn(limitSeconds)}${trop}`,
    ),
  ];
}

export type Releve = { projet: string | null; livraisons: Delivery[] };

// Le relevé, ligne par ligne.
export function decrireReleve({ projet, livraisons }: Releve, par = PAR_DEFAUT): string[] {
  const merges = livraisons.length;
  if (merges === 0) return [ligne("report", `${projet ?? "unknown — empty log"} — no merge in the log: nothing to report`)];
  const toutes = trancher(livraisons, par);
  const tranches = toutes.slice(-TRANCHES_MONTREES);
  const rang = ({ premier, dernier }: Tranche) => (premier === dernier ? String(premier) : `${premier}-${dernier}`);
  const ou = <V>(valeur: V | null, lire: (valeur: V) => string) => (valeur === null ? ABSENT : lire(valeur));
  const calibrages = [...new Set(toutes.flatMap((tranche) => [...tranche.tours.keys()]))].sort();
  const cout = [...new Set(toutes.flatMap((tranche) => [...tranche.tokens.keys()]))].sort();
  const payes = tranches.flatMap((tranche) => tranche.paiements.map((paiement) => ({ tranche, ...paiement })));
  return [
    ligne("report", `${projet ?? "unknown"} — ${merges} merge${merges > 1 ? "s" : ""} in the log, in slices of ${par}${toutes.length > tranches.length ? ` (the last ${tranches.length})` : ""}`),
    ligne("", `${merges} since the last closing (none in the log) · ${merges} since the last security review (none in the log)`),
    ligne("", "only the deliveries the pass judged count, and the cooks in the log — not the account's consumption"),
    "",
    ...tableau([
      ["merges", "up to", ...ETATS.slice(0, 2).map(({ titre }) => titre), "gates", "gates share", ...ETATS.slice(2).map(({ titre }) => titre)],
      ...tranches.map((tranche) => [
        rang(tranche),
        tranche.jusquAu.slice(0, 10),
        ...ETATS.slice(0, 2).map(({ nom, lire }) => ou(tranche.etats[nom] ?? null, lire)),
        ou(tranche.gatesS, secondesEn),
        ou(tranche.partGates, (part) => pourcentEn(part * 100)),
        ...ETATS.slice(2).map(({ nom, lire }) => ou(tranche.etats[nom] ?? null, lire)),
      ]),
      [
        "slope",
        "",
        ...ETATS.slice(0, 2).map(({ nom }) => pente(tranches.map((tranche) => tranche.etats[nom] ?? null))),
        pente(tranches.map((tranche) => tranche.gatesS)),
        "",
        ...ETATS.slice(2).map(({ nom }) => pente(tranches.map((tranche) => tranche.etats[nom] ?? null))),
      ],
    ]),
    "",
    ligne("turns", calibrages.length === 0 ? "no calibrated cook behind these merges" : "per ticket, median by calibration (in parentheses: over how many tickets)"),
    ...(calibrages.length === 0
      ? []
      : tableau([
          ["merges", ...calibrages],
          ...tranches.map((tranche) => [
            rang(tranche),
            ...calibrages.map((calibrage) => ou(tranche.tours.get(calibrage) ?? null, ({ mediane: tours, tickets }) => `${direEn(tours)} (${tickets})`)),
          ]),
        ])),
    "",
    ligne("tokens", cout.length === 0 ? "nothing to measure: no calibrated cook, or none with known tokens, behind these merges" : "per ticket, median by calibration (in parentheses: over how many tickets), and the costliest of the slice"),
    ...(cout.length === 0
      ? []
      : tableau([
          ["merges", ...cout],
          ...tranches.map((tranche) => [
            rang(tranche),
            ...cout.map((calibrage) =>
              ou(tranche.tokens.get(calibrage) ?? null, ({ mediane: tokens, tickets, plusCher }) => `${direEn(tokens, 0)} (${tickets}) · max ${plusCher.ticket === null ? "no ticket" : `#${plusCher.ticket}`} ${direEn(plusCher.tokens, 0)}`),
            ),
          ]),
        ])),
    "",
    ...(tranches.some((tranche) => tranche.retros.length > 0)
      ? [
          ligne("retro", "tokens of a ticket = the ticket without its retro + the retro (estimated: its share of the final message, which the cook's tokens already hold)"),
          ...tableau([
            ["merges", "ticket", "tokens", "without retro", "retro"],
            ...tranches.flatMap((tranche) => tranche.retros.map(({ ticket, total, sansRetro, retro }) => [rang(tranche), ticket === null ? "no ticket" : `#${ticket}`, direEn(total, 0), direEn(sansRetro, 0), direEn(retro, 0)])),
          ]),
          "",
        ]
      : []),
    ligne(
      "launches",
      payes.length === 0
        ? "no ticket launched more than once, and no launch without a delivery, behind these merges"
        : `tickets launched more than once, or with a launch that delivered nothing — useful: the tokens of the launches that delivered; lost: those of the others${
            payes.some(({ repris }) => repris !== undefined) ? "; resumed: the retries that continued the previous cook's session instead of starting from scratch" : ""
          }`,
    ),
    ...(payes.length === 0
      ? []
      : tableau([
          ["merges", "ticket", "launches", "tokens", "useful", "lost"],
          ...payes.map(({ tranche, ticket, lancements, inconnus, repris, tokens }) => [
            rang(tranche),
            ticket === null ? "no ticket" : `#${ticket}`,
            direLancements(lancements, repris, inconnus),
            ou(tokens, ({ utiles, perdus }) => direEn(utiles + perdus, 0)),
            ou(tokens, ({ utiles }) => direEn(utiles, 0)),
            ou(tokens, ({ utiles, perdus }) => (perdus === 0 ? "0" : `${direEn(perdus, 0)} (${pourcentEn((perdus * 100) / (utiles + perdus))})`)),
          ]),
        ])),
    "",
    ...direPlafond(livraisons),
  ];
}
