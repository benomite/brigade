// La fiabilité des cooks d'un projet (#987) : sur ses derniers tickets servis, la part livrée du
// premier coup face à son seuil, le nombre moyen d'essais par ticket, les tokens perdus en essais
// ratés, et les causes d'échec qui reviennent le plus. L'app n'en calcule rien : chaque chiffre est
// celui que la box écrit dans `measures` (docs/runtime/etat-et-mesures.md, « Le relevé des mesures ») —
// ses blocs `retries`, `failures` et `launches` —, et chaque seuil celui que `station` écrit sous
// « chef's decisions ». Aucun fait nouveau n'est demandé au runtime.
//
// La fenêtre est celle de la dérive du premier coup, que la file de `status` signale : `fenetre-renvois`
// (10 faute de réglage), et son seuil `seuil-renvois` (50 %). La lecture lit donc `station` d'abord, puis
// `measures --last <fenêtre>`, pour que la page et la ligne `drift` de `status` jugent les mêmes tickets.
// Et le minimum pour mesurer est celui de la dérive : la fenêtre pleine, dont au moins un ticket mergé.
// En deçà, la page le dit — jamais des zéros.
//
// Les tokens perdus sont ceux que le runtime juge face à `seuil-perdus` : sur les 10 derniers merges
// (runtime/src/mesures.ts, `FENETRE_DE_PENTE`). `measures --by 1` range chaque merge dans sa tranche :
// chaque ligne du bloc `launches` porte alors son rang, et la somme se fait sur les dix derniers.
import type { Commande, Lecture, Sortie } from "./box.ts";

export const ONGLET = "fiabilite";
export const STATION = "station";
export const MESURES = "measures";

// Faute de réglage du chef, ceux du runtime (runtime/src/renvois.ts).
export const FENETRE_PAR_DEFAUT = 10;
export const SEUIL_PAR_DEFAUT = 50;
// Les merges sur lesquels le runtime compte les tokens perdus (runtime/src/mesures.ts, `FENETRE_DE_PENTE`).
export const MERGES_DES_PERDUS = 10;
// Les causes montrées, au plus.
export const CAUSES_MONTREES = 3;

// Les réglages du chef, tels que `station` les écrit : « seuil-renvois       40 », ou « not set — … ».
export type Reglages = { fenetre: number; seuil: number; seuilPose: boolean; seuilPerdus: number | null };

const REGLAGE = /^\s+(seuil-renvois|fenetre-renvois|seuil-perdus)\s+(\S.*)$/;
const entier = (dit: string): number | null => {
  const lu = /^\d[\d\s  .,]*$/.test(dit.trim()) ? Number(dit.replace(/\D/g, "")) : Number.NaN;
  return Number.isSafeInteger(lu) && lu > 0 ? lu : null;
};

