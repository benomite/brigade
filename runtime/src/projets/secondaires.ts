// Les stations que l'app appaire à un projet en plus de sa principale : celles
// dont le chef a dit, en ajoutant le projet, qu'elles n'en sont pas la
// principale (`principale: false` dans le `brigade-projets.json` de leur gist,
// `demande.ts`), et celles qu'il a ajoutées au projet alors qu'une station le
// servait déjà, qui en ont rejoint la cuisine (`brigade-cuisines-rejointes.json`
// de leur gist, `rejoindre.ts`). Rien d'autre ne les nomme à la principale : elle les lit dans
// les gists appairés du compte (`appairage/stations-du-chef.ts`), les déclare
// au journal du projet — la même décision que toutes ses stations
// (`BRIGADE_STATIONS`, tenue par `une-station.ts`), sans commande du chef —,
// et dit dans son suivi si chacune est atteinte.
//
// Une station secondaire est déclarée `distante+ensemble` : elle cuit à côté
// de la principale, et tire son travail (docs/runtime/station-distante.md,
// « A second station of the project »). Son nom est celui de sa machine, comme
// celui de la principale (`machineDe`) ; elle fournit `code` et `raisonnement`,
// et ce que le chef a coché pour sa machine (`fournit` de sa demande) ; son
// plafond de cooks est celui de sa demande. Son entrée suit son appairage :
// c'est dans l'app que son plafond et ses capacités changent.
//
// Atteinte : son gist s'est lu, et elle y donne signe de vie — le jugement de
// l'app (`online` de `stations-du-chef.ts`). Sinon, `dit` dit pourquoi en une
// phrase, en anglais — c'est l'app qui la montre : arrêtée, muette depuis son
// dernier signe de vie, ou GitHub qui n'a pas pu être lu.
import type { StationsDuChef } from "../appairage/stations-du-chef.ts";
import { ouvrirJournal } from "../journal.ts";
import { ConfigInvalide } from "../runtime.ts";
import type { StationDeclaree } from "../stations-declarees.ts";
import { tenirUneStation } from "../une-station.ts";
import { FICHIER_PROJETS, lireDemande } from "./demande.ts";
import { capacitesDe, machineDe } from "./preparer.ts";
import { FICHIER_REJOINTES, rejointesLues } from "./rejoindre.ts";

// Entre deux lectures des gists appairés du compte : la liste des gists et
// chacun des appairés, autant d'appels à GitHub. Cinq minutes, la cadence où
// une station réécrit son signe de vie.
export const CADENCE_DES_APPAIREES_MS = 5 * 60_000;

// Le moteur qu'un poste lance (`une-station.ts`).
const MOTEUR = "claude";

// Ce que la lecture des gists appairés rend (`lireLesStationsEtLeursGists`) :
// l'état des stations du compte, et les fichiers du gist de chacune.
export type LectureDesAppairees = { etat: StationsDuChef; gists: Map<string, Record<string, string>> };

// Pourquoi une station secondaire n'est pas atteinte, par clé, et le geste du chef qui y remédie, en une phrase
// (ce qu'il clique ou lance) : l'app montre la phrase sur la ligne de la station, à côté de la raison (`dit`).
// Un test refuse une clé sans geste.
export const GESTES_DE_LA_RAISON = {
  arretee: "start Brigade on that computer again",
  muette: "open Brigade on that computer: its station signs again within a minute",
  "gist-illisible": "check your GitHub connection in the app, the next reading tries again",
} as const;
export type RaisonPasAtteinte = keyof typeof GESTES_DE_LA_RAISON;

// Une station secondaire du projet, telle que la principale la tient. `raison` et `geste` : absents quand elle
// est atteinte, sinon la clé de ce qui l'empêche et le geste qui y remédie (`GESTES_DE_LA_RAISON`).
export type StationSecondaire = {
  // Son nom, tel qu'elle le publie.
  nom: string;
  // Le nom sous lequel le projet la déclare : `<machine>/claude`.
  station: string;
  // Son gist d'appairage : ce par quoi l'app la reconnaît.
  gist: string;
  cooks: number;
  // Ce qu'elle fournit, tel que le projet le déclare.
  fournit: string[];
  atteinte: boolean;
  dit: string;
  raison?: RaisonPasAtteinte;
  geste?: string;
};

const minuscules = (depot: string) => depot.toLowerCase();

// Pourquoi une station que son gist dit hors ligne ne l'est pas : sa clé et la phrase qui le dit.
export function pourquoiPasAtteinte(signeDeVie: string, arreteeLe: string | null): { raison: RaisonPasAtteinte; dit: string } {
  if (arreteeLe !== null && Date.parse(arreteeLe) >= Date.parse(signeDeVie)) return { raison: "arretee", dit: `not reached: it stopped at ${arreteeLe}` };
  return { raison: "muette", dit: `not reached: no sign of life on GitHub since ${signeDeVie}` };
}

