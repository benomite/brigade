// La vue du rail d'un projet, nourrie de GitHub seul (#1694, épique #1692) : ses colonnes, ses cartes, sa file TODO et
// l'état de sa cuisine se tirent du tableau de la cuisine (« Kitchen board ») que la box publie dans le dépôt du projet
// (docs/runtime/tableau-de-cuisine.md), lu par lecture.ts. Ni `ssh`, ni tailnet, ni box jointe : il suffit que l'app
// soit connectée à GitHub.
//
// Ce module rend ce que le rail lisait jusqu'ici par `ssh` sur la box, sous la même forme — une lecture de la veille
// (box.ts, `Lecture`) dont chaque sortie est celle de la commande qu'elle remplace — pour que ce qui la reçoit (faits.ts,
// attend.ts, bon.ts, alertes.ts, accueil.ts, amont.ts) dessine le même rail sans rien changer :
//   - `facts`   l'objet `faits` du bloc, celui que `facts` rend, mot pour mot ;
//   - `status`  ses rubriques, le bloc `awaiting` refait de la file, et la ligne `rail` suivie de la ligne de chaque
//               ticket (`lignesDuRail`) — ce que `status` écrit, sans ce qui ne se lit que sur la box ;
//   - `manager` la ligne de l'interrupteur du projet (`switch` de `status`), que le manager suit (#1406).
// Ce que le tableau ne porte pas (`manager upstream`, une commande composée d'après d'autres sorties) n'est pas lu : la
// lecture le dit en une phrase (`duTableau` dans l'échec), jamais un rail vide.
//
// La veille du tableau (`ouvrirVeilleDuTableau`) a l'usage de celle des box : ce qui est affiché, et les commandes à y
// lire. Ses lectures passent par `tenirLecturesDuTableau`, qui ne demande à GitHub qu'une lecture à la fois par projet,
// reprise par toutes les veilles tant qu'elle est fraîche. Aucun import de box.ts : rien ici ne peut lancer `ssh`.
import { setTimeout as attendre } from "node:timers/promises";
import type { RubriqueDuTableau } from "../../../runtime/src/tableau/rendu/bloc.ts";
import type { LectureDuTableauDuDepot, TableauLu } from "./lecture.ts";

// Les commandes que le tableau remplace, comme la veille des box les nomme (faits.ts, `COMMANDE` ; manager.ts ;
// amont.ts) : la vue du rail les demande, le tableau en rend la sortie.
export const FAITS = "facts";
export const STATUS = "status";
export const MANAGER = "manager";

// Une lecture, de la forme de celle de la veille des box (box.ts, `Lecture`) : des sorties, ou l'échec de la lecture du
// tableau — `duTableau` la distingue d'un `ssh` en échec, et `erreur` est sa raison en une phrase.
export type SortieDuTableau = { commande: string; texte: string };
export type EchecDuTableau = { erreur: string; atteinte: true; cas: null; duTableau: true };
export type LectureDuRail = { projet: string; demande: number; a: string } & ({ sorties: SortieDuTableau[] } | EchecDuTableau);
// Une commande demandée : son texte — ou ce qui le compose d'après les sorties d'avant (box.ts, `Commande`), que le
// tableau ne lit pas.
export type CommandeDemandee = string | ((...lues: never[]) => string);

// Les titres de `status` sur onze colonnes (runtime/src/etat.ts, `ligne`).
const TITRE = 11;
const ligne = (titre: string, valeur: string) => `${titre.padEnd(TITRE)}${valeur}`;
// Le bord du bloc `awaiting` (runtime/src/attend.ts, `TETE_AWAITING`, `FIN_AWAITING`).
const TETE_AWAITING = "awaiting";
const FIN_AWAITING = "end awaiting";

// Une durée, comme `status` la dit en anglais (runtime/src/etat.ts, `dureeEn`).
export function dureeEn(ms: number): string {
  const secondes = Math.max(0, Math.round(ms / 1000));
  if (secondes < 60) return `${secondes} s`;
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 48) return `${heures} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(heures / 24)} d`;
}

// Les lignes d'une rubrique, comme `status` les écrit : la première sur la ligne de son titre, les suivantes en retrait
// (rendu/donnees.ts, `rubriquesDeStatus`, qui les a lues ainsi).
const lignesDeRubrique = ({ titre, lignes }: RubriqueDuTableau): string[] =>
  lignes.map((texte, rang) => (rang === 0 ? (titre === "" ? texte : ligne(titre, texte)) : `${" ".repeat(TITRE)}${texte}`));

