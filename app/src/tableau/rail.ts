// La vue du rail d'un projet, nourrie de GitHub seul (#1694, épique #1692 ; #2061) : ses colonnes, ses cartes, sa file
// TODO et l'état de sa cuisine se tirent des issues, des labels et des PR du dépôt du projet, lus par lecture.ts. Ni
// tailnet, ni box jointe : il suffit que l'app soit connectée à GitHub.
//
// Ce module rend cette lecture sous la forme de ce que le rail lisait jusqu'ici sur la box — une lecture de la veille
// (box.ts, `Lecture`) dont chaque sortie est celle de la commande qu'elle remplace — pour que ce qui la reçoit (faits.ts,
// attend.ts, bon.ts, alertes.ts, accueil.ts, amont.ts) dessine le même rail sans rien changer :
//   - `facts`   l'objet `faits` de la lecture ;
//   - `status`  ses rubriques, le bloc `awaiting` refait des cartes du chef, et la ligne `rail` suivie de la ligne de
//               chaque ticket (`lignesDuRail`) — ce que `status` écrit, sans ce qui ne se lit que sur la box ;
//   - `manager upstream` ce qui est avant le rail (`avantLeRail`, #1836), dans la forme de la sortie de la commande —
//               chaque issue dans l'un des cinq états, son adresse déduite du dépôt.
// Ce que GitHub ne porte pas (l'interrupteur du projet, que seul le journal de sa station tient ; une commande composée
// d'après d'autres sorties) n'est pas lu : la lecture échoue en `pasPublie`, et la vue n'en dit rien — ni nombre, ni
// « pas lu » (#1770), jamais un rail vide.
//
// La veille du rail (`ouvrirVeilleDuTableau`) a l'usage de celle des box : ce qui est affiché, et les commandes à y
// lire. Ses lectures passent par `tenirLecturesDuTableau`, qui ne demande à GitHub qu'une lecture à la fois par projet,
// reprise par toutes les veilles tant qu'elle est fraîche. Aucun import de box.ts : rien ici ne peut lancer de commande.
import { setTimeout as attendre } from "node:timers/promises";
import type { LectureDuTableauDuDepot, RubriqueDuTableau, TableauLu } from "./lecture.ts";

// Les commandes que la lecture remplace, comme la veille des box les nomme (faits.ts, `COMMANDE` ; amont.ts) : la vue
// du rail les demande, la lecture en rend la sortie.
export const FAITS = "facts";
export const STATUS = "status";
export const AMONT = "manager upstream";

// Une lecture, de la forme de celle de la veille des box (box.ts, `Lecture`) : des sorties, ou l'échec de la lecture de
// GitHub — `duTableau` la distingue d'une commande en échec, et `erreur` est sa raison en une phrase.
export type SortieDuTableau = { commande: string; texte: string };
// `horsLigne` : GitHub n'a pas été joint (lecture.ts) — l'app est hors ligne, rien n'est en panne (#1818).
export type EchecDuTableau = { erreur: string; atteinte: true; cas: null; duTableau: true; pasPublie?: true; horsLigne?: true };
// `publieLe` : l'heure où l'état montré a été lu sur GitHub — l'âge du rail (#2054).
export type LectureDuRail = { projet: string; demande: number; a: string } & ({ sorties: SortieDuTableau[]; publieLe?: string } | EchecDuTableau);
// Une commande demandée : son texte — ou ce qui le compose d'après les sorties d'avant (box.ts, `Commande`), que la
// lecture ne rend pas.
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
// — la forme que bon.ts et attend.ts relisent.
const lignesDeRubrique = ({ titre, lignes }: RubriqueDuTableau): string[] =>
  lignes.map((texte, rang) => (rang === 0 ? (titre === "" ? texte : ligne(titre, texte)) : `${" ".repeat(TITRE)}${texte}`));

// Les cartes du chef que la lecture porte (`faits.attend`, todo-github.ts) : leur numéro et leur titre.
function cartesDuChef(faits: TableauLu["faits"]): { ticket: number; titre: string }[] {
  const attend: unknown = faits.attend;
  return Array.isArray(attend)
    ? attend.flatMap((carte: unknown) => {
        const { ticket, titre } = (typeof carte === "object" && carte !== null ? carte : {}) as { ticket?: unknown; titre?: unknown };
        return typeof ticket === "number" ? [{ ticket, titre: typeof titre === "string" ? titre : "" }] : [];
      })
    : [];
}

// Le bloc `awaiting` de `status`, refait des cartes du chef (runtime/src/attend.ts, `decrireAttentes`) : sa tête seule —
// chaque carte porte ce qu'elle attend (vue.js, `poserLaCarteDuChef`), et GitHub ne date pas son attente.
function blocAwaiting(cartes: readonly unknown[]): string[] {
  const tete = cartes.length === 0 ? "nothing awaits the chef" : cartes.length === 1 ? "1 decision awaits the chef" : `${cartes.length} decisions await the chef`;
  return [ligne(TETE_AWAITING, tete), FIN_AWAITING, ""];
}

