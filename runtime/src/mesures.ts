// Le relevé des mesures tel que le chef le lit : les livraisons mergées mises
// côte à côte par tranches, la pente de chaque mesure, et les seuils qu'elle
// franchit. Des fonctions sans effet : tout leur vient des projections, rien
// n'est mesuré ici ni gardé ailleurs.
import type { Seuils } from "./evenements/derive.ts";
import type { Livraison } from "./projections/mesures.ts";

// Le nombre de merges d'une tranche, faute d'option.
export const PAR_DEFAUT = 10;
// La fenêtre sur laquelle la pente d'une mesure est jugée, en merges.
export const FENETRE_DE_PENTE = 10;
// Au-delà, les tranches les plus anciennes ne sont plus montrées.
const TRANCHES_MONTREES = 12;
const GATES = "gates_s";

const dire = (valeur: number, decimales = 1) => valeur.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
const secondes = (valeur: number) => `${dire(valeur)} s`;
const octets = (valeur: number) => (valeur < 1000 ? `${dire(valeur, 0)} o` : valeur < 1_000_000 ? `${dire(valeur / 1000)} ko` : `${dire(valeur / 1_000_000)} Mo`);
const pourcent = (valeur: number) => `${dire(valeur, 0)} %`;

// Les mesures d'état : ce que le projet pèse une fois la livraison mergée,
// sous le nom que ses gates leur donnent. `unite` : celle de leur seuil.
const ETATS = [
  { nom: "tests", titre: "tests", lire: (valeur: number) => dire(valeur, 0), seuil: "tests", unite: 1 },
  { nom: "tests_s", titre: "suite", lire: secondes, seuil: "testsSeconds", unite: 1 },
  { nom: "depot_octets", titre: "dépôt", lire: octets, seuil: "repoMb", unite: 1_000_000 },
  { nom: "contexte_octets", titre: "contexte", lire: octets, seuil: "contextKb", unite: 1000 },
  { nom: "doc_octets", titre: "doc", lire: octets, seuil: null, unite: 1 },
] as const satisfies ReadonlyArray<{ nom: string; titre: string; lire: (valeur: number) => string; seuil: keyof Seuils | null; unite: number }>;

export const SANS_SEUIL: Seuils = { tests: null, testsSeconds: null, gatesSeconds: null, contextKb: null, repoMb: null, merges: null, growthPercent: null };

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
const derniere = (livraisons: Livraison[], nom: string): number | null => livraisons.findLast((livraison) => livraison.state[nom] !== undefined)?.state[nom] ?? null;

// La part des gates dans le temps d'une livraison : leur durée, rapportée à
// cette durée plus celle de ses cooks. Nulle si l'une des deux manque.
function partDesGates({ gatesS, cooks }: Livraison): number | null {
  const cuisson = cooks.reduce((somme, cook) => somme + (cook.durationMs ?? 0), 0);
  return gatesS === null || cuisson === 0 ? null : (gatesS * 1000) / (gatesS * 1000 + cuisson);
}

// Ce qu'un ticket a demandé de tours, tous ses cooks comptés, sous le
// calibrage du dernier — celui avec lequel il a fini par passer.
function toursDuTicket({ cooks }: Livraison): { calibrage: string; tours: number } | null {
  const calibrage = cooks.at(-1)?.calibration ?? null;
  const comptes = cooks.flatMap((cook) => (cook.turns === null ? [] : [cook.turns]));
  return calibrage === null || comptes.length === 0 ? null : { calibrage, tours: comptes.reduce((somme, tours) => somme + tours, 0) };
}

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
};

