// La fiche d'un ticket : ce qu'il porte en plus de ses labels — les tickets
// qu'il attend, la zone de fichiers qu'il possède, les capacités qu'il demande
// à sa station. Elle vit dans un commentaire
// de l'issue, repéré par un marqueur et fait de lignes « clé : valeur », qu'un
// humain lit et corrige à la main. Ce module la lit, sans E/S : tout ce qu'il
// ne comprend pas devient un problème dit, jamais un champ vide.
import { capacite, CAPACITE, CLE_DES_CAPACITES, FORME_DE_CAPACITE } from "./capacites.ts";
import { refus } from "./zones.ts";

export const MARQUEUR = "<!-- brigade:fiche -->";

export type Card = {
  // Les tickets que celui-ci attend.
  waitsFor: number[];
  // Les chemins du dépôt qu'il possède.
  zone: string[];
  // Les capacités qu'il demande : il ne part que dans une station qui les
  // fournit toutes. Absent d'une fiche qui n'en demande aucune — elle se lit,
  // et s'écrit au journal, exactement comme avant que cette ligne n'existe.
  requires?: string[];
  // Ce que le runtime n'a pas compris, en clair. Vide : la fiche est lisible.
  problems: string[];
};

const CLES = ["attend", "zone", CLE_DES_CAPACITES] as const;

const EN_TETE_DE_LIGNE = /^\s*<!--\s*brigade:fiche\s*-->/i;
const BLOC_DE_CODE = /^\s*(```|~~~)/;
const PUCE = /^\s*[-*+]\s+/;
// « clé : valeur », la clé d'un seul mot, éventuellement en gras ou en code.
// Une adresse (« https://… ») n'est pas un champ. Ce qui suit les deux-points
// est la valeur, telle quelle : un chemin peut commencer par `*` ou `_`.
const CHAMP = /^([*_`]*)([\p{L}][\p{L}\p{N}_-]*)[*_`]*\s*:(?!\/\/)(.*)$/u;
// Les façons d'écrire qu'un champ ne porte rien.
const RIEN = /^(rien|aucune?|-|—)?$/i;

// Les lignes d'un commentaire, sans celles de ses blocs de code : un format
// cité n'est pas une fiche.
function lignesHorsCode(corps: string): string[] {
  let dansUnBloc = false;
  return corps.split(/\r?\n/).filter((ligne) => {
    if (BLOC_DE_CODE.test(ligne)) {
      dansUnBloc = !dansUnBloc;
      return false;
    }
    return !dansUnBloc;
  });
}

// Le marqueur ne compte qu'en tête de ligne : le citer dans une phrase, ou dans
// une réponse (« > »), ne pose pas de fiche.
const marqueurs = (corps: string) => lignesHorsCode(corps).filter((ligne) => EN_TETE_DE_LIGNE.test(ligne)).length;

export function hasCard(corps: string): boolean {
  return marqueurs(corps) > 0;
}

function tickets(valeur: string, problemes: string[]): number[] {
  const numeros = new Set<number>();
  for (const mot of RIEN.test(valeur) ? [] : valeur.split(/[\s,]+/).filter(Boolean)) {
    const numero = Number(/^#([1-9]\d*)$/.exec(mot)?.[1]);
    if (Number.isSafeInteger(numero)) numeros.add(numero);
    else problemes.push(`attend : « ${mot} » n'est pas un numéro de ticket — attendu une liste comme #68, #69`);
  }
  return [...numeros];
}

function chemins(valeur: string, problemes: string[]): string[] {
  const zone = new Set<string>();
  for (const brut of RIEN.test(valeur) ? [] : valeur.split(",")) {
    const chemin = brut.trim().replace(/^`(.*)`$/, "$1").trim();
    if (chemin === "") continue;
    const pourquoi = refus(chemin);
    if (pourquoi !== null) {
      problemes.push(`zone : « ${chemin} » ${pourquoi} — attendu des chemins relatifs à sa racine, fichiers ou dossiers, séparés par des virgules`);
    } else zone.add(chemin);
  }
  return [...zone];
}

function capacites(valeur: string, problemes: string[]): string[] {
  const demandees = new Set<string>();
  for (const brut of RIEN.test(valeur) ? [] : valeur.split(/[\s,]+/)) {
    const nom = capacite(brut.replace(/^`(.*)`$/, "$1"));
    if (nom === "") continue;
    if (CAPACITE.test(nom)) demandees.add(nom);
    else problemes.push(`${CLE_DES_CAPACITES} : « ${nom} » n'est pas un nom de capacité — attendu ${FORME_DE_CAPACITE}, séparés par des virgules`);
  }
  return [...demandees];
}

// La fiche que portent les commentaires d'une issue, ou null s'il n'y en a
// pas : un ticket sans fiche n'attend personne et ne possède rien.
export function card(commentaires: string[]): Card | null {
  const marques = commentaires.filter(hasCard);
  const [corps] = marques;
  if (corps === undefined) return null;
  const nombre = marques.reduce((somme, marque) => somme + marqueurs(marque), 0);
  if (nombre > 1) {
    return { waitsFor: [], zone: [], problems: [`${nombre} fiches sur l'issue — une seule attendue : garder la bonne, supprimer les autres`] };
  }

  const lue: Card = { waitsFor: [], zone: [], problems: [] };
  const vues = new Set<string>();
  const lignes = lignesHorsCode(corps);
  const debut = lignes.findIndex((ligne) => EN_TETE_DE_LIGNE.test(ligne));
  for (const ligne of [(lignes[debut] ?? "").replace(EN_TETE_DE_LIGNE, ""), ...lignes.slice(debut + 1)]) {
    const champ = CHAMP.exec(ligne.replace(PUCE, "").trim());
    if (!champ) {
      // Hors d'une puce, une ligne qui n'a pas la forme d'un champ est de la prose.
      if (PUCE.test(ligne)) lue.problems.push(`ligne illisible : « ${ligne.trim()} » — attendu « clé : valeur »`);
      continue;
    }
    const [, emphase = "", nom = "", suite = ""] = champ;
    const cle = nom.toLowerCase();
    // « **clé :** valeur » : l'emphase ouverte avant la clé se ferme après les
    // deux-points. Rien d'autre n'est retiré à la valeur.
    const valeur = (emphase !== "" && suite.startsWith(emphase) ? suite.slice(emphase.length) : suite).trim();
    if (vues.has(cle)) lue.problems.push(`« ${cle} » figure deux fois — une seule ligne par clé`);
    else if (cle === "attend") lue.waitsFor = tickets(valeur, lue.problems);
    else if (cle === "zone") lue.zone = chemins(valeur, lue.problems);
    else if (cle === CLE_DES_CAPACITES) {
      const demandees = capacites(valeur, lue.problems);
      if (demandees.length > 0) lue.requires = demandees;
    }
    else lue.problems.push(`clé inconnue « ${cle} » — connues : ${CLES.join(", ")}`);
    vues.add(cle);
  }
  return lue;
}

// Les capacités qu'un ticket demande. Une fiche illisible n'en demande aucune :
// comme sa zone, ce qu'elle dit ne fait pas foi — le ticket part pour être
// refusé, sur son issue.
export function requises(lue: Card | null): string[] {
  return lue === null || lue.problems.length > 0 ? [] : (lue.requires ?? []);
}

// Ce qui rend la fiche illisible, ou null si elle se lit — ou s'il n'y en a pas.
export function illisible(lue: Card | null): string | null {
  return lue === null || lue.problems.length === 0 ? null : lue.problems.join(" ; ");
}