// La raison et son geste, tels que le suivi les publie.
export const avecSonGeste = (raison: RaisonPasAtteinte) => ({ raison, geste: GESTES_DE_LA_RAISON[raison] });

// Les secondaires du projet `depot` dans ce que la lecture a rendu, `soi` mis
// à part — la principale, par son nom et son gist. `illisible` : GitHub n'a pas
// pu dire les stations du compte, et pourquoi.
export function secondairesDuProjet(lecture: LectureDesAppairees, depot: string, soi: { nom: string; gist: string | null }): StationSecondaire[] | { illisible: string } {
  const { etat, gists } = lecture;
  if (etat.state !== "listed") return { illisible: etat.reason };
  const trouvees: StationSecondaire[] = [];
  for (const lue of etat.stations) {
    if (!lue.cooks || lue.id === soi.gist) continue;
    const station = `${machineDe(lue.name)}/${MOTEUR}`;
    // Deux stations ne partagent pas un nom : la principale garde le sien, la
    // première lue garde l'autre.
    if (station === `${machineDe(soi.nom)}/${MOTEUR}` || trouvees.some((une) => une.station === station)) continue;
    const brut = gists.get(lue.id)?.[FICHIER_PROJETS];
    // Une station qui remet le projet (`remise`) le quitte : elle n'y cuit pas.
    const demandee = (brut === undefined ? null : lireDemande(brut))?.projets.find((projet) => minuscules(projet.depot) === minuscules(depot) && !projet.principale && (projet.remise ?? null) === null);
    // Ou celle que l'app en dit principale, mais qui a trouvé sa cuisine
    // ouverte ici, et l'a rejointe plutôt que d'en ouvrir une seconde (`rejoindre.ts`).
    const rejointe = rejointesLues(gists.get(lue.id)?.[FICHIER_REJOINTES]).find((projet) => minuscules(projet.depot) === minuscules(depot));
    const demande = demandee ?? rejointe;
    if (demande === undefined) continue;
    const pas = lue.online ? null : pourquoiPasAtteinte(lue.lastSeen, lue.stoppedAt);
    trouvees.push({ nom: lue.name, station, gist: lue.id, cooks: demande.cooks, fournit: capacitesDe(demande.fournit), atteinte: lue.online, dit: pas === null ? "reached: it is online on GitHub" : pas.dit, ...(pas === null ? {} : avecSonGeste(pas.raison)) });
  }
  return trouvees;
}

// Celles qu'une lecture précédente a trouvées, quand GitHub n'a pas pu être
// lu : aucune n'est atteinte, et `raison` dit pourquoi.
export const injoignables = (connues: readonly StationSecondaire[], raison: string): StationSecondaire[] =>
  connues.map((connue) => ({ ...connue, atteinte: false, dit: `not reached: its gist could not be read on GitHub — ${raison.replace(/[.\s]+$/, "")}`, ...avecSonGeste("gist-illisible") }));

// Comment le projet la déclare.
export const declarationDe = (secondaire: Pick<StationSecondaire, "station" | "cooks" | "fournit">): StationDeclaree => ({
  nom: secondaire.station,
  moteur: MOTEUR,
  fournit: [...secondaire.fournit],
  cooks: secondaire.cooks,
  distante: true,
  ordinaires: true,
  ensemble: true,
});

// Les déclare au journal du projet, chacune seule : les autres stations restent
// écrites comme elles l'étaient. Rend celles dont l'entrée a été écrite, et
// celles que le runtime ne lirait pas — rien n'en est écrit.
export function declarerLesSecondaires(repertoireEtat: string, projet: string, secondaires: readonly StationSecondaire[], auteur = "chef"): { ecrites: string[]; refusees: Array<{ station: string; raison: string }> } {
  const ecrites: string[] = [];
  const refusees: Array<{ station: string; raison: string }> = [];
  if (secondaires.length === 0) return { ecrites, refusees };
  const journal = ouvrirJournal(repertoireEtat);
  try {
    for (const secondaire of secondaires) {
      try {
        if (tenirUneStation(journal, { projet, station: declarationDe(secondaire), auteur }) !== null) ecrites.push(secondaire.station);
      } catch (erreur) {
        if (!(erreur instanceof ConfigInvalide)) throw erreur;
        refusees.push({ station: secondaire.station, raison: erreur.message });
      }
    }
  } finally {
    journal.fermer();
  }
  return { ecrites, refusees };
}