export function trancher(livraisons: Livraison[], par = PAR_DEFAUT): Tranche[] {
  const tranches: Tranche[] = [];
  for (let debut = 0; debut < livraisons.length; debut += par) {
    const siennes = livraisons.slice(debut, debut + par);
    const parCalibrage = Map.groupBy(siennes.flatMap((livraison) => toursDuTicket(livraison) ?? []), ({ calibrage }) => calibrage);
    tranches.push({
      premier: debut + 1,
      dernier: debut + siennes.length,
      jusquAu: siennes.at(-1)?.at ?? "",
      etats: Object.fromEntries(ETATS.map(({ nom }) => [nom, derniere(siennes, nom)])),
      gatesS: mediane(siennes.flatMap((livraison) => livraison.measures[GATES] ?? [])),
      partGates: mediane(siennes.flatMap((livraison) => partDesGates(livraison) ?? [])),
      tours: new Map([...parCalibrage].map(([calibrage, tickets]) => [calibrage, { mediane: mediane(tickets.map(({ tours }) => tours)) ?? 0, tickets: tickets.length }])),
    });
  }
  return tranches;
}

// Une mesure face à son seuil. `observed` : dans l'unité du seuil, telle
// quelle — elle ne s'arrondit qu'à l'affichage —, ou null tant que le journal
// ne permet pas de la dire.
export type Jauge = { measure: string; observed: number | null; limit: number; franchi: boolean };
export type Franchi = { measure: string; observed: number; limit: number };

const PENTE = "growth:";

// Chaque seuil déclaré, avec ce que le projet en est. Un plafond est franchi
// quand il est dépassé ; le compteur de merges, quand il est atteint.
export function jauger(livraisons: Livraison[], seuils: Seuils): Jauge[] {
  const jauges: Jauge[] = [];
  const plafond = (measure: string, observed: number | null, limit: number | null) => {
    if (limit !== null) jauges.push({ measure, observed, limit, franchi: observed !== null && observed > limit });
  };
  for (const { nom, seuil, unite } of ETATS) {
    const valeur = derniere(livraisons, nom);
    if (seuil !== null) plafond(nom, valeur === null ? null : valeur / unite, seuils[seuil]);
  }
  plafond(GATES, derniere(livraisons, GATES), seuils.gatesSeconds);
  if (seuils.merges !== null) jauges.push({ measure: "merges", observed: livraisons.length, limit: seuils.merges, franchi: livraisons.length >= seuils.merges });
  // La pente : ce que la mesure vaut aujourd'hui, rapporté à ce qu'elle valait
  // une fenêtre de merges plus tôt.
  const avant = livraisons.slice(0, Math.max(0, livraisons.length - FENETRE_DE_PENTE));
  for (const { nom } of ETATS) {
    const [reference, valeur] = [derniere(avant, nom), derniere(livraisons, nom)];
    plafond(`${PENTE}${nom}`, reference === null || valeur === null || reference <= 0 ? null : ((valeur - reference) * 100) / reference, seuils.growthPercent);
  }
  return jauges;
}

export function franchis(livraisons: Livraison[], seuils: Seuils): Franchi[] {
  return jauger(livraisons, seuils).flatMap(({ measure, observed, limit, franchi }) => (franchi && observed !== null ? [{ measure, observed, limit }] : []));
}

const UNITES: Record<string, (valeur: number) => string> = {
  tests: (valeur) => dire(valeur, 0),
  tests_s: secondes,
  [GATES]: secondes,
  depot_octets: (valeur) => `${dire(valeur)} Mo`,
  contexte_octets: (valeur) => `${dire(valeur)} ko`,
};
const TITRES: Record<string, string> = { ...Object.fromEntries(ETATS.map(({ nom, titre }) => [nom, titre])), [GATES]: "gates" };

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
  return connues.length < 2 || premiere === undefined || fin === undefined || premiere <= 0 ? "" : `×${dire(fin / premiere)}`;
}

// Le plafond de durée que les gates du projet se donnent : la pass ne le juge
// pas, et ce relevé est l'endroit où ses dépassements se suivent. Rien n'est
// dit tant qu'aucune livraison ne l'a franchi.
function direPlafond(livraisons: Livraison[]): string[] {
  const franchies = livraisons.filter((livraison) => livraison.overCeiling !== undefined);
  const derniere = franchies.at(-1);
  if (derniere?.overCeiling === undefined) return [];
  const { cpuSeconds, limitSeconds } = derniere.overCeiling;
  const trop = limitSeconds > 0 ? ` (+${pourcent(((cpuSeconds - limitSeconds) * 100) / limitSeconds)})` : "";
  return [
    ligne(
      "plafond",
      `des gates franchi sur ${franchies.length} des ${livraisons.length} livraisons — non jugé par la pass ; la dernière : ${derniere.ticket === null ? "hors ticket" : `#${derniere.ticket}`}, ${secondes(cpuSeconds)} de processeur pour un plafond de ${secondes(limitSeconds)}${trop}`,
    ),
  ];
}