// Le bloc `awaiting` de `status`, refait de la file du tableau (runtime/src/attend.ts, `decrireAttentes`) : sa tête, une
// ligne par attente — son nom, depuis combien de temps, ce qui attend et le geste, son titre —, puis ce qui n'est pas
// une décision. Les durées se comptent jusqu'à la lecture de l'état par la box (`lu`), comme les siennes.
function blocAwaiting({ file, bilans, lu }: Pick<TableauLu, "file" | "bilans"> & { lu: string }): string[] {
  const depuis = (instant: string) => dureeEn(Date.parse(lu) - Date.parse(instant));
  const [premiere] = file;
  const tete =
    premiere === undefined
      ? "nothing awaits the chef"
      : file.length === 1
        ? `1 decision awaits the chef — for ${depuis(premiere.depuis)}`
        : `${file.length} decisions await the chef — the oldest for ${depuis(premiere.depuis)}`;
  return [
    ligne(TETE_AWAITING, tete),
    ...file.map(({ nom, depuis: instant, ligne: dit, titre }) => `  ${nom}  for ${depuis(instant)}  ${dit}${titre === null ? "" : `  ${titre}`}`),
    ...bilans.map((bilan) => `  ${bilan}`),
    FIN_AWAITING,
    "",
  ];
}

// La sortie de `status` que le tableau porte : ses rubriques dans l'ordre de `status`, le bloc `awaiting` juste avant la
// ligne `rail`, et sous elle la ligne de chaque ticket. Sans ce que la box seule lit (les serveurs, les worktrees, les
// transcripts, les derniers événements) : le tableau ne le porte pas.
export function statusDuTableau(lu: Pick<TableauLu, "file" | "bilans" | "cuisine" | "lignesDuRail" | "etatLuLe" | "genereLe">): string {
  const { rubriques } = lu.cuisine;
  const rangDuRail = rubriques.findIndex(({ titre }) => titre === "rail");
  const avant = rangDuRail === -1 ? rubriques : rubriques.slice(0, rangDuRail);
  const apres = rangDuRail === -1 ? [] : rubriques.slice(rangDuRail + 1);
  const rail = rangDuRail === -1 ? { titre: "rail", lignes: [`${lu.lignesDuRail?.length ?? 0} on the rail`] } : (rubriques[rangDuRail] as RubriqueDuTableau);
  return [
    ...avant.flatMap(lignesDeRubrique),
    "",
    ...blocAwaiting({ file: lu.file, bilans: lu.bilans, lu: lu.etatLuLe ?? lu.genereLe }),
    ligne("rail", rail.lignes[0] ?? ""),
    ...(lu.lignesDuRail ?? []).map(({ ligne: sienne }) => sienne),
    "",
    ...apres.flatMap(lignesDeRubrique),
    "",
  ].join("\n");
}

// La sortie de `manager` que le tableau porte : la ligne de l'interrupteur du projet, que le manager suit (#1406) et
// que `status` écrit sous `switch` — manager.ts n'y lit que celle-là. Rien, quand le tableau ne la porte pas.
export function managerDuTableau(lu: Pick<TableauLu, "cuisine">): string | undefined {
  const interrupteur = lu.cuisine.rubriques.find(({ titre }) => titre === "switch")?.lignes[0];
  return interrupteur === undefined ? undefined : `${ligne(MANAGER, interrupteur)}\n`;
}

// La sortie d'une commande demandée, tirée du tableau — ou pourquoi elle ne s'en tire pas, en une phrase.
export function sortieDuTableau(lu: TableauLu, commande: CommandeDemandee): { texte: string } | { raison: string } {
  const ou = `the Kitchen board of ${lu.depot} (issue ${lu.numero})`;
  if (commande === FAITS) {
    if (lu.resserre?.includes("faits") === true) return { raison: `The rail is not on ${ou}: the board was too long for GitHub, and the box had to leave the rail out of it.` };
    if (lu.faits === undefined) return { raison: `The rail is not on ${ou}: the box that serves it publishes a board from before the rail was on it — update brigade on the box.` };
    return { texte: JSON.stringify(lu.faits) };
  }
  if (commande === STATUS) return { texte: statusDuTableau(lu) };
  if (commande === MANAGER) {
    const texte = managerDuTableau(lu);
    return texte === undefined ? { raison: `The project switch is not on ${ou}: the box that serves it does not publish it yet.` } : { texte };
  }
  const nom = typeof commande === "string" ? `\`${commande}\`` : "this reading";
  return { raison: `${nom.charAt(0).toUpperCase()}${nom.slice(1)} is not on ${ou}: the box does not publish it there.` };
}

