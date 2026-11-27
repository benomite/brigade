// Ce que les cooks ont appris au projet (épique #1034, #1058) : ses leçons, provisoires et promues, et ses
// profils. `facts` le porte dans `apprentissage` (runtime/src/apprentissage/projet.ts) ; la page Reliability
// du projet le pose sous les causes corrigées. L'app n'en déduit rien : le statut, la date, les tickets et
// le nombre de cooks sont ceux du runtime.
//
// Ce module tient ce que la vue ne calcule pas :
//   - la lecture du champ `apprentissage` de `facts`, champ pour champ (`apprentissageLu`) ;
//   - la section, prête à poser (`apprentissageDe`) : l'adresse d'une leçon promue n'y passe pas — la vue
//     nomme la leçon, le process principal ouvre la ligne du carnet que la box a donnée (`facts.ts`, `lecon`).
// La livraison d'un côté de la date d'entrée (runtime/src/apprentissage/progres.ts, `Livraison`) : `null`,
// aucun ticket mergé de ce côté.
export type Delivery = { retenus: number; premiers: number; premierCoup: number; essaisMoyens: number };
export type Progress = { avant: Delivery | null; apres: Delivery | null };
// D'où une leçon est née (runtime/src/carnet/carnet.ts, `LessonOrigin`) : une rétro, ou le renvoi de la pass ou la
// correction du chef sur un ticket.
export type Origin = { kind: "retro" } | { kind: "pass-send-back"; ticket: number } | { kind: "chef-correction"; ticket: number };
// Une leçon, telle que `facts` la dit (runtime/src/apprentissage/projet.ts, `LeconAffichee`).
export type LessonRead = { id: string; texte: string; statut: "provisoire" | "promue"; date: string; tickets: number[]; origine: Origin; cooks: number; url?: string; progres: Progress };
// Un profil, tel que `facts` le dit (`ProfilAffiche`) : son carnet, ses leçons promues ou sorties.
export type ProfileLearnedRead = { nom: string; domaine: string; skills: string[]; perimetre: string[]; carnet: { id: string; texte: string; etat: string }[]; tickets: number[]; progres: Progress };
export type LearningRead = { lecons: LessonRead[]; profils: ProfileLearnedRead[] };

// Une leçon, telle que la vue la pose. `lien` : promue, sa ligne du carnet s'ouvre (`ouvrable`), ou la
// box n'en a pas donné d'adresse que l'app ouvre ; provisoire, elle n'en a pas.
export type Lesson = Omit<LessonRead, "url"> & { lien?: { ouvrable: boolean } };
// La section, telle que la vue la pose : vide, la page le dit en une phrase.
export type Learning = { lecons: Lesson[]; profils: ProfileLearnedRead[] };

class Informs extends Error {}
const refuse = (field: string, expected: string): never => {
  throw new Informs(`${field}: expected ${expected}`);
};
const object = (value: unknown, field: string): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : refuse(field, "an object");
const text = (value: unknown, field: string): string => (typeof value === "string" ? value : refuse(field, "a string"));
const whole = (value: unknown, field: string): number => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : refuse(field, "a non-negative integer"));
const list = (value: unknown, field: string): unknown[] => (Array.isArray(value) ? value : refuse(field, "a list"));
const texts = (value: unknown, field: string): string[] => list(value, field).map((oneOf, n) => text(oneOf, `${field}[${n}]`));
const tickets = (value: unknown, field: string): number[] => list(value, field).map((ticket, n) => whole(ticket, `${field}[${n}]`));
// Un nombre fini qui n'est pas négatif : jamais NaN, jamais infini.
const measure = (value: unknown, field: string): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : refuse(field, "a non-negative number"));
const delivery = (value: unknown, field: string): Delivery | null => {
  if (value === null) return null;
  const readOne = object(value, field);
  return {
    retenus: whole(readOne.retenus, `${field}.retenus`),
    premiers: whole(readOne.premiers, `${field}.premiers`),
    premierCoup: measure(readOne.premierCoup, `${field}.premierCoup`),
    essaisMoyens: measure(readOne.essaisMoyens, `${field}.essaisMoyens`),
  };
};
// Un runtime d'avant #1057 n'écrit pas `progres` : rien n'est mesuré, des deux côtés.
const progress = (value: unknown, field: string): Progress => {
  if (value === undefined) return { avant: null, apres: null };
  const readOne = object(value, field);
  return { avant: delivery(readOne.avant, `${field}.avant`), apres: delivery(readOne.apres, `${field}.apres`) };
};
const day = (value: unknown, field: string): string => {
  const readOne = text(value, field);
  return /^\d{4}-\d{2}-\d{2}$/.test(readOne) && !Number.isNaN(Date.parse(readOne)) ? readOne : refuse(field, "a date (YYYY-MM-DD)");
};

