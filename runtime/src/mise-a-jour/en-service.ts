// Ce que la station dit d'elle-même quand elle a démarré : sa version, son
// pid, depuis quand, et les projets qu'elle sert. Un fichier sous son
// répertoire (`<BRIGADE_STATION_DIR>/en-service`), réécrit à chaque changement.
//
// C'est ce que la mise à jour attend pour garder une version : la station
// relancée sur elle a démarré, sous le pid que systemd lui donne, et sert au
// moins les projets que la version d'avant servait. Un process qui tourne ne
// suffit pas — il faut que la station l'ait dit.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CODES_DE_REFUS, refus, type CodeDeRefus, type Refus } from "../projets/refus.ts";

export const EN_SERVICE = "en-service";

// `refuses` : les projets de la configuration que la station n'a pas pu
// ouvrir, et pourquoi. `causes` : la cause de chacun pour le chef
// (`projets/refus.ts`) — absent quand aucun n'est refusé, et d'une station
// d'avant ce champ.
export type EnService = { version: string; pid: number; depuis: string; servis: string[]; refuses: Record<string, string>; causes?: Record<string, CodeDeRefus> };

// La version du runtime qui tourne : celle que la construction du paquet
// écrit dans son package.json. Hors du paquet — un clone, le poste de dev —,
// celle du dépôt.
export function versionDuRuntime(): string {
  try {
    const lu = JSON.parse(readFileSync(join(import.meta.dirname, "../../package.json"), "utf8")) as { version?: unknown };
    return typeof lu.version === "string" && lu.version !== "" ? lu.version : "inconnue";
  } catch {
    return "inconnue";
  }
}

const MOTIF_MAX = 200;

export function lireEnService(racine: string): EnService | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, EN_SERVICE), "utf8")) as Partial<EnService>;
    if (typeof lu.version !== "string" || typeof lu.pid !== "number" || typeof lu.depuis !== "string" || !Array.isArray(lu.servis)) return null;
    const refuses = typeof lu.refuses === "object" && lu.refuses !== null ? lu.refuses : {};
    const causes = typeof lu.causes === "object" && lu.causes !== null ? Object.entries(lu.causes).filter(([, code]) => (CODES_DE_REFUS as readonly unknown[]).includes(code)) : [];
    return {
      version: lu.version.slice(0, 100),
      pid: lu.pid,
      depuis: lu.depuis,
      servis: lu.servis.filter((nom): nom is string => typeof nom === "string"),
      refuses: Object.fromEntries(Object.entries(refuses).flatMap(([nom, motif]) => (typeof motif === "string" ? [[nom, motif.slice(0, MOTIF_MAX)]] : []))),
      ...(causes.length === 0 ? {} : { causes: Object.fromEntries(causes) }),
    };
  } catch {
    return null;
  }
}

// Pourquoi la station de cette machine refuse ce projet, pour le chef — ou
// null : elle le sert, ou rien ne se lit. Une station d'avant `causes` n'en dit
// pas la cause : `unexpected`.
export function refusDuProjet(racine: string | undefined, projet: string | undefined): Refus | null {
  if (!racine || !projet) return null;
  const lu = lireEnService(racine);
  if (lu === null || !Object.hasOwn(lu.refuses, projet) || lu.servis.includes(projet)) return null;
  return refus(lu.causes?.[projet] ?? "unexpected");
}

// La station annonce qu'elle est en service, puis réannonce dès que ce qu'elle
// sert change — un projet repris, ajouté, refusé. Rend de quoi arrêter.
// N'empêche jamais le process de sortir.
export function annoncerEnService(
  racine: string,
  lire: () => { servis: string[]; refuses: Record<string, string>; causes?: Record<string, CodeDeRefus> },
  options: { version?: string; pid?: number; maintenant?: () => Date; intervalleMs?: number; dire?: (ligne: string) => void } = {},
): () => void {
  const version = options.version ?? versionDuRuntime();
  const depuis = (options.maintenant ?? (() => new Date()))().toISOString();
  const pid = options.pid ?? process.pid;
  const fichier = join(racine, EN_SERVICE);
  let ecrit = "";
  let ditEchec = false;
  const annoncer = () => {
    const { servis, refuses, causes = {} } = lire();
    const texte = `${JSON.stringify({ version, pid, depuis, servis: [...servis].sort(), refuses, ...(Object.keys(causes).length === 0 ? {} : { causes }) } satisfies EnService)}\n`;
    if (texte === ecrit) return;
    try {
      writeFileSync(`${fichier}.${pid}`, texte);
      renameSync(`${fichier}.${pid}`, fichier);
      ecrit = texte;
      ditEchec = false;
    } catch (erreur) {
      if (!ditEchec) options.dire?.(`brigade : station — son démarrage ne s'écrit pas (${fichier}) : ${(erreur as Error).message} ; une mise à jour ne pourra pas le constater`);
      ditEchec = true;
    }
  };
  annoncer();
  const veille = setInterval(annoncer, options.intervalleMs ?? 2000);
  veille.unref();
  return () => clearInterval(veille);
}