// La sortie de `status` que la lecture porte : ses rubriques dans l'ordre de `status`, le bloc `awaiting` juste avant la
// ligne `rail`, et sous elle la ligne de chaque ticket. Sans ce que la box seule lit (les serveurs, les worktrees, les
// transcripts, les derniers événements) : GitHub ne le porte pas.
export function statusDuTableau(lu: Pick<TableauLu, "faits" | "cuisine" | "lignesDuRail">): string {
  const { rubriques } = lu.cuisine;
  const rangDuRail = rubriques.findIndex(({ titre }) => titre === "rail");
  const avant = rangDuRail === -1 ? rubriques : rubriques.slice(0, rangDuRail);
  const apres = rangDuRail === -1 ? [] : rubriques.slice(rangDuRail + 1);
  const rail = rangDuRail === -1 ? { titre: "rail", lignes: [`${lu.lignesDuRail.length} on the rail`] } : (rubriques[rangDuRail] as RubriqueDuTableau);
  return [
    ...avant.flatMap(lignesDeRubrique),
    "",
    ...blocAwaiting(cartesDuChef(lu.faits)),
    ligne("rail", rail.lignes[0] ?? ""),
    ...lu.lignesDuRail.map(({ ligne: sienne }) => sienne),
    "",
    ...apres.flatMap(lignesDeRubrique),
    "",
  ].join("\n");
}

// La file du chef en texte, pour le second (second/file.ts) : le bloc `awaiting` de `status`, une ligne par carte — son
// numéro et son titre —, puis la ligne `rail` et celle de chaque ticket.
export function fileDuSecond(lu: Pick<TableauLu, "faits" | "cuisine" | "lignesDuRail">): string {
  const cartes = cartesDuChef(lu.faits);
  const [tete, fin] = blocAwaiting(cartes);
  const rail = lu.cuisine.rubriques.find(({ titre }) => titre === "rail")?.lignes[0] ?? `${lu.lignesDuRail.length} on the rail`;
  return [tete, ...cartes.map(({ ticket, titre }) => `  #${ticket}  ${titre}`), fin, "", ligne("rail", rail), ...lu.lignesDuRail.map(({ ligne: sienne }) => sienne), ""].join("\n");
}

// La sortie de `manager upstream` que la lecture porte (amont.ts, `comprendre`) : l'heure où les issues ouvertes ont été
// lues, le dépôt, et chaque issue avant le rail avec l'adresse de son issue. Rien, quand elles n'ont pas été lues.
export function amontDuTableau(lu: Pick<TableauLu, "depot" | "avantLeRail">): string | undefined {
  if (lu.avantLeRail === undefined) return undefined;
  const { lu: luLe, issues } = lu.avantLeRail;
  return JSON.stringify({ lu: luLe, depot: lu.depot, issues: issues.map((issue) => ({ ...issue, url: `https://github.com/${lu.depot}/issues/${issue.ticket}` })) });
}

// La sortie d'une commande demandée, tirée de la lecture — ou pourquoi elle ne s'en tire pas, en une phrase.
export function sortieDuTableau(lu: TableauLu, commande: CommandeDemandee): { texte: string } | { raison: string; pasPublie?: true } {
  if (commande === FAITS) return { texte: JSON.stringify(lu.faits) };
  if (commande === STATUS) return { texte: statusDuTableau(lu) };
  if (commande === AMONT) {
    const texte = amontDuTableau(lu);
    if (texte !== undefined) return { texte };
  }
  const nom = typeof commande === "string" ? `\`${commande}\`` : "this reading";
  return { raison: `${nom.charAt(0).toUpperCase()}${nom.slice(1)} is not read from GitHub for ${lu.depot}: only the station's log carries it.`, pasPublie: true };
}

// La lecture de la veille que celle de GitHub donne, pour ces commandes, dans leur ordre : la première qui ne s'en tire
// pas fait l'échec, comme la première commande qui échoue sur une box.
export function lectureDuTableau(lu: LectureDuTableauDuDepot, projet: string, demande: number, commandes: readonly CommandeDemandee[]): LectureDuRail {
  const echec = (erreur: string, pasPublie?: true, horsLigne?: true): LectureDuRail => ({ projet, demande, a: lu.luLe, erreur, atteinte: true, cas: null, duTableau: true, ...(pasPublie === undefined ? {} : { pasPublie }), ...(horsLigne === undefined ? {} : { horsLigne }) });
  if (!lu.lu) return echec(lu.raison, undefined, lu.horsLigne);
  const sorties: SortieDuTableau[] = [];
  for (const commande of commandes) {
    const sortie = sortieDuTableau(lu, commande);
    if ("raison" in sortie) return echec(sortie.raison, sortie.pasPublie);
    sorties.push({ commande: commande as string, texte: sortie.texte });
  }
  return { projet, demande, a: lu.luLe, sorties, publieLe: lu.luLe };
}

// Les lectures des projets sur GitHub : une seule à la fois par projet, reprise par qui la demande tant qu'elle a moins
// de `fraicheurMs` — les veilles du rail, des faits et de l'amont, lancées ensemble, n'en font qu'une. La dernière
// lecture réussie de chaque projet est gardée : c'est elle que visent les gestes du rail (gestes-github.ts).
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
    // La dernière lecture réussie de ce projet ; rien s'il n'a jamais été lu.
    dernier(nom: unknown): TableauLu | undefined {
      return typeof nom === "string" ? reussies.get(nom) : undefined;
    },
    // La prochaine lecture va à GitHub, sans reprendre la dernière : « read again », ou un geste posté.
    oublier(): void {
      lues.clear();
    },
  };
}

// La veille du rail sur GitHub : l'usage de celle des box (box.ts, `ouvrirVeille`) — ce qui est affiché, les
// commandes à y lire, la demande à laquelle chaque lecture répond. Chaque projet est lu tout de suite,
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
        const lu = await options.lire(projet).catch((erreur: unknown): LectureDuTableauDuDepot => ({ lu: false, depot: projet.nom, luLe: new Date().toISOString(), raison: `The rail was not read: ${erreur instanceof Error ? erreur.message : String(erreur)}` }));
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
