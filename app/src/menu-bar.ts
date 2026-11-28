// L'état de la cuisine hors de la fenêtre (#3269) : une icône dans la barre des menus du Mac, dans la zone de
// notification de Windows. Elle dit d'un coup d'œil combien de cooks cuisent et combien de questions attendent le chef
// — « 3 cooking · 1 for you » —, son clic liste ces questions, et le clic sur l'une ouvre l'app sur sa carte. Le chef
// la retire dans Settings (`barreDeMenus` du fichier des projets, config.ts).
//
// Ce module ne lit rien de neuf : il compte sur les derniers `faits` que la veille de l'app a déjà lus de chaque projet
// (facts.ts) — les cooks d'un projet comme l'accueil les compte (home.ts, `cuit`), et les entrées de son `attend`,
// ce que TODO pose. Un projet dont rien n'est encore lu n'est compté pour rien : la ligne dit combien ne le sont pas,
// et ne dit jamais « 0 » d'une cuisine qu'elle n'a pas lue. Il ne touche pas à Electron : ce qui pose l'icône lui est
// donné (`creer`), le process principal le branche.
import type { Facts } from "./facts.ts";
import { shapeOfChef } from "./board/todo-github.ts";

// Un projet qui se lit, et ses derniers faits — absents tant qu'aucun ne l'est.
export type ProjectRead = { nom: string; faits: Facts | undefined };
// Une question qui attend le chef : la carte de TODO d'un ticket.
export type Question = { projet: string; ticket: number; question: string };
// `enBloc` : un projet dont le runtime donne combien de décisions attendent, sans les nommer (d'avant `attend`).
export type StateOfTheKitchen = { lus: number; nonLus: number; cuisent: number; questions: Question[]; enBloc: { projet: string; combien: number }[] };

// Une entrée du menu : une ligne qui ne fait rien, une carte à ouvrir, un projet à ouvrir, la fenêtre à ramener.
export type Entry =
  | { genre: "texte"; libelle: string }
  | { genre: "separateur" }
  | { genre: "carte"; libelle: string; projet: string; ticket: number }
  | { genre: "projet"; libelle: string; projet: string }
  | { genre: "app"; libelle: string };

// Ce qui pose l'icône : sa ligne (le titre à côté d'elle sur un Mac, son survol partout), combien de questions
// attendent (la pastille de l'icône sous Windows, qui n'a pas de titre), son menu ; et la retirer.
export type Icon = { poser(line: string, questions: number): void; menu(entries: Entry[]): void; retirer(): void };

// La question qu'une entrée de TODO pose : celle de sa carte, à défaut son titre, à défaut son numéro.
function questionOf({ ticket, titre: title, chef }: NonNullable<Facts["attend"]>[number]): string {
  const setOne = chef === undefined ? null : shapeOfChef(chef.texte).question;
  return setOne ?? (title.trim() === "" ? `#${ticket}` : title);
}

export function kitchenState(projects: readonly ProjectRead[]): StateOfTheKitchen {
  const state: StateOfTheKitchen = { lus: 0, nonLus: 0, cuisent: 0, questions: [], enBloc: [] };
  for (const { nom: name, faits: facts } of projects) {
    if (facts === undefined) {
      state.nonLus++;
      continue;
    }
    state.lus++;
    state.cuisent += facts.compteurs.auTravail;
    if (facts.attend !== undefined) state.questions.push(...facts.attend.map((expected) => ({ projet: name, ticket: expected.ticket, question: questionOf(expected) })));
    else if (facts.compteurs.attend > 0) state.enBloc.push({ projet: name, combien: facts.compteurs.attend });
  }
  return state;
}

// Combien de questions attendent le chef, nommées ou non.
export const queued = (state: StateOfTheKitchen): number => state.questions.length + state.enBloc.reduce((sum, { combien: howMany }) => sum + howMany, 0);

// La ligne d'un coup d'œil : « 3 cooking · 1 for you », et combien de projets ne sont pas encore lus. Rien de lu, elle le dit.
export function lineOf(state: StateOfTheKitchen): string {
  if (state.lus === 0 && state.nonLus > 0) return "not read yet";
  const line = `${state.cuisent} cooking · ${queued(state)} for you`;
  return state.nonLus === 0 ? line : `${line} · ${state.nonLus} not read`;
}

