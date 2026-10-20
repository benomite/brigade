// Ce que les cooks ont appris au projet (épique #1034, #1058) : ses leçons, provisoires et promues, et ses
// profils. `facts` le porte dans `apprentissage` (runtime/src/apprentissage/projet.ts) ; la page Reliability
// du projet le pose sous les causes corrigées. L'app n'en déduit rien : le statut, la date, les tickets et
// le nombre de cooks sont ceux du runtime.
//
// Ce module tient ce que la vue ne calcule pas :
//   - la lecture du champ `apprentissage` de `facts`, champ pour champ (`apprentissageLu`) ;
//   - la section, prête à poser (`apprentissageDe`) : l'adresse d'une leçon promue n'y passe pas — la vue
//     nomme la leçon, le process principal ouvre la ligne du carnet que la box a donnée (`faits.ts`, `lecon`).
// Une leçon, telle que `facts` la dit (runtime/src/apprentissage/projet.ts, `LeconAffichee`).
export type LeconLue = { id: string; texte: string; statut: "provisoire" | "promue"; date: string; tickets: number[]; cooks: number; url?: string };
// Un profil, tel que `facts` le dit (`ProfilAffiche`) : son carnet, ses leçons promues ou sorties.
export type ProfilApprisLu = { nom: string; domaine: string; carnet: { id: string; texte: string; etat: string }[]; tickets: number[] };
export type ApprentissageLu = { lecons: LeconLue[]; profils: ProfilApprisLu[] };

// Une leçon, telle que la vue la pose. `lien` : promue, sa ligne du carnet s'ouvre (`ouvrable`), ou la
// box n'en a pas donné d'adresse que l'app ouvre ; provisoire, elle n'en a pas.
export type Lecon = Omit<LeconLue, "url"> & { lien?: { ouvrable: boolean } };
// La section, telle que la vue la pose : vide, la page le dit en une phrase.
export type Apprentissage = { lecons: Lecon[]; profils: ProfilApprisLu[] };

class Informe extends Error {}
const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`${champ}: expected ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "an object");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "a string"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "a non-negative integer"));
const liste = (valeur: unknown, champ: string): unknown[] => (Array.isArray(valeur) ? valeur : refuser(champ, "a list"));
const tickets = (valeur: unknown, champ: string): number[] => liste(valeur, champ).map((ticket, n) => entier(ticket, `${champ}[${n}]`));
const jour = (valeur: unknown, champ: string): string => {
  const lu = texte(valeur, champ);
  return /^\d{4}-\d{2}-\d{2}$/.test(lu) && !Number.isNaN(Date.parse(lu)) ? lu : refuser(champ, "a date (YYYY-MM-DD)");
};

// Le champ `apprentissage` de `facts`, champ pour champ. Un champ qui manque ou qui n'a pas sa forme refuse
// la forme entière, comme le reste de `facts` (faits.ts) : l'erreur dit lequel. Un statut que l'app ne
// connaît pas aussi : elle ne devine pas ce qu'il vaut.
export function apprentissageLu(brut: unknown): ApprentissageLu {
  const lu = objet(brut, "apprentissage");
  return {
    lecons: liste(lu.lecons, "apprentissage.lecons").map((une, rang): LeconLue => {
      const lequel = `apprentissage.lecons[${rang}]`;
      const lecon = objet(une, lequel);
      const statut = lecon.statut === "provisoire" || lecon.statut === "promue" ? lecon.statut : refuser(`${lequel}.statut`, "provisoire or promue");
      return {
        id: texte(lecon.id, `${lequel}.id`),
        texte: texte(lecon.texte, `${lequel}.texte`),
        statut,
        date: jour(lecon.date, `${lequel}.date`),
        tickets: tickets(lecon.tickets, `${lequel}.tickets`),
        cooks: entier(lecon.cooks, `${lequel}.cooks`),
        ...(lecon.url === undefined ? {} : { url: texte(lecon.url, `${lequel}.url`) }),
      };
    }),
    profils: liste(lu.profils, "apprentissage.profils").map((un, rang): ProfilApprisLu => {
      const lequel = `apprentissage.profils[${rang}]`;
      const profil = objet(un, lequel);
      return {
        nom: texte(profil.nom, `${lequel}.nom`),
        domaine: texte(profil.domaine, `${lequel}.domaine`),
        carnet: liste(profil.carnet, `${lequel}.carnet`).map((une, n) => {
          const laquelle = `${lequel}.carnet[${n}]`;
          const lecon = objet(une, laquelle);
          return { id: texte(lecon.id, `${laquelle}.id`), texte: texte(lecon.texte, `${laquelle}.texte`), etat: texte(lecon.etat, `${laquelle}.etat`) };
        }),
        tickets: tickets(profil.tickets, `${lequel}.tickets`),
      };
    }),
  };
}

// L'erreur que `apprentissageLu` lève sur une forme qui n'est pas la sienne : faits.ts la rend comme les siennes.
export const apprentissageInforme = (erreur: unknown): erreur is Error => erreur instanceof Informe;

// La seule adresse qu'une leçon promue ouvre : la ligne de son carnet sur GitHub, en https.
export const ligneOuvrable = (url: string | undefined): url is string => url !== undefined && /^https:\/\/github\.com\/[^\s]+$/.test(url);

// La section, prête à poser. Absent de `facts` — le projet n'a ni leçon ni profil —, elle est vide.
export function apprentissageDe(lu: ApprentissageLu | undefined): Apprentissage {
  if (lu === undefined) return { lecons: [], profils: [] };
  return {
    lecons: lu.lecons.map(({ url, ...lecon }) => (lecon.statut === "promue" ? { ...lecon, lien: { ouvrable: ligneOuvrable(url) } } : lecon)),
    profils: lu.profils,
  };
}