// Le bloc s'arrête à la première ligne qui n'est plus en retrait ; un réglage absent ou illisible vaut le défaut.
export function reglagesDe(station: string): Reglages {
  const lus = new Map<string, number>();
  const lignes = station.split("\n");
  const debut = lignes.findIndex((ligne) => /^(chef's decisions|décisions du chef)/.test(ligne));
  if (debut !== -1) {
    for (const ligne of lignes.slice(debut + 1)) {
      if (!/^\s/.test(ligne)) break;
      const [, nom, valeur] = REGLAGE.exec(ligne) ?? [];
      const lu = valeur === undefined ? null : entier(valeur);
      if (nom !== undefined && lu !== null) lus.set(nom, lu);
    }
  }
  const seuil = lus.get("seuil-renvois");
  return { fenetre: lus.get("fenetre-renvois") ?? FENETRE_PAR_DEFAUT, seuil: seuil ?? SEUIL_PAR_DEFAUT, seuilPose: seuil !== undefined, seuilPerdus: lus.get("seuil-perdus") ?? null };
}

// Ce que la veille lance, dans l'ordre : `station`, puis `measures` sur la fenêtre qu'il dit.
export const mesuresSur = (fenetre: number) => `${MESURES} --last ${fenetre} --by 1`;
export const COMMANDES: readonly Commande[] = [STATION, (lues: readonly Sortie[]) => mesuresSur(reglagesDe(lues.find(({ commande }) => commande === STATION)?.texte ?? "").fenetre)];

// --- Ce que `measures` écrit ------------------------------------------------------

// Un bloc de `measures` : sa ligne de tête (titre sur onze colonnes), et les lignes en retrait qui la suivent.
function blocDe(texte: string, titre: string): string[] | undefined {
  const lignes = texte.split("\n");
  const debut = lignes.findIndex((ligne) => ligne.startsWith(titre.padEnd(11)) || ligne === titre);
  if (debut === -1) return undefined;
  const bloc = [(lignes[debut] ?? "").slice(11).trim()];
  for (const ligne of lignes.slice(debut + 1)) {
    if (ligne.trim() === "" || !/^\s/.test(ligne)) break;
    bloc.push(ligne.trim());
  }
  return bloc;
}

const nombre = (dit: string) => Number(dit.replaceAll(",", ""));

// Le bloc `retries` (runtime/src/renvois.ts, `decrireRenvois`).
export type Renvois = { servis: number; retenus: number; ecartes: number; premiers: number; essaisMoyens: number } | { servis: number; retenus: number };
export function renvoisDe(texte: string): Renvois | undefined {
  const bloc = blocDe(texte, "retries");
  if (bloc === undefined) return undefined;
  const [tete = "", ...suite] = bloc;
  if (/^no served ticket in the log/.test(tete)) return { servis: 0, retenus: 0 };
  const [, servis, retenus, ecartes] = /: (\d+) in the log, (\d+) kept, (\d+) set aside/.exec(tete) ?? [];
  if (servis === undefined || retenus === undefined || ecartes === undefined) return undefined;
  const [, premiers] = /^delivered on the first try: [\d.,]+% \((\d+) of \d+\)$/.exec(suite.find((ligne) => ligne.startsWith("delivered on the first try")) ?? "") ?? [];
  const [, essais] = /^attempts per ticket: ([\d.,]+) on average$/.exec(suite.find((ligne) => ligne.startsWith("attempts per ticket")) ?? "") ?? [];
  if (premiers === undefined || essais === undefined) return { servis: Number(servis), retenus: Number(retenus) };
  return { servis: Number(servis), retenus: Number(retenus), ecartes: Number(ecartes), premiers: Number(premiers), essaisMoyens: nombre(essais) };
}

// Le bloc `failures` (runtime/src/causes-des-ratages.ts, `decrireCauses`) : chaque cause, son nombre
// d'essais, sa part en pourcents entiers, et ses derniers tickets, les plus récents d'abord.
export type Cause = { titre: string; essais: number; pourcent: number; tickets: number[] };
export type Causes = { rates: number; causes: Cause[] };
const CAUSE = /^(.+): (\d+) \((\d+)%\)(?: — (#\d+(?:, #\d+)*))?$/;
export function causesDe(texte: string): Causes | undefined {
  const bloc = blocDe(texte, "failures");
  if (bloc === undefined) return undefined;
  const [tete = "", ...suite] = bloc;
  if (/^no failed attempt/.test(tete)) return { rates: 0, causes: [] };
  const [, rates] = /^(\d+) failed attempts?/.exec(tete) ?? [];
  if (rates === undefined) return undefined;
  const causes = suite.flatMap((ligne) => {
    const [, titre, essais, pourcent, tickets] = CAUSE.exec(ligne) ?? [];
    if (titre === undefined || essais === undefined || pourcent === undefined) return [];
    return [{ titre, essais: Number(essais), pourcent: Number(pourcent), tickets: tickets === undefined ? [] : [...tickets.matchAll(/#(\d+)/g)].map(([, numero]) => Number(numero)) }];
  });
  return { rates: Number(rates), causes };
}

// Les tokens perdus des derniers merges : la colonne `lost` du bloc `launches`, sur les lignes des
// `MERGES_DES_PERDUS` derniers rangs. Un ticket dont des lancements n'ont pas de tokens connus rend la
// somme minimale. `merges` : sur combien de merges elle porte — moins de dix, quand le journal en a moins.
export type Perdus = { tokens: number; minimum: boolean; merges: number };
export function perdusDe(texte: string): Perdus | undefined {
  const tete = blocDe(texte, "report")?.[0] ?? "";
  if (/no merge in the log/.test(tete)) return { tokens: 0, minimum: false, merges: 0 };
  const [, total, par] = /— (\d+) merges? in the log, in slices of (\d+)/.exec(tete) ?? [];
  // Sans tranches d'un merge, les rangs ne se lisent pas : la somme ne se fait pas.
  if (total === undefined || par !== "1") return undefined;
  const merges = Math.min(Number(total), MERGES_DES_PERDUS);
  const lignes = texte.split("\n");
  const debut = lignes.findIndex((ligne) => ligne.startsWith("launches".padEnd(11)));
  if (debut === -1) return undefined;
  if (/no ticket launched more than once/.test(lignes[debut] ?? "")) return { tokens: 0, minimum: false, merges };
  let tokens = 0;
  let minimum = false;
  // Le tableau suit sa ligne de tête, sous son en-tête de colonnes, jusqu'à la ligne vide.
  for (const ligne of lignes.slice(debut + 2)) {
    if (ligne.trim() === "") break;
    const [rang, , lancements = "", , , perdu = ""] = ligne.trim().split(/ {2,}/);
    if (rang === undefined || !/^\d+$/.test(rang) || Number(rang) <= Number(total) - merges) continue;
    if (/unknown tokens/.test(lancements)) minimum = true;
    const [, lu] = /^([\d,]+)(?: \(|$)/.exec(perdu) ?? [];
    if (lu === undefined) minimum = true;
    else tokens += nombre(lu);
  }
  return { tokens, minimum, merges };
}

// --- Ce que la page pose ----------------------------------------------------------

// `sous` : la part est sous son seuil — comme dans la file, elle est mise en évidence.
// `depasse` : les tokens perdus dépassent `seuil-perdus` ; sans seuil posé, rien n'est jugé.
export type Mesure = {
  fenetre: number;
  servis: number;
  retenus: number;
  ecartes: number;
  premierCoup: { premiers: number; retenus: number; pourcent: number; seuil: number; seuilPose: boolean; sous: boolean };
  essaisMoyens: number;
  perdus: (Perdus & { seuil: number | null; depasse: boolean }) | null;
  causes: Causes | null;
};
// `sans` : la lecture n'a pas donné de quoi mesurer, et pourquoi, dans les mots de l'app.
// `pasAssez` : pas encore assez de tickets servis pour mesurer.
export type Vu = { projet: string; demande: number; a: string } & ({ sans: string } | { pasAssez: { servis: number; retenus: number; fenetre: number } } | { mesure: Mesure });

const PAS_LU = "the reliability was not read: what the app got in its place is below";
const ANCIEN = "the reliability is not communicated: the measures of this station do not count retries yet — its runtime predates it";

export function voir(lecture: Lecture): Vu {
  const { projet, demande, a } = lecture;
  if ("erreur" in lecture) return { projet, demande, a, sans: PAS_LU };
  const station = lecture.sorties.find(({ commande }) => commande === STATION)?.texte;
  const mesures = lecture.sorties.find(({ commande }) => commande.split(" ")[0] === MESURES)?.texte;
  if (station === undefined || mesures === undefined) return { projet, demande, a, sans: PAS_LU };
  const reglages = reglagesDe(station);
  const renvois = renvoisDe(mesures);
  if (renvois === undefined) return { projet, demande, a, sans: ANCIEN };
  if (!("premiers" in renvois) || renvois.servis < reglages.fenetre || renvois.retenus === 0) return { projet, demande, a, pasAssez: { servis: renvois.servis, retenus: renvois.retenus, fenetre: reglages.fenetre } };
  const { servis, retenus, ecartes, premiers, essaisMoyens } = renvois;
  const perdus = perdusDe(mesures);
  return {
    projet,
    demande,
    a,
    mesure: {
      fenetre: reglages.fenetre,
      servis,
      retenus,
      ecartes,
      // Le jugement de la dérive (runtime/src/renvois.ts, `derivePremierCoup`) : strictement sous le seuil.
      premierCoup: { premiers, retenus, pourcent: Math.round((premiers * 100) / retenus), seuil: reglages.seuil, seuilPose: reglages.seuilPose, sous: (premiers * 100) / retenus < reglages.seuil },
      essaisMoyens,
      perdus: perdus === undefined ? null : { ...perdus, seuil: reglages.seuilPerdus, depasse: reglages.seuilPerdus !== null && perdus.tokens > reglages.seuilPerdus },
      causes: ((causes) => (causes === undefined ? null : { rates: causes.rates, causes: causes.causes.filter(({ essais }) => essais > 0).sort((x, y) => y.essais - x.essais).slice(0, CAUSES_MONTREES) }))(causesDe(mesures)),
    },
  };
}

// --- La dérive, dans `status` ---------------------------------------------------------

// Ce que la file dit d'une fiabilité qui a dérivé : ses lignes `drift` (runtime/src/etat.ts) — la part
// livrée du premier coup sous son seuil, ou les tokens perdus au-delà du leur —, sans le geste qui les
// suit. Les autres seuils franchis (tests, dépôt, ticket le plus cher) ne sont pas la fiabilité des cooks.
export function deriveDe(status: string): string[] {
  return [...status.matchAll(/^drift {6}(.*)$/gm)].flatMap(([, ligne = ""]) => {
    const dite = ligne.replace(/ — `[^`]*`$/, "");
    if (/delivered on the first try/.test(dite)) return [dite];
    return dite.split(" · ").filter((jauge) => /^tokens lost over the last/.test(jauge));
  });
}
