// Ce que les écrans partagent : la forme d'un écran, le démarrage de la vue tel que main.ts le
// rend, et une cuisine figée — ce que des box rendraient, passé par les modules du process
// principal tels qu'ils sont (faits.ts, attend.ts). Un écran n'écrit donc que ce
// qu'une box dit, mot pour mot ; ce que la vue en reçoit est calculé par le code de l'app.
import { putAside } from "../../../app/src/awaiting.ts";
import { forTheBar } from "../../../app/src/bar.ts";
import type { Kitchen, Reading } from "../../../app/src/box.ts";
import { type Configuration, EXAMPLE, type Project } from "../../../app/src/config.ts";
import { PALETTE } from "../../../app/src/colors.ts";
import { BANNER, type Card, type Facts, holdFacts } from "../../../app/src/facts.ts";
import { EFFORTS, MODELS } from "../../../app/src/projects/projects.ts";
import { TABS, HEADINGS } from "../../../app/src/tabs.ts";
import type { Seen as VuDuCode } from "../../../app/src/delay.ts";
import type { SeenOfProjects } from "../../../app/src/projects/projects.ts";
import type { SeenOfStations } from "../../../app/src/stations/stations.ts";

// Ce que le process principal envoie à la vue : la méthode `sur…` du pont qui le reçoit, et ses
// arguments. `demande` : le premier argument porte le numéro de la lecture qu'il sert, que la vue
// compare au sien — le faux pont y pose celui de la dernière demande de cette lecture.
export type Envoi = { sur: string; args: unknown[]; demande?: "faits" | "vue" | "onglet" };

// Tout ce que la page reçoit, figé : l'heure, une réponse par geste invoqué (par son nom dans le
// pont), et les envois qui répondent à chaque lecture — `regarder` par projet, `onglet` par
// `<projet>/<onglet>`.
export type Donnees = {
  maintenant: string;
  // Ce que le stockage de la vue (`localStorage`) garde déjà à l'ouverture : la trace de la dernière ouverture, par exemple.
  stockage?: Record<string, string>;
  reponses: Record<string, unknown>;
  envois: { faits?: Envoi[]; tous?: Envoi[]; regarder?: Record<string, Envoi[]>; onglet?: Record<string, Envoi[]> };
};

// Un clic, par un sélecteur CSS — l'élément doit exister, un seul est cliqué —, un texte tapé dans un champ — `valider` :
// puis quitté, son `change` déclenché (ticket 2920) —, ou un glisser du navigateur : l'élément `glisser` part, et survole
// `sur` — la capture le montre en vol ; `lacher`, il y est lâché (ticket 1347) —, ou un survol de la souris : l'élément
// `survoler` reçoit `mouseenter`, sa bulle s'ouvre (ticket 3422).
export type Etape = { cliquer: string } | { survoler: string } | { saisir: string; texte: string; valider?: true } | { glisser: string; sur: string; lacher?: true } | { soulever: string; vers: string; lacher?: true } | { defiler: string };

export type Ecran = {
  // Ce que l'écran montre, en une ligne : `--liste` l'affiche.
  dit: string;
  largeur: number;
  hauteur: number;
  // Les clics qui mènent du démarrage de l'app à l'écran, dans l'ordre ; la page se pose après chacun.
  etapes: Etape[];
  donnees(): Donnees;
};

// La cuisine que lit l'app : la station de cet ordinateur.
export const CUISINE: Kitchen = { locale: { node: "node", runtime: "/Users/chef/brigade/runtime", racine: "/Users/chef/.brigade/station", env: {} } };

// L'heure de toutes les captures : la vue la lit pour l'âge d'une lecture, les heures affichées.
export const MAINTENANT = "2026-10-13T10:04:12.000Z";

// Le fichier des projets que la vue reçoit, tel que bar.ts le rend.
export const configuration = (projets: Project[]): Configuration => ({ chemin: "/Users/chef/.config/brigade/app.json", projets });

// L'état des clones, des stations et de leurs projets, tel qu'une lecture à l'heure le rend :
// tout est à jour, une station en ligne qui sert les deux projets.
const CODE: VuDuCode = { a: MAINTENANT, clones: [{ id: "app", etat: "a-jour", tete: "this app's code: up to date with origin/v2", lignes: [] }] };
const STATIONS: SeenOfStations = { a: MAINTENANT, stations: [{ id: "box", nom: "box", machine: "Debian 12 · 8 cores", etat: "en-ligne", ligne: "online · 2 projects: parade, cantine", dit: "online", version: "", projets: ["parade", "cantine"], max: null }] };
const PROJETS_DES_STATIONS: SeenOfProjects = { a: MAINTENANT, projets: [], recommandee: null, avertissements: {}, machines: {}, calibrage: { manager: { modele: "opus", effort: "high" }, reviewer: { modele: "opus", effort: "high" }, dit: "" } };

