// Une correction proposée des consignes du projet (épique #994, #999) : une cause de ratage revient sur
// plusieurs tickets récents, et le runtime propose de corriger le `CLAUDE.md`, la doc d'équipe ou les
// gates du projet. `facts` la porte dans `corrections` (runtime/src/correctif/cartes.ts) ; l'app en
// fait une carte de la file, que le chef tranche d'un « yes » ou d'un « no ».
//
// Ce module tient les trois choses que la vue ne calcule pas :
//   - la lecture du champ `corrections` de `facts`, champ pour champ (`correctionsLues`) ;
//   - la carte, prête à poser (`carteDeCorrection`) : la cause, les tickets ouvrables, le diff découpé
//     par fichier — ses lignes ajoutées et retirées comptées et dites à part —, et ce qu'elle a coûté ;
//   - ce que la vue reçoit du geste du chef (`Rendu`). Le geste ne passe pas par la box : il est posté
//     sur le tableau de la cuisine du projet, `/brigade correction yes|no <proposition>`
//     (tableau-gestes/rail.ts, `reponseALaFile`, #1741), par l'accès GitHub de l'app — sans box
//     jointe. La box le joue à son tick suivant ; c'est le runtime qui tranche
//     (runtime/src/correctif/decision.ts).

// Ce que `facts` dit d'une correction proposée (runtime/src/correctif/cartes.ts, `CarteDeCorrection`).
export type CorrectionLue = {
  proposition: number;
  cause: string;
  titre: string;
  tickets: { ticket: number; url: string | null }[];
  motif: string | null;
  diff: string;
  fichiers: string[];
  base: string;
  cout: { tokens: number };
  proposee: string;
};

// Une ligne du diff, et ce qu'elle est : `ajout` et `retrait`, les lignes que la correction pose et
// ôte ; `contexte`, celles qu'elle laisse ; `morceau`, la tête d'un morceau (`@@ … @@`) ; `note`, ce
// que `git` dit d'une fin de fichier (`\ No newline at end of file`). Le texte est la ligne entière,
// son `+`, son `-` ou son blanc de tête compris : rien n'y est récrit.
export type GenreDeLigne = "ajout" | "retrait" | "contexte" | "morceau" | "note";
export type LigneDeDiff = { genre: GenreDeLigne; texte: string };
// Un fichier que la correction touche, ses lignes ajoutées et retirées, et ses morceaux.
export type FichierDuDiff = { fichier: string; ajoutees: number; retirees: number; lignes: LigneDeDiff[] };

// La carte telle que la vue la pose : elle n'y calcule rien.
// `tickets` : ceux que la cause a fait rater — `ouvrable`, son issue s'ouvre d'un clic (la box en a
// donné l'adresse, en https). `cout` : ce que la proposition a coûté, dit en tokens. `proposee` :
// l'heure de la proposition, à l'horloge de la box.
export type CarteDeCorrection = {
  proposition: number;
  cause: string;
  titre: string;
  tickets: { ticket: number; ouvrable: boolean }[];
  motif: string | null;
  fichiers: FichierDuDiff[];
  cout: string;
  proposee: string;
};

export const OUI = "yes";
export const NON = "no";
export type Reponse = typeof OUI | typeof NON;

class Informe extends Error {}
const refuser = (champ: string, attendu: string): never => {
  throw new Informe(`${champ}: expected ${attendu}`);
};
const objet = (valeur: unknown, champ: string): Record<string, unknown> =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : refuser(champ, "an object");
const texte = (valeur: unknown, champ: string): string => (typeof valeur === "string" ? valeur : refuser(champ, "a string"));
const entier = (valeur: unknown, champ: string): number => (typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0 ? valeur : refuser(champ, "a non-negative integer"));
const liste = (valeur: unknown, champ: string): unknown[] => (Array.isArray(valeur) ? valeur : refuser(champ, "a list"));
const ouRien = <T>(valeur: unknown, lire: () => T): T | null => (valeur === null ? null : lire());

// Le champ `corrections` de `facts`, champ pour champ. Un champ qui manque ou qui n'a pas sa forme
// refuse la forme entière, comme le reste de `facts` (faits.ts) : l'erreur dit lequel.
export function correctionsLues(brut: unknown): CorrectionLue[] {
  return liste(brut, "corrections").map((une, rang) => {
    const lequel = `corrections[${rang}]`;
    const lu = objet(une, lequel);
    const cout = objet(lu.cout, `${lequel}.cout`);
    const proposee = texte(lu.proposee, `${lequel}.proposee`);
    if (Number.isNaN(Date.parse(proposee))) refuser(`${lequel}.proposee`, "a time");
    return {
      proposition: entier(lu.proposition, `${lequel}.proposition`),
      cause: texte(lu.cause, `${lequel}.cause`),
      titre: texte(lu.titre, `${lequel}.titre`),
      tickets: liste(lu.tickets, `${lequel}.tickets`).map((ticket, n) => {
        const de = objet(ticket, `${lequel}.tickets[${n}]`);
        return { ticket: entier(de.ticket, `${lequel}.tickets[${n}].ticket`), url: ouRien(de.url, () => texte(de.url, `${lequel}.tickets[${n}].url`)) };
      }),
      motif: ouRien(lu.motif, () => texte(lu.motif, `${lequel}.motif`)),
      diff: texte(lu.diff, `${lequel}.diff`),
      fichiers: liste(lu.fichiers, `${lequel}.fichiers`).map((fichier, n) => texte(fichier, `${lequel}.fichiers[${n}]`)),
      base: texte(lu.base, `${lequel}.base`),
      cout: { tokens: entier(cout.tokens, `${lequel}.cout.tokens`) },
      proposee,
    };
  });
}

