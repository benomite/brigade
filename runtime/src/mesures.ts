// Le relevé des mesures tel que le chef le lit : les livraisons mergées mises
// côte à côte par tranches, la pente de chaque mesure, et les seuils qu'elle
// franchit. Des fonctions sans effet : tout leur vient des projections, rien
// n'est mesuré ici ni gardé ailleurs.
import type { Seuils } from "./events/drift.ts";
import { geste } from "./geste.ts";
import type { CookMesure, Delivery } from "./projections/measures.ts";

// Le nombre de merges d'une tranche, faute d'option.
export const PAR_DEFAUT = 10;
// La fenêtre sur laquelle la pente d'une mesure est jugée, en merges.
export const FENETRE_DE_PENTE = 10;
// Au-delà, les tranches les plus anciennes ne sont plus montrées.
const TRANCHES_MONTREES = 12;
const GATES = "gates_s";

const dire = (valeur: number, decimales = 1) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
const secondes = (valeur: number) => `${dire(valeur)} s`;
const pourcent = (valeur: number) => `${dire(valeur, 0)} %`;
// Le relevé s'écrit en anglais, nombres compris ; la forme française ci-dessus
// ne sert plus qu'à `direJauge`.
const direEn = (valeur: number, decimales = 1) => valeur.toLocaleString("en-US", { maximumFractionDigits: decimales });
const secondesEn = (valeur: number) => `${direEn(valeur)} s`;
const pourcentEn = (valeur: number) => `${direEn(valeur, 0)}%`;
const octetsEn = (valeur: number) => (valeur < 1000 ? `${direEn(valeur, 0)} B` : valeur < 1_000_000 ? `${direEn(valeur / 1000)} KB` : `${direEn(valeur / 1_000_000)} MB`);

// Les mesures d'état : ce que le projet pèse une fois la livraison mergée,
// sous le nom que ses gates leur donnent. `unite` : celle de leur seuil.
const ETATS = [
  { nom: "tests", titre: "tests", lire: (valeur: number) => direEn(valeur, 0), seuil: "tests", unite: 1 },
  { nom: "tests_s", titre: "suite", lire: secondesEn, seuil: "testsSeconds", unite: 1 },
  { nom: "depot_octets", titre: "dépôt", lire: octetsEn, seuil: "repoMb", unite: 1_000_000 },
  { nom: "contexte_octets", titre: "contexte", lire: octetsEn, seuil: "contextKb", unite: 1000 },
  { nom: "doc_octets", titre: "doc", lire: octetsEn, seuil: null, unite: 1 },
] as const satisfies ReadonlyArray<{ nom: string; titre: string; lire: (valeur: number) => string; seuil: keyof Seuils | null; unite: number }>;

export const SANS_SEUIL: Seuils = { tests: null, testsSeconds: null, gatesSeconds: null, contextKb: null, repoMb: null, merges: null, growthPercent: null, ticketTokens: null, lostTokens: null, firstTryPercent: null, firstTryWindow: null };

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
// calibrage du dernier, et ceux de sa rétro. Un lancement dont les tokens ne
// sont pas connus ne compte pas.
function tokensDuTicket({ ticket, cooks, retroTokens }: Delivery): { ticket: number | null; calibrage: string; tokens: number } | null {
  const calibrage = cooks.at(-1)?.calibration ?? null;
  const comptes = cooks.flatMap((cook) => (cook.tokens === null ? [] : [cook.tokens]));
  return calibrage === null || comptes.length === 0 ? null : { ticket, calibrage, tokens: comptes.reduce((somme, tokens) => somme + tokens, 0) + (retroTokens ?? 0) };
}

// Ce que la rétro d'un ticket a coûté, à part : déjà comprise dans son total.
const retroDuTicket = ({ ticket, retroTokens }: Delivery): { ticket: number | null; tokens: number } | null => (retroTokens == null ? null : { ticket, tokens: retroTokens });

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

