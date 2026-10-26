// Un profil de cook proposé (épique #1033, #1053) : une zone du code revient sur assez de tickets
// récents, et elle est livrée du premier coup bien moins souvent que le reste du projet ; le runtime
// propose d'en faire un profil de cook. `facts` le porte dans `profils` (runtime/src/profils/cartes.ts) ;
// l'app en fait une carte de la file, que le chef tranche d'un « yes » ou d'un « no ».
//
// Ce module tient les deux choses que la vue ne calcule pas :
//   - la lecture du champ `profils` de `facts`, champ pour champ (`profilsLus`) ;
//   - la carte, prête à poser (`carteDeProfil`) : le nom, le domaine, les chiffres qui le justifient
//     dits en phrases, ses tickets ouvrables, et ce que le profil contiendrait ;
// Le geste du chef ne passe pas par la box : comme celui d'une correction (correction.ts), il est posté
// sur le tableau de la cuisine du projet, `/brigade profile yes|no <proposition>` (tableau-gestes/rail.ts,
// `reponseALaFile`, #1741). La box le joue à son tick suivant ; c'est le runtime qui tranche
// (runtime/src/profils/decision.ts) — le « yes » y écrit la définition du profil dans le dépôt du projet.

// Une part livrée du premier coup : `premiers` sur `retenus` mergés, `part` entre 0 et 1.
export type PartLue = { premiers: number; retenus: number; part: number };

// Ce que `facts` dit d'un profil proposé (runtime/src/profils/cartes.ts, `CarteDeProfil`).
export type ProfilLu = {
  proposition: number;
  nom: string;
  domaine: string;
  chiffres: {
    tickets: { ticket: number; url: string | null }[];
    fenetre: number;
    domaine: PartLue;
    projet: PartLue;
    ecart: number;
    seuils: { fenetre: number; tickets: number; ecart: number };
  };
  skills: string[];
  perimetre: string[];
  carnet: { id: string; texte: string; retros: string[] }[];
  proposee: string;
};

// La carte telle que la vue la pose : elle n'y calcule rien.
// `frequence`, `premierCoup` : les chiffres qui justifient la proposition, chacun en une phrase ;
// `seuils` : ceux qui l'ont faite, pour le survol. `tickets` : ceux du domaine dans la fenêtre —
// `ouvrable`, son issue s'ouvre d'un clic (la box en a donné l'adresse, en https). `carnet` : les
// leçons de départ, chacune avec les rétros qui la portent, dites en une ligne (`de`).
export type CarteDeProfil = {
  proposition: number;
  nom: string;
  domaine: string;
  frequence: string;
  premierCoup: string;
  seuils: string;
  tickets: { ticket: number; ouvrable: boolean }[];
  skills: string[];
  perimetre: string[];
  carnet: { id: string; texte: string; de: string }[];
  proposee: string;
};

