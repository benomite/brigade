// Ce que les écrans partagent : la forme d'un écran, le démarrage de la vue tel que main.ts le
// rend, et une cuisine figée — ce que des box rendraient, passé par les modules du process
// principal tels qu'ils sont (faits.ts, attend.ts, alertes.ts). Un écran n'écrit donc que ce
// qu'une box dit, mot pour mot ; ce que la vue en reçoit est calculé par le code de l'app.
import { tenirBandes } from "../../../app/src/alertes.ts";
import { ALLUMAGE } from "../../../app/src/allumage.ts";
import { mettreAPart } from "../../../app/src/attend.ts";
import { pourLaBarre } from "../../../app/src/barre.ts";
import { BOUTONS } from "../../../app/src/boutons.ts";
import type { Lecture } from "../../../app/src/box.ts";
import { type Configuration, EXEMPLE, type Projet } from "../../../app/src/config.ts";
import { PALETTE } from "../../../app/src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../../app/src/cuisine.ts";
import { GESTES_D_ATTENTE } from "../../../app/src/attente.ts";
import { BANNIERE, type Carte, type Faits, tenirFaits } from "../../../app/src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../../app/src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../../app/src/grants.ts";
import { EFFORTS, MODELES } from "../../../app/src/projets/projets.ts";
import { ONGLETS, RUBRIQUES } from "../../../app/src/onglets.ts";
import type { Vu as VuDuCode } from "../../../app/src/retard.ts";
import type { VuDesProjets } from "../../../app/src/projets/projets.ts";
import type { VuDesStations } from "../../../app/src/stations/stations.ts";

// Ce que le process principal envoie à la vue : la méthode `sur…` du pont qui le reçoit, et ses
// arguments. `demande` : le premier argument porte le numéro de la lecture qu'il sert, que la vue
// compare au sien — le faux pont y pose celui de la dernière demande de cette lecture.
export type Envoi = { sur: string; args: unknown[]; demande?: "faits" | "vue" | "onglet" };

// Tout ce que la page reçoit, figé : l'heure, une réponse par geste invoqué (par son nom dans le
// pont), et les envois qui répondent à chaque lecture — `regarder` par projet, `onglet` par
// `<projet>/<onglet>`.
export type Donnees = {
  maintenant: string;
  reponses: Record<string, unknown>;
  envois: { faits?: Envoi[]; tous?: Envoi[]; regarder?: Record<string, Envoi[]>; onglet?: Record<string, Envoi[]> };
};

// Un clic, par un sélecteur CSS — l'élément doit exister, un seul est cliqué —, ou un texte tapé dans un champ.
export type Etape = { cliquer: string } | { saisir: string; texte: string };

export type Ecran = {
  // Ce que l'écran montre, en une ligne : `--liste` l'affiche.
  dit: string;
  largeur: number;
  hauteur: number;
  // Les clics qui mènent du démarrage de l'app à l'écran, dans l'ordre ; la page se pose après chacun.
  etapes: Etape[];
  donnees(): Donnees;
};

// L'heure de toutes les captures : la vue la lit pour l'âge d'une lecture, les heures affichées.
export const MAINTENANT = "2026-10-13T10:04:12.000Z";

// Le fichier des projets que la vue reçoit, tel que barre.ts le rend.
export const configuration = (projets: Projet[], hotes: string[] = ["box"]): Configuration => ({ chemin: "/Users/chef/.config/brigade/app.json", projets, hotes });

// L'état des clones, des stations et de leurs projets, tel qu'une lecture à l'heure le rend :
// tout est à jour, une station en ligne qui sert les deux projets.
const CODE: VuDuCode = { a: MAINTENANT, clones: [{ id: "app", etat: "a-jour", tete: "this app's code: up to date with origin/v2", lignes: [] }] };
const STATIONS: VuDesStations = { a: MAINTENANT, stations: [{ id: "box", nom: "box", machine: "Debian 12 · 8 cores", etat: "en-ligne", ligne: "online · 2 projects: parade, cantine", pannes: [], dit: "online", version: "", projets: ["parade", "cantine"], max: null }] };
const PROJETS_DES_STATIONS: VuDesProjets = { a: MAINTENANT, projets: [], recommandee: null, avertissements: {} };

