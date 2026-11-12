// L'état de la cuisine hors de la fenêtre (#3269) : une icône dans la barre des menus du Mac, dans la zone de
// notification de Windows. Elle dit d'un coup d'œil combien de cooks cuisent et combien de questions attendent le chef
// — « 3 cooking · 1 for you » —, son clic liste ces questions, et le clic sur l'une ouvre l'app sur sa carte. Le chef
// la retire dans Settings (`barreDeMenus` du fichier des projets, config.ts).
//
// Ce module ne lit rien de neuf : il compte sur les derniers `faits` que la veille de l'app a déjà lus de chaque projet
// (faits.ts) — les cooks d'un projet comme l'accueil les compte (accueil.ts, `cuit`), et les entrées de son `attend`,
// ce que TODO pose. Un projet dont rien n'est encore lu n'est compté pour rien : la ligne dit combien ne le sont pas,
// et ne dit jamais « 0 » d'une cuisine qu'elle n'a pas lue. Il ne touche pas à Electron : ce qui pose l'icône lui est
// donné (`creer`), le process principal le branche.
import type { Faits } from "./faits.ts";
import { formeDuChef } from "./tableau/todo-github.ts";

// Un projet qui se lit, et ses derniers faits — absents tant qu'aucun ne l'est.
export type ProjetLu = { nom: string; faits: Faits | undefined };
// Une question qui attend le chef : la carte de TODO d'un ticket.
export type Question = { projet: string; ticket: number; question: string };
// `enBloc` : un projet dont le runtime donne combien de décisions attendent, sans les nommer (d'avant `attend`).
export type EtatDeLaCuisine = { lus: number; nonLus: number; cuisent: number; questions: Question[]; enBloc: { projet: string; combien: number }[] };

// Une entrée du menu : une ligne qui ne fait rien, une carte à ouvrir, un projet à ouvrir, la fenêtre à ramener.
export type Entree =
  | { genre: "texte"; libelle: string }
  | { genre: "separateur" }
  | { genre: "carte"; libelle: string; projet: string; ticket: number }
  | { genre: "projet"; libelle: string; projet: string }
  | { genre: "app"; libelle: string };

// Ce qui pose l'icône : sa ligne (le titre à côté d'elle sur un Mac, son survol partout), combien de questions
// attendent (la pastille de l'icône sous Windows, qui n'a pas de titre), son menu ; et la retirer.
export type Icone = { poser(ligne: string, questions: number): void; menu(entrees: Entree[]): void; retirer(): void };

// La question qu'une entrée de TODO pose : celle de sa carte, à défaut son titre, à défaut son numéro.
function questionDe({ ticket, titre, chef }: NonNullable<Faits["attend"]>[number]): string {
  const posee = chef === undefined ? null : formeDuChef(chef.texte).question;
  return posee ?? (titre.trim() === "" ? `#${ticket}` : titre);
}

export function etatDeLaCuisine(projets: readonly ProjetLu[]): EtatDeLaCuisine {
  const etat: EtatDeLaCuisine = { lus: 0, nonLus: 0, cuisent: 0, questions: [], enBloc: [] };
  for (const { nom, faits } of projets) {
    if (faits === undefined) {
      etat.nonLus++;
      continue;
    }
    etat.lus++;
    etat.cuisent += faits.cooks?.length ?? faits.compteurs.auTravail;
    if (faits.attend !== undefined) etat.questions.push(...faits.attend.map((attendu) => ({ projet: nom, ticket: attendu.ticket, question: questionDe(attendu) })));
    else if (faits.compteurs.attend > 0) etat.enBloc.push({ projet: nom, combien: faits.compteurs.attend });
  }
  return etat;
}

// Combien de questions attendent le chef, nommées ou non.
export const enAttente = (etat: EtatDeLaCuisine): number => etat.questions.length + etat.enBloc.reduce((somme, { combien }) => somme + combien, 0);

// La ligne d'un coup d'œil : « 3 cooking · 1 for you », et combien de projets ne sont pas encore lus. Rien de lu, elle le dit.
export function ligneDe(etat: EtatDeLaCuisine): string {
  if (etat.lus === 0 && etat.nonLus > 0) return "not read yet";
  const ligne = `${etat.cuisent} cooking · ${enAttente(etat)} for you`;
  return etat.nonLus === 0 ? ligne : `${ligne} · ${etat.nonLus} not read`;
}

// Un libellé de menu tient sur une ligne courte : la question coupée, jamais le projet ni le numéro.
const LONGUEUR = 80;
const court = (texte: string) => {
  const ligne = texte.replace(/\s+/g, " ").trim();
  return ligne.length <= LONGUEUR ? ligne : `${ligne.slice(0, LONGUEUR - 1).trimEnd()}…`;
};