// Un libellé de menu tient sur une ligne courte : la question coupée, jamais le projet ni le numéro.
const LENGTH = 80;
const court = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= LENGTH ? line : `${line.slice(0, LENGTH - 1).trimEnd()}…`;
};

// Le menu qu'ouvre le clic : la ligne, puis chaque question qui attend — son projet, son ticket, sa question —, et la fenêtre.
export function menuOf(state: StateOfTheKitchen): Entry[] {
  const questions: Entry[] = [
    ...state.questions.map(({ projet: project, ticket, question }): Entry => ({ genre: "carte", libelle: `${project} #${ticket} — ${court(question)}`, projet: project, ticket })),
    ...state.enBloc.map(({ projet: project, combien: howMany }): Entry => ({ genre: "projet", libelle: `${project} — ${howMany} awaiting you`, projet: project })),
  ];
  return [
    { genre: "texte", libelle: lineOf(state) },
    { genre: "separateur" },
    ...(questions.length > 0 ? questions : [{ genre: "texte", libelle: "nothing waits for you" } as const]),
    { genre: "separateur" },
    { genre: "app", libelle: "Open brigade" },
  ];
}

// L'icône tenue : posée quand le réglage est allumé, retirée quand il est éteint, redite seulement quand ce qu'elle dit
// change. `creer` rend l'icône du système, ou la raison pour laquelle elle n'a pas pu être posée — dite une fois.
// `ligne` dit la ligne de l'icône : celle de la cuisine par défaut, celle qui porte aussi l'état de la station quand l'app la donne (#4079).
export function holdMenuBar({ creer: create, dire: tell = (line) => console.error(line), ligne: line = (_projects, state) => lineOf(state) }: { creer: () => Icon; dire?: (line: string) => void; ligne?: (projects: readonly ProjectRead[], state: StateOfTheKitchen) => string }) {
  let icon: Icon | undefined;
  let saidOne = "";
  let refusal = "";
  return {
    poser(active: boolean, projects: readonly ProjectRead[]): void {
      if (!active) {
        icon?.retirer();
        icon = undefined;
        saidOne = "";
        return;
      }
      if (icon === undefined) {
        try {
          icon = create();
          refusal = "";
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          if (reason !== refusal) tell(`brigade: the kitchen's state could not be shown in the menu bar — ${reason}`);
          refusal = reason;
          return;
        }
      }
      const state = kitchenState(projects);
      const entries = menuOf(state);
      const pose = JSON.stringify(entries);
      if (pose === saidOne) return;
      saidOne = pose;
      icon.poser(line(projects, state), queued(state));
      icon.menu(entries);
    },
    fermer(): void {
      icon?.retirer();
      icon = undefined;
    },
  };
}

// --- La pastille de l'icône sous Windows ------------------------------------------------
// La zone de notification de Windows ne montre qu'une icône, sans texte à côté : le nombre de questions qui attendent y
// est peint dans un disque, en bas à droite — au-delà de 9, « + ». Le reste de la ligne est au survol.

// Les chiffres sur une grille de 3 × 5, ligne par ligne.
const FIGURES: Readonly<Record<string, readonly string[]>> = {
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
const DISK = [0x3d, 0xa3, 0xe8, 0xff];
const FIGURE = [0xff, 0xff, 0xff, 0xff];

// Une copie de l'image carrée `bitmap` (BGRA, `cote` × `cote`) avec la pastille de `nombre` ; sans question, l'image telle quelle.
export function withPill(bitmap: Buffer, side: number, count: number): Buffer {
  const painted = Buffer.from(bitmap);
  if (count <= 0) return painted;
  const pixel = (x: number, y: number, color: readonly number[]) => {
    if (x < 0 || y < 0 || x >= side || y >= side) return;
    painted.set(color, (y * side + x) * 4);
  };
  const scale = Math.max(1, Math.floor(side / 16));
  const radius = 4.5 * scale;
  const [cx, cy] = [side - radius, side - radius];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2) pixel(x, y, DISK);
  const motive = FIGURES[count > 9 ? "+" : String(count)]!;
  const [x0, y0] = [Math.round(cx - 1.5 * scale), Math.round(cy - 2.5 * scale)];
  motive.forEach((line, j) => [...line].forEach((full, i) => {
    if (full === "1") for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) pixel(x0 + i * scale + dx, y0 + j * scale + dy, FIGURE);
  }));
  return painted;
}