// La réponse de `demarrage`, comme main.ts la rend : les listes de l'app sont celles de son code.
// `ici` : les projets dont la cuisine tourne sur cet ordinateur (poste/cuisine-ici.ts).
// `tourne` : la station de cet ordinateur tourne-t-elle ? Sinon, ceux de `ici` n'ont rien à lire.
export function demarrage(projets: Configuration, ici: (nom: string) => boolean = () => false, tourne = true) {
  return {
    configuration: pourLaBarre(projets, undefined, ici, () => tourne),
    palette: PALETTE,
    exemple: EXEMPLE,
    onglets: ONGLETS,
    rubriques: RUBRIQUES,
    boutons: BOUTONS,
    gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES, attente: GESTES_D_ATTENTE },
    banniere: BANNIERE,
    calibrage: { modeles: MODELES, efforts: EFFORTS },
    code: CODE,
    stations: STATIONS,
    projetsDesStations: PROJETS_DES_STATIONS,
  };
}

// Ce qu'une box rend d'un projet : `facts`, `status` et `station`, mot pour mot — et `manager`,
// que l'app lit elle-même pour chaque projet (main.ts, la veille du manager) : absent, il n'est pas lu.
export type Rendu = { facts: Faits; status: string; station: string; manager?: string };

// Les envois d'une cuisine figée, dans l'ordre où main.ts les fait : la barre posée, `facts` de
// chaque projet, puis `manager` de ceux qui le rendent ; « Tous les projets », `status` et `station` de
// chacun ; un espace ouvert, le `status` de son projet. Chaque lecture passe par les modules de l'app, comme dans main.ts.
export function cuisine(rendus: Record<string, Rendu>): Required<Pick<Donnees["envois"], "faits" | "tous" | "regarder">> {
  const faits = tenirFaits();
  const bandes = tenirBandes({ maintenant: () => Date.parse(MAINTENANT) });
  const lecture = (projet: string, sorties: Record<string, string>): Lecture => ({ projet, demande: 0, a: MAINTENANT, sorties: Object.entries(sorties).map(([commande, texte]) => ({ commande, texte })) });
  const projets = Object.keys(rendus);
  const alertes = (bande: unknown): Envoi => ({ sur: "surAlertes", args: [bande] });
  const dessine = (recue: unknown): Envoi => ({ sur: "surFaits", args: [recue], demande: "faits" });
  // `status` lu : la lecture, ce qu'elle redessine des faits, et la bande.
  const statusLu = (projet: string, sorties: Record<string, string>): Envoi[] => {
    const montree = mettreAPart(lecture(projet, sorties));
    const redessine = faits.attendre(montree);
    return [{ sur: "surLecture", args: [montree, undefined], demande: "vue" }, ...(redessine === undefined ? [] : [dessine(redessine)]), alertes(bandes.status(montree))];
  };
  const envoisDesFaits: Envoi[] = [
    ...bandes.ouvrir(projets).map(alertes),
    ...projets.flatMap((projet) => {
      const lue = lecture(projet, { facts: JSON.stringify(rendus[projet]?.facts) });
      return [dessine(faits.recevoir(lue)), alertes(bandes.faits(lue))];
    }),
    ...projets.flatMap((projet) => {
      const manager = rendus[projet]?.manager;
      return manager === undefined ? [] : [alertes(bandes.manager(lecture(projet, { manager })))];
    }),
  ];
  const tous = projets.flatMap((projet) => statusLu(projet, { status: rendus[projet]?.status ?? "", station: rendus[projet]?.station ?? "" }));
  const regarder = Object.fromEntries(projets.map((projet) => [projet, statusLu(projet, { status: rendus[projet]?.status ?? "" })]));
  return { faits: envoisDesFaits, tous, regarder };
}

// La carte d'un ticket telle que la vue la reçoit sur le rail du projet, `facts` puis `status` lus —
// pour calculer, par les modules de l'app, ce que sa fiche demande au pont.
export function carteDe(rendu: Rendu, projet: string, ticket: number): Carte {
  const faits = tenirFaits();
  const lecture = (sorties: Record<string, string>): Lecture => ({ projet, demande: 0, a: MAINTENANT, sorties: Object.entries(sorties).map(([commande, texte]) => ({ commande, texte })) });
  faits.recevoir(lecture({ facts: JSON.stringify(rendu.facts) }));
  const recue = faits.attendre(mettreAPart(lecture({ status: rendu.status })));
  const carte = recue !== undefined && "tableau" in recue ? recue.tableau.rail.colonnes.flatMap(({ cartes }) => cartes).find((candidate) => candidate.ticket === ticket) : undefined;
  if (carte === undefined) throw new Error(`pas de carte #${ticket} sur le rail de ${projet}`);
  return carte;
}
