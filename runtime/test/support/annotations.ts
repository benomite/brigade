// Le rapport de la suite en annotations GitHub, pour le job Windows : le journal d'un job ne se lit que
// sur le stockage des logs d'Actions, que la cloison d'un cook n'ouvre pas, alors que les annotations
// d'un check se lisent par l'API de GitHub (`gh api repos/<dépôt>/check-runs/<job>/annotations`). Un
// échec y est dit avec son erreur et ce que le test a dit de lui (`t.diagnostic`, même s'il l'a dit
// après son échec) ; les tests sautés, chacun avec sa raison, et les comptes de la part y sont aussi.
//
// Reporter de `node --test` : il écrit tout à la fin, en commandes de workflow, là où on le lui dit.
import { join, relative } from "node:path";

// Ce que le reporter retient des événements de `node --test`.
export type Evenement = {
  type: string;
  data: {
    name?: string;
    nesting?: number;
    file?: string;
    line?: number;
    message?: string;
    skip?: string | boolean;
    details?: { type?: string; error?: { message?: string; cause?: unknown } };
  };
};

// GitHub ne garde que dix annotations d'erreur par étape : la dixième nomme les échecs de trop.
const ERREURS = 9;
const LONGUEUR = 4000;
// Une annotation garde 64 Ko : la liste des sauts s'arrête avant.
const LISTE = 60_000;

const donnee = (texte: string) => texte.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
const propriete = (texte: string) => donnee(texte).replaceAll(":", "%3A").replaceAll(",", "%2C");
const couper = (texte: string, longueur: number) => (texte.length <= longueur ? texte : `${texte.slice(0, longueur)}…`);

function erreurDe(data: Evenement["data"]): string {
  const erreur = data.details?.error;
  const cause = erreur?.cause;
  // Le message, et les lignes de la pile hors de Node : celles qui disent où, dans les tests ou le runtime.
  if (cause instanceof Error) return (cause.stack ?? cause.message).split("\n").filter((ligne) => !/^\s+at (.*\()?(node:|<anonymous>\)$)/.test(ligne)).join("\n");
  if (typeof cause === "string") return cause;
  return erreur?.message ?? "failed";
}

// Les commandes de workflow qui disent la suite : une erreur par test en échec, puis deux avis — les
// tests sautés avec leur raison, et les comptes. `racine` : la racine du dépôt, d'où se nomment les fichiers.
export function annoter(evenements: Evenement[], racine: string): string {
  const lieu = (fichier: string | undefined) => (fichier === undefined ? "" : relative(racine, fichier).replaceAll("\\", "/"));
  const dits = new Map<string, string[]>();
  for (const { type, data } of evenements) {
    if (type !== "test:diagnostic" || data.file === undefined || data.message === undefined) continue;
    const cle = `${data.file}:${data.line}`;
    dits.set(cle, [...(dits.get(cle) ?? []), data.message]);
  }
  const echecs = evenements.filter(({ type, data }) => type === "test:fail" && data.details?.type !== "suite" && data.skip === undefined);
  const sautes = evenements.filter(({ type, data }) => (type === "test:pass" || type === "test:fail") && data.skip !== undefined && data.skip !== false);
  const comptes = evenements.flatMap(({ type, data }) => (type === "test:diagnostic" && data.file === undefined && /^(tests|pass|fail|cancelled|skipped) \d+$/.test(data.message ?? "") ? [data.message as string] : []));

  const lignes: string[] = [];
  for (const { data } of echecs.slice(0, ERREURS)) {
    const dit = dits.get(`${data.file}:${data.line}`) ?? [];
    const message = [erreurDe(data), ...dit.map((ligne) => `ℹ ${ligne}`)].join("\n");
    lignes.push(`::error file=${propriete(lieu(data.file))},line=${data.line ?? 1},title=${propriete(couper(data.name ?? "", 200))}::${donnee(couper(message, LONGUEUR))}`);
  }
  const deTrop = echecs.slice(ERREURS);
  if (deTrop.length > 0) lignes.push(`::error title=${propriete(`${deTrop.length} more failing tests`)}::${donnee(deTrop.map(({ data }) => `${lieu(data.file)}:${data.line} — ${data.name}`).join("\n"))}`);
  if (sautes.length > 0) lignes.push(`::notice title=${propriete(`${sautes.length} tests skipped`)}::${donnee(couper(sautes.map(({ data }) => `${lieu(data.file)}:${data.line} — ${data.name} — ${data.skip === true ? "(no reason)" : data.skip}`).join("\n"), LISTE))}`);
  if (comptes.length > 0) lignes.push(`::notice title=counts::${donnee(comptes.join(", "))}`);
  return lignes.map((ligne) => `${ligne}\n`).join("");
}

export default async function* annotations(source: AsyncIterable<Evenement>): AsyncGenerator<string> {
  const evenements: Evenement[] = [];
  for await (const evenement of source) evenements.push(evenement);
  yield annoter(evenements, join(import.meta.dirname, "../../.."));
}