// L'origine d'une leçon. Une leçon sans origine — la box d'avant ce champ — est une rétro, comme le carnet
// d'avant l'origine se lit (carnet.ts) ; une origine qui n'est pas l'une des trois refuse la forme.
const origin = (value: unknown, field: string): Origin => {
  if (value === undefined) return { kind: "retro" };
  const readOne = object(value, field);
  if (readOne.kind === "retro") return { kind: "retro" };
  if (readOne.kind === "pass-send-back" || readOne.kind === "chef-correction") {
    const ticket = readOne.ticket;
    return { kind: readOne.kind, ticket: typeof ticket === "number" && Number.isSafeInteger(ticket) && ticket > 0 ? ticket : refuse(`${field}.ticket`, "a ticket number") };
  }
  return refuse(`${field}.kind`, "retro, pass-send-back or chef-correction");
};

// Le champ `apprentissage` de `facts`, champ pour champ. Un champ qui manque ou qui n'a pas sa forme refuse
// la forme entière, comme le reste de `facts` (facts.ts) : l'erreur dit lequel. Un statut que l'app ne
// connaît pas aussi : elle ne devine pas ce qu'il vaut.
export function learningRead(raw: unknown): LearningRead {
  const readOne = object(raw, "apprentissage");
  return {
    lecons: list(readOne.lecons, "apprentissage.lecons").map((one, rank): LessonRead => {
      const which = `apprentissage.lecons[${rank}]`;
      const lesson = object(one, which);
      const status = lesson.statut === "provisoire" || lesson.statut === "promue" ? lesson.statut : refuse(`${which}.statut`, "provisoire or promue");
      return {
        id: text(lesson.id, `${which}.id`),
        texte: text(lesson.texte, `${which}.texte`),
        statut: status,
        date: day(lesson.date, `${which}.date`),
        tickets: tickets(lesson.tickets, `${which}.tickets`),
        origine: origin(lesson.origine, `${which}.origine`),
        cooks: whole(lesson.cooks, `${which}.cooks`),
        ...(lesson.url === undefined ? {} : { url: text(lesson.url, `${which}.url`) }),
        progres: progress(lesson.progres, `${which}.progres`),
      };
    }),
    profils: list(readOne.profils, "apprentissage.profils").map((oneOf, rank): ProfileLearnedRead => {
      const which = `apprentissage.profils[${rank}]`;
      const profile = object(oneOf, which);
      return {
        nom: text(profile.nom, `${which}.nom`),
        domaine: text(profile.domaine, `${which}.domaine`),
        skills: texts(profile.skills, `${which}.skills`),
        perimetre: texts(profile.perimetre, `${which}.perimetre`),
        carnet: list(profile.carnet, `${which}.carnet`).map((one, n) => {
          const whichOne = `${which}.carnet[${n}]`;
          const lesson = object(one, whichOne);
          return { id: text(lesson.id, `${whichOne}.id`), texte: text(lesson.texte, `${whichOne}.texte`), etat: text(lesson.etat, `${whichOne}.etat`) };
        }),
        tickets: tickets(profile.tickets, `${which}.tickets`),
        progres: progress(profile.progres, `${which}.progres`),
      };
    }),
  };
}

// L'erreur que `apprentissageLu` lève sur une forme qui n'est pas la sienne : facts.ts la rend comme les siennes.
export const learningInforms = (error: unknown): error is Error => error instanceof Informs;

// La seule adresse qu'une leçon promue ouvre : la ligne de son carnet sur GitHub, en https.
export const lineOpenable = (url: string | undefined): url is string => url !== undefined && /^https:\/\/github\.com\/[^\s]+$/.test(url);

// La section, prête à poser. Absent de `facts` — le projet n'a ni leçon ni profil —, elle est vide.
export function learningOf(readOne: LearningRead | undefined): Learning {
  if (readOne === undefined) return { lecons: [], profils: [] };
  return {
    lecons: readOne.lecons.map(({ url, ...lesson }) => (lesson.statut === "promue" ? { ...lesson, lien: { ouvrable: lineOpenable(url) } } : lesson)),
    profils: readOne.profils,
  };
}