class Informe extends Error {}
const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`${champ}: expected ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "an object");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "a string"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "a non-negative integer"));
const nombre = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isFinite(valeur) ? valeur : refuser(champ, "a number"));
const liste = (valeur: unknown, champ: string): unknown[] => (Array.isArray(valeur) ? valeur : refuser(champ, "a list"));
const textes = (valeur: unknown, champ: string): string[] => liste(valeur, champ).map((un, n) => texte(un, `${champ}[${n}]`));
const partLue = (valeur: unknown, champ: string): PartLue => {
  const lue = objet(valeur, champ);
  const part = nombre(lue.part, `${champ}.part`);
  if (part < 0 || part > 1) refuser(`${champ}.part`, "a number between 0 and 1");
  return { premiers: entier(lue.premiers, `${champ}.premiers`), retenus: entier(lue.retenus, `${champ}.retenus`), part };
};

// Le champ `profils` de `facts`, champ pour champ. Un champ qui manque ou qui n'a pas sa forme refuse
// la forme entière, comme le reste de `facts` (faits.ts) : l'erreur dit lequel.
export function profilsLus(brut: unknown): ProfilLu[] {
  return liste(brut, "profils").map((un, rang) => {
    const lequel = `profils[${rang}]`;
    const lu = objet(un, lequel);
    const chiffres = objet(lu.chiffres, `${lequel}.chiffres`);
    const seuils = objet(chiffres.seuils, `${lequel}.chiffres.seuils`);
    const proposee = texte(lu.proposee, `${lequel}.proposee`);
    if (Number.isNaN(Date.parse(proposee))) refuser(`${lequel}.proposee`, "a time");
    return {
      proposition: entier(lu.proposition, `${lequel}.proposition`),
      nom: texte(lu.nom, `${lequel}.nom`),
      domaine: texte(lu.domaine, `${lequel}.domaine`),
      chiffres: {
        tickets: liste(chiffres.tickets, `${lequel}.chiffres.tickets`).map((ticket, n) => {
          const de = objet(ticket, `${lequel}.chiffres.tickets[${n}]`);
          return { ticket: entier(de.ticket, `${lequel}.chiffres.tickets[${n}].ticket`), url: de.url === null ? null : texte(de.url, `${lequel}.chiffres.tickets[${n}].url`) };
        }),
        fenetre: entier(chiffres.fenetre, `${lequel}.chiffres.fenetre`),
        domaine: partLue(chiffres.domaine, `${lequel}.chiffres.domaine`),
        projet: partLue(chiffres.projet, `${lequel}.chiffres.projet`),
        ecart: nombre(chiffres.ecart, `${lequel}.chiffres.ecart`),
        seuils: {
          fenetre: entier(seuils.fenetre, `${lequel}.chiffres.seuils.fenetre`),
          tickets: entier(seuils.tickets, `${lequel}.chiffres.seuils.tickets`),
          ecart: nombre(seuils.ecart, `${lequel}.chiffres.seuils.ecart`),
        },
      },
      skills: textes(lu.skills, `${lequel}.skills`),
      perimetre: textes(lu.perimetre, `${lequel}.perimetre`),
      carnet: liste(lu.carnet, `${lequel}.carnet`).map((lecon, n) => {
        const de = objet(lecon, `${lequel}.carnet[${n}]`);
        return { id: texte(de.id, `${lequel}.carnet[${n}].id`), texte: texte(de.texte, `${lequel}.carnet[${n}].texte`), retros: textes(de.retros, `${lequel}.carnet[${n}].retros`) };
      }),
      proposee,
    };
  });
}

// L'erreur que `profilsLus` lève sur une forme qui n'est pas la sienne : faits.ts la rend comme les siennes.
export const profilInforme = (erreur: unknown): erreur is Error => erreur instanceof Informe;

const ouvrable = (url: string | null) => url !== null && URL.parse(url)?.protocol === "https:";
const pourcent = (part: number) => `${Math.round(part * 100)}%`;
const points = (ecart: number) => {
  const arrondi = Math.round(ecart);
  return `${arrondi} point${arrondi === 1 ? "" : "s"}`;
};

// La carte d'un profil proposé, prête à poser.
export function carteDeProfil(lu: ProfilLu): CarteDeProfil {
  const { tickets, fenetre, domaine, projet, ecart, seuils } = lu.chiffres;
  return {
    proposition: lu.proposition,
    nom: lu.nom,
    domaine: lu.domaine,
    frequence: `${tickets.length} of the last ${fenetre} ticket${fenetre === 1 ? "" : "s"} served touch it`,
    premierCoup: `delivered on the first try: ${pourcent(domaine.part)} here (${domaine.premiers} of ${domaine.retenus}), against ${pourcent(projet.part)} for the whole project (${projet.premiers} of ${projet.retenus}) — ${points(ecart)} below`,
    seuils: `proposed because it touches at least ${seuils.tickets} of the last ${seuils.fenetre} tickets served and sits at least ${points(seuils.ecart)} below the project's first-try rate — the project's thresholds`,
    tickets: tickets.map(({ ticket, url }) => ({ ticket, ouvrable: ouvrable(url) })),
    skills: lu.skills,
    perimetre: lu.perimetre,
    carnet: lu.carnet.map(({ id, texte: lecon, retros }) => ({ id, texte: lecon, de: retros.length === 0 ? "" : `from ${retros.join(", ")}` })),
    proposee: lu.proposee,
  };
}