// Pourquoi un ticket a coûté ce qu'il a coûté, en une ligne, de ce que le
// journal sait de ses lancements : le nombre de passages, la part perdue,
// les renvois repartis de zéro faute de reprise. Un ticket passé une fois
// n'a rien d'autre à dire que sa taille d'une traite.
export function motifDeDerive(livraison: Delivery): string {
  const { cooks } = livraison;
  const { tokens } = paiementDuTicket(livraison);
  const total = cooks.reduce((somme, cook) => somme + (cook.tokens ?? 0), 0) + (livraison.retroTokens ?? 0);
  const prefixe = livraison.ticket === null ? "no ticket" : `#${livraison.ticket}`;
  if (cooks.length <= 1) return `${prefixe}: 1 pass, ${direEn(total, 0)} tokens in one go, no retry — initial reading or work too heavy`;
  const renvois = cooks.slice(1);
  const repartis = renvois.filter((cook) => cook.resumed !== true).length;
  const raisons = [
    `${cooks.length} passes`,
    ...(tokens === null || tokens.utiles + tokens.perdus === 0 ? [] : [`${pourcentEn((tokens.perdus * 100) / (tokens.utiles + tokens.perdus))} lost on retries`]),
    ...(repartis === 0 ? ["retries resumed"] : [`${repartis} ${repartis > 1 ? "retries" : "retry"} restarted from scratch`]),
  ];
  return `${prefixe}: ${raisons.join(", ")}`;
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
  // Les tickets de la tranche qui ont eu une rétro, avec ce qu'elle a coûté :
  // ces tokens sont déjà dans ceux du ticket.
  retros: Array<{ ticket: number | null; tokens: number }>;
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

// Une mesure face à son seuil. `observed` : dans l'unité du seuil, telle
// quelle — elle ne s'arrondit qu'à l'affichage —, ou null tant que le journal
// ne permet pas de la dire.
// `motifs` : pour le coût d'un ticket, une ligne par ticket des derniers
// merges au-delà du seuil — pourquoi il a coûté autant.
export type Jauge = { measure: string; observed: number | null; limit: number; franchi: boolean; motifs?: string[] };
export type Franchi = { measure: string; observed: number; limit: number };

const PENTE = "growth:";
// Les mesures de coût : sur les derniers merges, la fenêtre de la pente.
const TICKET_TOKENS = "tokens_ticket";
const TOKENS_PERDUS = "tokens_perdus";

// Chaque seuil déclaré, avec ce que le projet en est. Un plafond est franchi
// quand il est dépassé ; le compteur de merges, quand il est atteint.
export function jauger(livraisons: Delivery[], seuils: Seuils): Jauge[] {
  const jauges: Jauge[] = [];
  const plafond = (measure: string, observed: number | null, limit: number | null, motifs?: string[]) => {
    if (limit !== null) jauges.push({ measure, observed, limit, franchi: observed !== null && observed > limit, ...(motifs === undefined || motifs.length === 0 ? {} : { motifs }) });
  };
  for (const { nom, seuil, unite } of ETATS) {
    const valeur = derniere(livraisons, nom);
    if (seuil !== null) plafond(nom, valeur === null ? null : valeur / unite, seuils[seuil]);
  }
  plafond(GATES, derniere(livraisons, GATES), seuils.gatesSeconds);
  if (seuils.merges !== null) jauges.push({ measure: "merges", observed: livraisons.length, limit: seuils.merges, franchi: livraisons.length >= seuils.merges });
  // Le coût des derniers merges : le ticket le plus cher, et ce qui a été perdu.
  const recentes = livraisons.slice(-FENETRE_DE_PENTE);
  const couts = recentes.flatMap((livraison) => tokensDuTicket(livraison)?.tokens ?? []);
  const limiteTicket = seuils.ticketTokens ?? null;
  const motifs = limiteTicket === null ? [] : recentes.filter((livraison) => (tokensDuTicket(livraison)?.tokens ?? 0) > limiteTicket).map(motifDeDerive);
  plafond(TICKET_TOKENS, couts.length === 0 ? null : Math.max(...couts), limiteTicket, motifs);
  const perdus = recentes.flatMap((livraison) => paiementDuTicket(livraison).tokens?.perdus ?? []);
  plafond(TOKENS_PERDUS, perdus.length === 0 ? null : perdus.reduce((somme, tokens) => somme + tokens, 0), seuils.lostTokens ?? null);
  // La pente : ce que la mesure vaut aujourd'hui, rapporté à ce qu'elle valait
  // une fenêtre de merges plus tôt.
  const avant = livraisons.slice(0, Math.max(0, livraisons.length - FENETRE_DE_PENTE));
  for (const { nom } of ETATS) {
    const [reference, valeur] = [derniere(avant, nom), derniere(livraisons, nom)];
    plafond(`${PENTE}${nom}`, reference === null || valeur === null || reference <= 0 ? null : ((valeur - reference) * 100) / reference, seuils.growthPercent);
  }
  return jauges;
}

export function franchis(livraisons: Delivery[], seuils: Seuils): Franchi[] {
  return jauger(livraisons, seuils).flatMap(({ measure, observed, limit, franchi }) => (franchi && observed !== null ? [{ measure, observed, limit }] : []));
}

const UNITES: Record<string, (valeur: number) => string> = {
  tests: (valeur) => dire(valeur, 0),
  tests_s: secondes,
  [GATES]: secondes,
  depot_octets: (valeur) => `${dire(valeur)} Mo`,
  contexte_octets: (valeur) => `${dire(valeur)} ko`,
};
const TITRES: Record<string, string> = {
  ...Object.fromEntries(ETATS.map(({ nom, titre }) => [nom, titre])),
  [GATES]: "gates",
  [TICKET_TOKENS]: `tokens du ticket le plus cher des ${FENETRE_DE_PENTE} derniers merges`,
  [TOKENS_PERDUS]: `tokens perdus sur les ${FENETRE_DE_PENTE} derniers merges`,
};

// Une mesure face à son seuil, telle que le chef la lit.
export function direJauge({ measure, observed, limit }: Omit<Jauge, "franchi">): string {
  if (measure === "merges") return `${observed ?? "—"} merges depuis la dernière fermeture pour un seuil de ${limit}`;
  if (measure.startsWith(PENTE)) {
    const titre = TITRES[measure.slice(PENTE.length)] ?? measure.slice(PENTE.length);
    const pente = observed === null ? "—" : `${observed > 0 ? "+" : ""}${pourcent(observed)}`;
    return `${titre} ${pente} en ${FENETRE_DE_PENTE} merges pour un seuil de ${pourcent(limit)}`;
  }
  const unite = UNITES[measure] ?? ((valeur: number) => dire(valeur));
  return `${TITRES[measure] ?? measure} ${observed === null ? "—" : unite(observed)} pour un seuil de ${unite(limit)}`;
}

// La même, en anglais : la ligne `drift` de `status`.
const UNITES_EN: Record<string, (valeur: number) => string> = {
  tests: (valeur) => direEn(valeur, 0),
  tests_s: secondesEn,
  [GATES]: secondesEn,
  depot_octets: (valeur) => `${direEn(valeur)} MB`,
  contexte_octets: (valeur) => `${direEn(valeur)} KB`,
};
const TITRES_EN: Record<string, string> = {
  tests: "tests",
  tests_s: "test suite",
  depot_octets: "repo",
  contexte_octets: "context",
  doc_octets: "docs",
  [GATES]: "gates",
  [TICKET_TOKENS]: `tokens of the costliest ticket of the last ${FENETRE_DE_PENTE} merges`,
  [TOKENS_PERDUS]: `tokens lost over the last ${FENETRE_DE_PENTE} merges`,
};

export function direJaugeEn({ measure, observed, limit }: Omit<Jauge, "franchi">): string {
  if (measure === "merges") return `${observed ?? "—"} merges since the last closing for a threshold of ${limit}`;
  if (measure.startsWith(PENTE)) {
    const titre = TITRES_EN[measure.slice(PENTE.length)] ?? measure.slice(PENTE.length);
    const pente = observed === null ? "—" : `${observed > 0 ? "+" : ""}${pourcentEn(observed)}`;
    return `${titre} ${pente} over ${FENETRE_DE_PENTE} merges for a threshold of ${pourcentEn(limit)}`;
  }
  const unite = UNITES_EN[measure] ?? ((valeur: number) => direEn(valeur));
  return `${TITRES_EN[measure] ?? measure} ${observed === null ? "—" : unite(observed)} for a threshold of ${unite(limit)}`;
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

// La fermeture proposée : un seuil franchi la propose, au chef de la lancer. Le
// relevé ne démarre rien, et ne s'évalue que quand on le lit.
function direProposition(jauges: Jauge[]): string[] {
  const franchies = jauges.filter((jauge) => jauge.franchi);
  if (franchies.length === 0) return [];
  return franchies.map((jauge, i) => ligne(i === 0 ? "closing" : "", `proposed — ${direJaugeEn(jauge)} · yours to run: \`${geste(`closing`)}\` observes, nothing starts by itself`));
}

export type Releve = { projet: string | null; livraisons: Delivery[]; seuils: Seuils | null };

// Le relevé, ligne par ligne.
export function decrireReleve({ projet, livraisons, seuils }: Releve, par = PAR_DEFAUT): string[] {
  const merges = livraisons.length;
  if (merges === 0) return [ligne("report", `${projet ?? "unknown — empty log"} — no merge in the log: nothing to report`)];
  const toutes = trancher(livraisons, par);
  const tranches = toutes.slice(-TRANCHES_MONTREES);
  const rang = ({ premier, dernier }: Tranche) => (premier === dernier ? String(premier) : `${premier}-${dernier}`);
  const ou = <V>(valeur: V | null, lire: (valeur: V) => string) => (valeur === null ? ABSENT : lire(valeur));
  const calibrages = [...new Set(toutes.flatMap((tranche) => [...tranche.tours.keys()]))].sort();
  const cout = [...new Set(toutes.flatMap((tranche) => [...tranche.tokens.keys()]))].sort();
  const jauges = jauger(livraisons, seuils ?? SANS_SEUIL);
  const payes = tranches.flatMap((tranche) => tranche.paiements.map((paiement) => ({ tranche, ...paiement })));
  return [
    ligne("report", `${projet ?? "unknown"} — ${merges} merge${merges > 1 ? "s" : ""} in the log, in slices of ${par}${toutes.length > tranches.length ? ` (the last ${tranches.length})` : ""}`),
    ligne("", `${merges} since the last closing (none in the log) · ${merges} since the last security review (none in the log)`),
    ligne("", "only the deliveries the pass judged count, and the cooks in the log — not the account's consumption"),
    "",
    ...tableau([
      ["merges", "up to", ...ETATS.slice(0, 2).map(({ nom }) => TITRES_EN[nom] ?? nom), "gates", "gates share", ...ETATS.slice(2).map(({ nom }) => TITRES_EN[nom] ?? nom)],
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
          ligne("retro", "tokens spent by the retro of a ticket — already counted in the tokens of that ticket"),
          ...tableau([["merges", "ticket", "retro tokens"], ...tranches.flatMap((tranche) => tranche.retros.map(({ ticket, tokens }) => [rang(tranche), ticket === null ? "no ticket" : `#${ticket}`, direEn(tokens, 0)]))]),
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
    ...(jauges.length === 0
      ? [ligne("thresholds", "none declared — nothing is flagged")]
      : jauges.flatMap((jauge, i) => [
          ligne(i === 0 ? "thresholds" : "", `${direJaugeEn(jauge)}${jauge.franchi ? " — CROSSED" : ""}`),
          ...(jauge.franchi ? (jauge.motifs ?? []) : []).map((motif) => ligne("", `  reason for the drift — ${motif}`)),
        ])),
    ...direProposition(jauges),
    ...direPlafond(livraisons),
  ];
}
