// Accorder le gist des préférences et le fichier de l'app : deux fonctions pures, sans GitHub ni disque.
//
// `rejouer` dit ce que le gist doit porter après un changement fait sur cet appareil : ce que le chef
// y a changé depuis le dernier accord — une couleur, l'ordre des projets, une préférence d'affichage —,
// par-dessus ce que le gist porte maintenant, qu'un autre appareil a pu changer entre-temps. Ce que cet
// appareil n'a pas touché reste tel que le gist le dit.
//
// `poser` dit ce que le fichier de l'app devient avec les préférences du gist : les clés personnelles de
// ses projets et du fichier prennent celles du gist ; les clés de l'appareil (share.ts) restent les
// siennes, et un projet que le gist ne connaît pas garde les siennes et sa place.
import { KEYS_OF_THE_DEVICE, KEYS_OF_PROJECT_ON_THE_DEVICE, personal, type Preferences } from "./share.ts";

type Line = { nom: string; [key: string]: unknown };

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// La même valeur, quel que soit l'ordre de ses clés : un fichier réécrit à la main ne change pas pour autant.
export function same(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

const lines = (preferences: Preferences | undefined): Line[] => (Array.isArray(preferences?.projets) ? (preferences.projets as Line[]) : []);
const byName = (list: Line[]) => new Map(list.map((line) => [line.nom, line]));
const withoutProjects = (preferences: Preferences): Record<string, unknown> => Object.fromEntries(Object.entries(preferences).filter(([key]) => key !== "projets"));

// Dans `cible`, les clés de `apres` qui diffèrent de `avant` : posées si `apres` les a, retirées sinon.
function reporter(target: Record<string, unknown>, before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const rendered = { ...target };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    if (key in after) rendered[key] = after[key];
    else delete rendered[key];
  }
  return rendered;
}

// Vrai quand les projets que `avant` et `apres` ont en commun n'y sont plus dans le même ordre : le chef les a rangés.
function ranges(before: Line[], after: Line[]): boolean {
  const common = (list: Line[], other: Line[]) => list.map(({ nom: name }) => name).filter((name) => other.some((line) => line.nom === name));
  return !same(common(before, after), common(after, before));
}

// `gist` : les préférences que le gist porte maintenant. `avant` : celles du fichier de l'app au dernier
// accord — aucune, au premier : le gist l'emporte alors, et le fichier ne lui donne que ce qui lui manque.
// `apres` : celles du fichier maintenant. Un projet retiré de cet appareil garde ses préférences dans le
// gist : un autre appareil l'a peut-être encore, et celui-ci les retrouve s'il l'y remet.
export function replay(gist: Preferences, before: Preferences | undefined, after: Preferences): Preferences {
  const heldEntries = personal(gist);
  const wanted = personal(after);
  const old = before === undefined ? undefined : personal(before);

  const rendered: Preferences = old === undefined ? { ...withoutProjects(wanted), ...withoutProjects(heldEntries) } : reporter(withoutProjects(heldEntries), withoutProjects(old), withoutProjects(wanted));
  if (!("projets" in heldEntries) && !("projets" in wanted)) return rendered;

  const ofGist = byName(lines(heldEntries));
  const oldByName = byName(lines(old));
  const line = (locale: Line): Line => {
    const heldOne = ofGist.get(locale.nom);
    if (heldOne === undefined) return locale;
    const oldOne = old === undefined ? undefined : oldByName.get(locale.nom);
    // Un projet qui vient d'arriver sur cet appareil : ce que le gist en dit l'emporte, il ne reçoit que ce qui lui manque.
    if (oldOne === undefined) return { ...locale, ...heldOne };
    return reporter(heldOne, oldOne, locale) as Line;
  };
  const locales = lines(wanted).map(line);
  const here = new Set(locales.map(({ nom: name }) => name));

  let projects: Line[];
  if (old !== undefined && ranges(lines(old), lines(wanted))) {
    // Rangés ici : l'ordre de cet appareil, et chaque projet que lui seul ne connaît pas reste après celui qu'il suivait dans le gist.
    const next = new Map<string | undefined, Line[]>();
    let previous: string | undefined;
    for (const heldOne of lines(heldEntries)) {
      if (here.has(heldOne.nom)) previous = heldOne.nom;
      else next.set(previous, [...(next.get(previous) ?? []), heldOne]);
    }
    projects = [...(next.get(undefined) ?? []), ...locales.flatMap((locale) => [locale, ...(next.get(locale.nom) ?? [])])];
  } else {
    // Sinon l'ordre du gist, et ce qui vient d'arriver ici à sa suite.
    const byHere = byName(locales);
    projects = [...lines(heldEntries).map((heldOne) => byHere.get(heldOne.nom) ?? heldOne), ...locales.filter(({ nom: name }) => !ofGist.has(name))];
  }
  return { ...rendered, projets: projects };
}

// Les clés de `local` dans leur ordre : celles de l'appareil restent les siennes, les autres prennent la
// valeur de `voulu` — ou partent, s'il ne les a plus ; puis celles que seul `voulu` porte.
function grant(local: Record<string, unknown>, wanted: Record<string, unknown>, ofTheDevice: (key: string) => boolean): Record<string, unknown> {
  const rendered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(local)) {
    if (ofTheDevice(key)) rendered[key] = value;
    else if (key in wanted) rendered[key] = wanted[key];
  }
  for (const [key, value] of Object.entries(wanted)) if (!(key in rendered)) rendered[key] = value;
  return rendered;
}

// Le contenu du fichier de l'app avec les préférences `preferences` : un objet neuf, `contenu` n'est pas touché.
export function set(content: Record<string, unknown>, preferences: Preferences): Record<string, unknown> {
  const wanted = personal(preferences);
  // La liste des projets est celle du fichier : seuls ses projets y sont, quel que soit le gist.
  const rendered = grant(content, withoutProjects(wanted), (key) => key === "projets" || KEYS_OF_THE_DEVICE.includes(key));
  if (!Array.isArray(content.projets)) return rendered;

  const ofGist = byName(lines(wanted));
  const ranks = [...ofGist.keys()];
  const declares = content.projets as unknown[];
  const knownOne = (declare: unknown): declare is Line => object(declare) && typeof declare.nom === "string" && ofGist.has(declare.nom);
  // Les projets que le gist connaît prennent son ordre, dans les places qu'ils occupent ; les autres gardent la leur.
  const inTheOrder = declares.filter(knownOne).sort((a, b) => ranks.indexOf(a.nom) - ranks.indexOf(b.nom));
  let next = 0;
  rendered.projets = declares.map((declare) => {
    if (!knownOne(declare)) return declare;
    const taken = inTheOrder[next++]!;
    return grant(taken, ofGist.get(taken.nom)!, (key) => key === "nom" || KEYS_OF_PROJECT_ON_THE_DEVICE.includes(key));
  });
  return rendered;
}