// La lecture de la veille que ce tableau donne, pour ces commandes, dans leur ordre : la première qui ne s'en tire pas
// fait l'échec, comme la première commande qui échoue sur une box.
export function lectureDuTableau(lu: LectureDuTableauDuDepot, projet: string, demande: number, commandes: readonly CommandeDemandee[]): LectureDuRail {
  const echec = (erreur: string): LectureDuRail => ({ projet, demande, a: lu.luLe, erreur, atteinte: true, cas: null, duTableau: true });
  if (!lu.lu) return echec(lu.raison);
  const sorties: SortieDuTableau[] = [];
  for (const commande of commandes) {
    const sortie = sortieDuTableau(lu, commande);
    if ("raison" in sortie) return echec(sortie.raison);
    sorties.push({ commande: commande as string, texte: sortie.texte });
  }
  return { projet, demande, a: lu.luLe, sorties };
}

// Les tableaux des projets, lus de GitHub : une seule lecture à la fois par projet, reprise par qui la demande tant
// qu'elle a moins de `fraicheurMs` — les veilles du rail, des faits et du manager, lancées ensemble, n'en font qu'une.
// La dernière lecture réussie de chaque projet est gardée : c'est elle que visent les gestes du rail (tableau-gestes/rail.ts).
export function tenirLecturesDuTableau<P extends { nom: string }>(options: { lire: (projet: P) => Promise<LectureDuTableauDuDepot>; fraicheurMs: number; maintenant?: () => number }) {
  const maintenant = options.maintenant ?? Date.now;
  const lues = new Map<string, { a: number; lecture: Promise<LectureDuTableauDuDepot> }>();
  const reussies = new Map<string, TableauLu>();
  return {
    lire(projet: P): Promise<LectureDuTableauDuDepot> {
      const tenue = lues.get(projet.nom);
      if (tenue !== undefined && maintenant() - tenue.a < options.fraicheurMs) return tenue.lecture;
      const lecture = options.lire(projet).then((lu) => {
        if (lu.lu) reussies.set(projet.nom, lu);
        return lu;
      });
      lues.set(projet.nom, { a: maintenant(), lecture });
      return lecture;
    },
    // La dernière lecture réussie du tableau de ce projet ; rien s'il n'a jamais été lu.
    dernier(nom: unknown): TableauLu | undefined {
      return typeof nom === "string" ? reussies.get(nom) : undefined;
    },
    // La prochaine lecture va à GitHub, sans reprendre la dernière : « read again », ou un geste posté.
    oublier(): void {
      lues.clear();
    },
  };
}

// La veille du rail sur le tableau : l'usage de celle des box (box.ts, `ouvrirVeille`) — ce qui est affiché, les
// commandes à y lire, la demande à laquelle chaque lecture répond — sans `ssh`. Chaque projet est lu tout de suite,
// puis à chaque intervalle. `lisible` : un projet dont la vue lit le rail (absent : tous).
export function ouvrirVeilleDuTableau<P extends { nom: string }>(options: {
  lire: (projet: P) => Promise<LectureDuTableauDuDepot>;
  intervalleMs: number;
  lisible?: (projet: P) => boolean;
  surLecture(lecture: LectureDuRail): void;
}) {
  let tour: AbortController | undefined;

  async function suivre(projet: P, commandes: readonly CommandeDemandee[], demande: number, signal: AbortSignal): Promise<void> {
    for (;;) {
      if (options.lisible?.(projet) ?? true) {
        // `lire` ne lève pas (lecture.ts) ; un pont qui lèverait quand même rend un échec, pas une veille arrêtée.
        const lu = await options.lire(projet).catch((erreur: unknown): LectureDuTableauDuDepot => ({ lu: false, depot: projet.nom, luLe: new Date().toISOString(), raison: `The Kitchen board was not read: ${erreur instanceof Error ? erreur.message : String(erreur)}` }));
        if (signal.aborted) return;
        options.surLecture(lectureDuTableau(lu, projet.nom, demande, commandes));
      }
      await attendre(options.intervalleMs, undefined, { signal }).catch(() => {});
      if (signal.aborted) return;
    }
  }

  function arreter(): void {
    tour?.abort();
  }

  return {
    regarder(projets: readonly P[], commandes: readonly CommandeDemandee[], demande: number): void {
      arreter();
      const { signal } = (tour = new AbortController());
      for (const projet of projets) void suivre(projet, commandes, demande, signal);
    },
    fermer: arreter,
  };
}