// Le menu qu'ouvre le clic : la ligne, puis chaque question qui attend — son projet, son ticket, sa question —, et la fenêtre.
export function menuDe(etat: EtatDeLaCuisine): Entree[] {
  const questions: Entree[] = [
    ...etat.questions.map(({ projet, ticket, question }): Entree => ({ genre: "carte", libelle: `${projet} #${ticket} — ${court(question)}`, projet, ticket })),
    ...etat.enBloc.map(({ projet, combien }): Entree => ({ genre: "projet", libelle: `${projet} — ${combien} awaiting you`, projet })),
  ];
  return [
    { genre: "texte", libelle: ligneDe(etat) },
    { genre: "separateur" },
    ...(questions.length > 0 ? questions : [{ genre: "texte", libelle: "nothing waits for you" } as const]),
    { genre: "separateur" },
    { genre: "app", libelle: "Open brigade" },
  ];
}

// L'icône tenue : posée quand le réglage est allumé, retirée quand il est éteint, redite seulement quand ce qu'elle dit
// change. `creer` rend l'icône du système, ou la raison pour laquelle elle n'a pas pu être posée — dite une fois.
export function tenirBarreDeMenus({ creer, dire = (ligne) => console.error(ligne) }: { creer: () => Icone; dire?: (ligne: string) => void }) {
  let icone: Icone | undefined;
  let dite = "";
  let refus = "";
  return {
    poser(actif: boolean, projets: readonly ProjetLu[]): void {
      if (!actif) {
        icone?.retirer();
        icone = undefined;
        dite = "";
        return;
      }
      if (icone === undefined) {
        try {
          icone = creer();
          refus = "";
        } catch (erreur) {
          const raison = erreur instanceof Error ? erreur.message : String(erreur);
          if (raison !== refus) dire(`brigade: the kitchen's state could not be shown in the menu bar — ${raison}`);
          refus = raison;
          return;
        }
      }
      const etat = etatDeLaCuisine(projets);
      const entrees = menuDe(etat);
      const pose = JSON.stringify(entrees);
      if (pose === dite) return;
      dite = pose;
      icone.poser(ligneDe(etat), enAttente(etat));
      icone.menu(entrees);
    },
    fermer(): void {
      icone?.retirer();
      icone = undefined;
    },
  };
}

// --- La pastille de l'icône sous Windows ------------------------------------------------
// La zone de notification de Windows ne montre qu'une icône, sans texte à côté : le nombre de questions qui attendent y
// est peint dans un disque, en bas à droite — au-delà de 9, « + ». Le reste de la ligne est au survol.

// Les chiffres sur une grille de 3 × 5, ligne par ligne.
const CHIFFRES: Readonly<Record<string, readonly string[]>> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"],
};
// Le disque, de l'orange de l'attente ; le chiffre, blanc. Des pixels BGRA, comme Electron les rend (`toBitmap`).
const DISQUE = [0x3d, 0xa3, 0xe8, 0xff];
const CHIFFRE = [0xff, 0xff, 0xff, 0xff];

// Une copie de l'image carrée `bitmap` (BGRA, `cote` × `cote`) avec la pastille de `nombre` ; sans question, l'image telle quelle.
export function avecPastille(bitmap: Buffer, cote: number, nombre: number): Buffer {
  const peinte = Buffer.from(bitmap);
  if (nombre <= 0) return peinte;
  const pixel = (x: number, y: number, couleur: readonly number[]) => {
    if (x < 0 || y < 0 || x >= cote || y >= cote) return;
    peinte.set(couleur, (y * cote + x) * 4);
  };
  const echelle = Math.max(1, Math.floor(cote / 16));
  const rayon = 4.5 * echelle;
  const [cx, cy] = [cote - rayon, cote - rayon];
  for (let y = 0; y < cote; y++) for (let x = 0; x < cote; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rayon ** 2) pixel(x, y, DISQUE);
  const motif = CHIFFRES[nombre > 9 ? "+" : String(nombre)]!;
  const [x0, y0] = [Math.round(cx - 1.5 * echelle), Math.round(cy - 2.5 * echelle)];
  motif.forEach((ligne, j) => [...ligne].forEach((plein, i) => {
    if (plein === "1") for (let dy = 0; dy < echelle; dy++) for (let dx = 0; dx < echelle; dx++) pixel(x0 + i * echelle + dx, y0 + j * echelle + dy, CHIFFRE);
  }));
  return peinte;
}
