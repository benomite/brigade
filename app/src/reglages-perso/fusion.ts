// Accorder le gist des préférences et le fichier de l'app : deux fonctions pures, sans GitHub ni disque.
//
// `rejouer` dit ce que le gist doit porter après un changement fait sur cet appareil : ce que le chef
// y a changé depuis le dernier accord — une couleur, l'ordre des projets, une préférence d'affichage —,
// par-dessus ce que le gist porte maintenant, qu'un autre appareil a pu changer entre-temps. Ce que cet
// appareil n'a pas touché reste tel que le gist le dit.
//
// `poser` dit ce que le fichier de l'app devient avec les préférences du gist : les clés personnelles de
// ses projets et du fichier prennent celles du gist ; les clés de l'appareil (partage.ts) restent les
// siennes, et un projet que le gist ne connaît pas garde les siennes et sa place.
import { CLES_DE_L_APPAREIL, CLES_DU_PROJET_SUR_L_APPAREIL, personnelles, type Preferences } from "./partage.ts";

type Ligne = { nom: string; [cle: string]: unknown };

const objet = (valeur: unknown): valeur is Record<string, unknown> => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);

// La même valeur, quel que soit l'ordre de ses clés : un fichier réécrit à la main ne change pas pour autant.
export function memes(a: unknown, b: unknown): boolean {
  return canonique(a) === canonique(b);
}
function canonique(valeur: unknown): string {
  if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(",")}]`;
  if (objet(valeur)) return `{${Object.keys(valeur).sort().map((cle) => `${JSON.stringify(cle)}:${canonique(valeur[cle])}`).join(",")}}`;
  return JSON.stringify(valeur) ?? "undefined";
}

const lignes = (preferences: Preferences | undefined): Ligne[] => (Array.isArray(preferences?.projets) ? (preferences.projets as Ligne[]) : []);
const parNom = (liste: Ligne[]) => new Map(liste.map((ligne) => [ligne.nom, ligne]));
const sansProjets = (preferences: Preferences): Record<string, unknown> => Object.fromEntries(Object.entries(preferences).filter(([cle]) => cle !== "projets"));

// Dans `cible`, les clés de `apres` qui diffèrent de `avant` : posées si `apres` les a, retirées sinon.
function reporter(cible: Record<string, unknown>, avant: Record<string, unknown>, apres: Record<string, unknown>): Record<string, unknown> {
  const rendu = { ...cible };
  for (const cle of new Set([...Object.keys(avant), ...Object.keys(apres)])) {
    if (memes(avant[cle], apres[cle])) continue;
    if (cle in apres) rendu[cle] = apres[cle];
    else delete rendu[cle];
  }
  return rendu;
}

// Vrai quand les projets que `avant` et `apres` ont en commun n'y sont plus dans le même ordre : le chef les a rangés.
function ranges(avant: Ligne[], apres: Ligne[]): boolean {
  const communs = (liste: Ligne[], autre: Ligne[]) => liste.map(({ nom }) => nom).filter((nom) => autre.some((ligne) => ligne.nom === nom));
  return !memes(communs(avant, apres), communs(apres, avant));
}

// `gist` : les préférences que le gist porte maintenant. `avant` : celles du fichier de l'app au dernier
// accord — aucune, au premier : le gist l'emporte alors, et le fichier ne lui donne que ce qui lui manque.
// `apres` : celles du fichier maintenant. Un projet retiré de cet appareil garde ses préférences dans le
// gist : un autre appareil l'a peut-être encore, et celui-ci les retrouve s'il l'y remet.
export function rejouer(gist: Preferences, avant: Preferences | undefined, apres: Preferences): Preferences {
  const tenues = personnelles(gist);
  const voulues = personnelles(apres);
  const anciennes = avant === undefined ? undefined : personnelles(avant);

  const rendu: Preferences = anciennes === undefined ? { ...sansProjets(voulues), ...sansProjets(tenues) } : reporter(sansProjets(tenues), sansProjets(anciennes), sansProjets(voulues));
  if (!("projets" in tenues) && !("projets" in voulues)) return rendu;

  const duGist = parNom(lignes(tenues));
  const anciennesParNom = parNom(lignes(anciennes));
  const ligne = (locale: Ligne): Ligne => {
    const tenue = duGist.get(locale.nom);
    if (tenue === undefined) return locale;
    const ancienne = anciennes === undefined ? undefined : anciennesParNom.get(locale.nom);
    // Un projet qui vient d'arriver sur cet appareil : ce que le gist en dit l'emporte, il ne reçoit que ce qui lui manque.
    if (ancienne === undefined) return { ...locale, ...tenue };
    return reporter(tenue, ancienne, locale) as Ligne;
  };
  const locales = lignes(voulues).map(ligne);
  const ici = new Set(locales.map(({ nom }) => nom));

  let projets: Ligne[];
  if (anciennes !== undefined && ranges(lignes(anciennes), lignes(voulues))) {
    // Rangés ici : l'ordre de cet appareil, et chaque projet que lui seul ne connaît pas reste après celui qu'il suivait dans le gist.
    const suivants = new Map<string | undefined, Ligne[]>();
    let precedent: string | undefined;
    for (const tenue of lignes(tenues)) {
      if (ici.has(tenue.nom)) precedent = tenue.nom;
      else suivants.set(precedent, [...(suivants.get(precedent) ?? []), tenue]);
    }
    projets = [...(suivants.get(undefined) ?? []), ...locales.flatMap((locale) => [locale, ...(suivants.get(locale.nom) ?? [])])];
  } else {
    // Sinon l'ordre du gist, et ce qui vient d'arriver ici à sa suite.
    const parIci = parNom(locales);
    projets = [...lignes(tenues).map((tenue) => parIci.get(tenue.nom) ?? tenue), ...locales.filter(({ nom }) => !duGist.has(nom))];
  }
  return { ...rendu, projets };
}

// Les clés de `local` dans leur ordre : celles de l'appareil restent les siennes, les autres prennent la
// valeur de `voulu` — ou partent, s'il ne les a plus ; puis celles que seul `voulu` porte.
function accorder(local: Record<string, unknown>, voulu: Record<string, unknown>, deLAppareil: (cle: string) => boolean): Record<string, unknown> {
  const rendu: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(local)) {
    if (deLAppareil(cle)) rendu[cle] = valeur;
    else if (cle in voulu) rendu[cle] = voulu[cle];
  }
  for (const [cle, valeur] of Object.entries(voulu)) if (!(cle in rendu)) rendu[cle] = valeur;
  return rendu;
}

// Le contenu du fichier de l'app avec les préférences `preferences` : un objet neuf, `contenu` n'est pas touché.
export function poser(contenu: Record<string, unknown>, preferences: Preferences): Record<string, unknown> {
  const voulues = personnelles(preferences);
  // La liste des projets est celle du fichier : seuls ses projets y sont, quel que soit le gist.
  const rendu = accorder(contenu, sansProjets(voulues), (cle) => cle === "projets" || CLES_DE_L_APPAREIL.includes(cle));
  if (!Array.isArray(contenu.projets)) return rendu;

  const duGist = parNom(lignes(voulues));
  const rangs = [...duGist.keys()];
  const declares = contenu.projets as unknown[];
  const connu = (declare: unknown): declare is Ligne => objet(declare) && typeof declare.nom === "string" && duGist.has(declare.nom);
  // Les projets que le gist connaît prennent son ordre, dans les places qu'ils occupent ; les autres gardent la leur.
  const dansLOrdre = declares.filter(connu).sort((a, b) => rangs.indexOf(a.nom) - rangs.indexOf(b.nom));
  let suivant = 0;
  rendu.projets = declares.map((declare) => {
    if (!connu(declare)) return declare;
    const pris = dansLOrdre[suivant++]!;
    return accorder(pris, duGist.get(pris.nom)!, (cle) => cle === "nom" || CLES_DU_PROJET_SUR_L_APPAREIL.includes(cle));
  });
  return rendu;
}