export type Releve = { projet: string | null; livraisons: Livraison[]; seuils: Seuils | null };

// Le relevé, ligne par ligne.
export function decrireReleve({ projet, livraisons, seuils }: Releve, par = PAR_DEFAUT): string[] {
  const merges = livraisons.length;
  if (merges === 0) return [ligne("relevé", `${projet ?? "inconnu — journal vide"} — aucun merge au journal : rien à relever`)];
  const toutes = trancher(livraisons, par);
  const tranches = toutes.slice(-TRANCHES_MONTREES);
  const rang = ({ premier, dernier }: Tranche) => (premier === dernier ? String(premier) : `${premier}-${dernier}`);
  const ou = <V>(valeur: V | null, lire: (valeur: V) => string) => (valeur === null ? ABSENT : lire(valeur));
  const calibrages = [...new Set(toutes.flatMap((tranche) => [...tranche.tours.keys()]))].sort();
  const jauges = jauger(livraisons, seuils ?? SANS_SEUIL);
  return [
    ligne("relevé", `${projet ?? "inconnu"} — ${merges} merge${merges > 1 ? "s" : ""} au journal, par tranches de ${par}${toutes.length > tranches.length ? ` (les ${tranches.length} dernières)` : ""}`),
    ligne("", `${merges} depuis la dernière fermeture (aucune au journal) · ${merges} depuis le dernier regard sécurité (aucun au journal)`),
    ligne("", "seules comptent les livraisons que la pass a jugées, et les cooks du journal — pas la consommation du compte"),
    "",
    ...tableau([
      ["merges", "jusqu'au", ...ETATS.slice(0, 2).map(({ titre }) => titre), "gates", "part gates", ...ETATS.slice(2).map(({ titre }) => titre)],
      ...tranches.map((tranche) => [
        rang(tranche),
        tranche.jusquAu.slice(0, 10),
        ...ETATS.slice(0, 2).map(({ nom, lire }) => ou(tranche.etats[nom] ?? null, lire)),
        ou(tranche.gatesS, secondes),
        ou(tranche.partGates, (part) => pourcent(part * 100)),
        ...ETATS.slice(2).map(({ nom, lire }) => ou(tranche.etats[nom] ?? null, lire)),
      ]),
      [
        "pente",
        "",
        ...ETATS.slice(0, 2).map(({ nom }) => pente(tranches.map((tranche) => tranche.etats[nom] ?? null))),
        pente(tranches.map((tranche) => tranche.gatesS)),
        "",
        ...ETATS.slice(2).map(({ nom }) => pente(tranches.map((tranche) => tranche.etats[nom] ?? null))),
      ],
    ]),
    "",
    ligne("tours", calibrages.length === 0 ? "aucun cook calibré derrière ces merges" : "d'un ticket, médiane par calibrage (entre parenthèses : sur combien de tickets)"),
    ...(calibrages.length === 0
      ? []
      : tableau([
          ["merges", ...calibrages],
          ...tranches.map((tranche) => [
            rang(tranche),
            ...calibrages.map((calibrage) => ou(tranche.tours.get(calibrage) ?? null, ({ mediane: tours, tickets }) => `${dire(tours)} (${tickets})`)),
          ]),
        ])),
    "",
    ...(jauges.length === 0
      ? [ligne("seuils", "aucun déclaré — rien n'est signalé")]
      : jauges.map((jauge, i) => ligne(i === 0 ? "seuils" : "", `${direJauge(jauge)}${jauge.franchi ? " — FRANCHI" : ""}`))),
    ...direPlafond(livraisons),
  ];
}