// L'erreur que `correctionsLues` lève sur une forme qui n'est pas la sienne : faits.ts la rend comme
// les siennes.
export const estInforme = (erreur: unknown): erreur is Error => erreur instanceof Informe;

// Le chemin d'un fichier, d'après la tête de sa section : `+++ b/<chemin>`, sinon `diff --git a/… b/<chemin>`.
const sansPrefixe = (chemin: string) => chemin.replace(/^[ab]\//, "");

// Le diff unifié, découpé par fichier. Les lignes de tête d'un fichier (`diff --git`, `index`, `---`,
// `+++`, un mode) ne sont pas des lignes de la correction : elles le nomment, et la carte dit son nom.
// Tout le reste est gardé tel quel, dans l'ordre. Un diff sans tête de fichier reste entier, sous le
// premier fichier que la box nomme.
export function decouper(diff: string, fichiers: readonly string[] = []): FichierDuDiff[] {
  const sections: FichierDuDiff[] = [];
  let courant: FichierDuDiff | undefined;
  // Avant le premier morceau d'un fichier, on est dans sa tête.
  let enTete = false;
  const lignes = diff.replace(/\n$/, "").split("\n");
  const sansGit = !lignes.some((ligne) => ligne.startsWith("diff --git "));
  for (const [rang, ligne] of lignes.entries()) {
    const git = /^diff --git a\/(.+) b\/(.+)$/.exec(ligne);
    // Un diff sans `diff --git` : un `--- ` suivi d'un `+++ ` ouvre le fichier.
    const nu = sansGit && !enTete && ligne.startsWith("--- ") && lignes[rang + 1]?.startsWith("+++ ");
    if (git !== null || nu) {
      courant = { fichier: git?.[2] ?? "", ajoutees: 0, retirees: 0, lignes: [] };
      sections.push(courant);
      enTete = true;
      if (git !== null) continue;
    }
    if (enTete) {
      if (ligne.startsWith("+++ ") && courant !== undefined) {
        const chemin = ligne.slice(4).split("\t")[0] ?? "";
        if (chemin !== "/dev/null") courant.fichier = sansPrefixe(chemin);
      }
      if (!ligne.startsWith("@@")) continue;
      enTete = false;
    }
    if (courant === undefined) {
      courant = { fichier: fichiers[0] ?? "", ajoutees: 0, retirees: 0, lignes: [] };
      sections.push(courant);
    }
    const genre: GenreDeLigne = ligne.startsWith("@@") ? "morceau" : ligne.startsWith("+") ? "ajout" : ligne.startsWith("-") ? "retrait" : ligne.startsWith("\\") ? "note" : "contexte";
    if (genre === "ajout") courant.ajoutees++;
    if (genre === "retrait") courant.retirees++;
    courant.lignes.push({ genre, texte: ligne });
  }
  return sections;
}

const ouvrable = (url: string | null) => url !== null && URL.parse(url)?.protocol === "https:";

// La carte d'une correction, prête à poser.
export function carteDeCorrection(lue: CorrectionLue): CarteDeCorrection {
  return {
    proposition: lue.proposition,
    cause: lue.cause,
    titre: lue.titre,
    tickets: lue.tickets.map(({ ticket, url }) => ({ ticket, ouvrable: ouvrable(url) })),
    motif: lue.motif === null || lue.motif.trim() === "" ? null : lue.motif,
    fichiers: decouper(lue.diff, lue.fichiers),
    cout: `${lue.cout.tokens.toLocaleString("en-US")} token${lue.cout.tokens === 1 ? "" : "s"}`,
    proposee: lue.proposee,
  };
}

// --- Le geste du chef --------------------------------------------------------------

// Ce que la vue reçoit du geste, posté sur le tableau de la cuisine du projet (tableau-gestes/rail.ts,
// `reponseALaFile`) : la réponse est postée — `dit`, ce que la carte en dit, `detail`, l'adresse du
// commentaire, pour le survol —, et la box la tranche à son tick suivant ; ou rien n'a été posté, et
// pourquoi en une ligne — `detail`, ce que l'app a obtenu, pour le survol.
export type Rendu = { postee: Reponse; dit: string; detail: string } | { refus: string; detail: string };