// La réponse de `demarrage`, comme main.ts la rend : les listes de l'app sont celles de son code.
// `ici` : les projets dont la cuisine tourne sur cet ordinateur (workstation/kitchen-here.ts).
// `tourne` : la station de cet ordinateur tourne-t-elle ? Sinon, ceux de `ici` n'ont rien à lire.
// `servi` : les projets qu'une station sert, dont le rail se lit — tous, par défaut.
export function demarrage(projets: Configuration, ici: (nom: string) => boolean = () => false, tourne = true, servi: (projet: Project) => boolean = () => true) {
  return {
    configuration: forTheBar(projets, servi, ici, () => tourne),
    palette: PALETTE,
    exemple: EXAMPLE,
    onglets: TABS,
    rubriques: HEADINGS,
    banniere: BANNER,
    calibrage: { modeles: MODELS, efforts: EFFORTS },
    code: CODE,
    stations: STATIONS,
    projetsDesStations: PROJETS_DES_STATIONS,
  };
}

// Ce qu'une box rend d'un projet : `facts`, `status` et `station`, mot pour mot.
export type Rendu = { facts: Facts; status: string; station: string };

// Les envois d'une cuisine figée, dans l'ordre où main.ts les fait : la barre posée, `facts` de
// chaque projet ; « Tous les projets », `status` et `station` de
// chacun ; un espace ouvert, le `status` de son projet. Chaque lecture passe par les modules de l'app, comme dans main.ts.
export function cuisine(rendus: Record<string, Rendu>): Required<Pick<Donnees["envois"], "faits" | "tous" | "regarder">> {
  const faits = holdFacts();
  const lecture = (projet: string, sorties: Record<string, string>): Reading => ({ projet, demande: 0, a: MAINTENANT, sorties: Object.entries(sorties).map(([commande, texte]) => ({ commande, texte })) });
  const projets = Object.keys(rendus);
  const dessine = (recue: unknown): Envoi => ({ sur: "surFaits", args: [recue], demande: "faits" });
  // `status` lu : la lecture, et ce qu'elle redessine des faits.
  const statusLu = (projet: string, sorties: Record<string, string>): Envoi[] => {
    const montree = putAside(lecture(projet, sorties));
    const redessine = faits.attendre(montree);
    return redessine === undefined ? [] : [dessine(redessine)];
  };
  const envoisDesFaits: Envoi[] = [
    ...projets.flatMap((projet) => {
      const lue = lecture(projet, { facts: JSON.stringify(rendus[projet]?.facts) });
      return [dessine(faits.recevoir(lue))];
    }),
  ];
  const tous = projets.flatMap((projet) => statusLu(projet, { status: rendus[projet]?.status ?? "", station: rendus[projet]?.station ?? "" }));
  const regarder = Object.fromEntries(projets.map((projet) => [projet, statusLu(projet, { status: rendus[projet]?.status ?? "" })]));
  return { faits: envoisDesFaits, tous, regarder };
}

// La carte d'un ticket telle que la vue la reçoit sur le rail du projet, `facts` puis `status` lus —
// pour calculer, par les modules de l'app, ce que sa fiche demande au pont.
export function carteDe(rendu: Rendu, projet: string, ticket: number): Card {
  const faits = holdFacts();
  const lecture = (sorties: Record<string, string>): Reading => ({ projet, demande: 0, a: MAINTENANT, sorties: Object.entries(sorties).map(([commande, texte]) => ({ commande, texte })) });
  faits.recevoir(lecture({ facts: JSON.stringify(rendu.facts) }));
  const recue = faits.attendre(putAside(lecture({ status: rendu.status })));
  const carte = recue !== undefined && "tableau" in recue ? recue.tableau.rail.colonnes.flatMap(({ cartes }) => cartes).find((candidate) => candidate.ticket === ticket) : undefined;
  if (carte === undefined) throw new Error(`pas de carte #${ticket} sur le rail de ${projet}`);
  return carte;
}
