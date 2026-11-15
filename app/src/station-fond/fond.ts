// La station de cet ordinateur, en fond (#3630, épique #3629) : un process à elle, qui ne dépend pas de l'app. L'app qui
// s'ouvre la trouve et s'y rattache ; elle ne la lance que si aucune ne tourne, et ne l'arrête jamais en quittant. Ce
// module est ce que l'app et ce process partagent, sans Electron :
//
// - **Qui la tient** : la marque `app.pid` de son répertoire (poste/station.ts, `prendreLaStation`), que l'hôte de fond
//   (hote.ts) prend pour lui comme l'app la prenait. L'installeur de docs/installation-station.md prend la même : quel
//   que soit celui qui l'a lancée, une station qui tourne est rejointe, jamais doublée.
// - **Ce qu'elle fait** : `fond.json`, que l'hôte réécrit quand son état change — son pid, son état, la version vers
//   laquelle elle redémarre, et pourquoi elle a refusé de démarrer.
// - **Son appairage** : elle n'a plus de fenêtre à qui dire son code. Elle l'écrit dans `fond-appairage.json` ; l'app
//   ouverte le tape par le geste de la home (stations/stations.ts) et y écrit ce que GitHub a répondu, que la station
//   relit à son essai suivant.
// - **Ce qu'elle dit** va à son journal, `fond.log`, sous son répertoire.
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tenantDeLaStation, type EtatStationLocale } from "../poste/station.ts";
import type { Appairage } from "../stations/stations.ts";

const ETAT_DU_FOND = "fond.json";
const APPAIRAGE = "fond-appairage.json";
export const JOURNAL = "fond.log";
// Le point d'entrée de l'hôte, joué par `node`.
export const HOTE = join(import.meta.dirname, "hote.ts");

export type EtatDuFond = { pid: number; etat: EtatStationLocale; redemarrage: string | null; motif: string | null };

const ETATS: readonly string[] = ["demarree", "relancee", "tenue-ailleurs", "refusee", "arretee"];
const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

// Écrit d'un coup : l'app ne lit jamais un fichier à moitié écrit.
function ecrireDUnCoup(fichier: string, valeur: unknown): void {
  writeFileSync(`${fichier}.${process.pid}`, `${JSON.stringify(valeur)}\n`);
  renameSync(`${fichier}.${process.pid}`, fichier);
}

export function ecrireEtatDuFond(racine: string, etat: EtatDuFond): void {
  mkdirSync(racine, { recursive: true });
  ecrireDUnCoup(join(racine, ETAT_DU_FOND), etat);
}

// Ce que l'hôte a écrit de lui, ou rien : absent, illisible ou mal formé, rien n'en est déduit.
export function lireEtatDuFond(racine: string): EtatDuFond | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, ETAT_DU_FOND), "utf8")) as Partial<EtatDuFond>;
    if (typeof lu.pid !== "number" || typeof lu.etat !== "string" || !ETATS.includes(lu.etat)) return null;
    return { pid: lu.pid, etat: lu.etat as EtatStationLocale, redemarrage: typeof lu.redemarrage === "string" ? lu.redemarrage : null, motif: typeof lu.motif === "string" ? lu.motif : null };
  } catch {
    return null;
  }
}

type OptionsLancement = {
  // Le `node` qui joue l'hôte, et le point d'entrée de la station livrée avec l'app.
  node: string;
  embarque: string;
  racine: string;
  env: Record<string, string | undefined>;
};

// Lance l'hôte, détaché de l'app : il lui survit, sa sortie va à son journal. Un journal qui ne s'ouvre pas lève ; un
// `node` qui ne part pas est dit au journal, et l'attente de `rejoindreOuLancer` le constate.
export function lancerLeFond(options: OptionsLancement): void {
  mkdirSync(options.racine, { recursive: true });
  const journal = join(options.racine, JOURNAL);
  const sortie = openSync(journal, "a");
  try {
    const hote = spawn(options.node, [HOTE, options.racine, options.embarque], { detached: true, stdio: ["ignore", sortie, sortie], windowsHide: true, env: options.env });
    hote.once("error", (erreur) => {
      try {
        writeFileSync(journal, `brigade: this computer's background station could not be launched — ${erreur.message} (\`${options.node}\`)\n`, { flag: "a" });
      } catch {
        // Le journal ne s'écrit plus : l'attente dit que rien n'a démarré.
      }
    });
    hote.unref();
  } finally {
    closeSync(sortie);
  }
}

export type Rattachement = { rejointe: number } | { lancee: number } | { refus: string };

// La station de cet ordinateur, rejointe si elle tourne, lancée sinon. Lancée, elle est attendue jusqu'à ce qu'elle
// tienne son répertoire ; une qui refuse de démarrer, ou ne le tient pas à temps, est un refus, qui dit pourquoi.
export async function rejoindreOuLancer(options: { racine: string; lancer: () => void | Promise<void>; attenteMs?: number; pasMs?: number }): Promise<Rattachement> {
  const { racine } = options;
  const deja = tenantDeLaStation(racine);
  if (deja !== undefined) return { rejointe: deja };
  const avant = lireEtatDuFond(racine);
  try {
    await options.lancer();
  } catch (erreur) {
    return { refus: `the background station could not be launched — ${message(erreur)}` };
  }
  const fin = Date.now() + (options.attenteMs ?? 30_000);
  for (;;) {
    const tenant = tenantDeLaStation(racine);
    const dit = lireEtatDuFond(racine);
    if (dit !== null && dit.etat === "refusee" && (avant === null || dit.pid !== avant.pid || avant.etat !== "refusee")) return { refus: `the background station refused to start — ${dit.motif ?? "no reason given"}` };
    if (tenant !== undefined && (dit === null || dit.pid !== tenant || dit.etat !== "refusee")) return { lancee: tenant };
    if (Date.now() >= fin) return { refus: `the background station did not start within ${Math.round((options.attenteMs ?? 30_000) / 1000)} s — its log: ${join(racine, JOURNAL)}` };
    await new Promise((resoudre) => setTimeout(resoudre, options.pasMs ?? 200));
  }
}

type DemandeLue = { code: string; rendu?: Appairage };

function lireDemande(racine: string): DemandeLue | null {
  try {
    const lu = JSON.parse(readFileSync(join(racine, APPAIRAGE), "utf8")) as { code?: unknown; rendu?: unknown };
    if (typeof lu.code !== "string") return null;
    const rendu = lu.rendu as Appairage | undefined;
    const valide = rendu !== undefined && typeof rendu === "object" && rendu !== null && (typeof (rendu as { appairee?: unknown }).appairee === "string" || typeof (rendu as { refus?: unknown }).refus === "string");
    return valide ? { code: lu.code, rendu } : { code: lu.code };
  } catch {
    return null;
  }
}

// Le côté de la station : le code qu'elle affiche, demandé à l'app. La réponse de l'app pour ce code est rendue (et la
// demande effacée) ; sans elle, la demande est posée, et la station réessaie plus tard.
export function demanderAppairage(racine: string, code: string): Appairage {
  const lue = lireDemande(racine);
  if (lue !== null && lue.code === code && lue.rendu !== undefined) {
    rmSync(join(racine, APPAIRAGE), { force: true });
    return lue.rendu;
  }
  if (lue === null || lue.code !== code) ecrireDUnCoup(join(racine, APPAIRAGE), { code });
  return { refus: "the app has not typed its code yet — open the app on this computer" };
}

// Le côté de l'app : un code que la station attend, tapé par le geste de la home, et la réponse écrite pour elle. Une
// demande illisible, ou déjà répondue, attend la suivante.
export async function repondreAuxAppairages(racine: string, appairer: (code: string) => Promise<Appairage>): Promise<void> {
  const lue = lireDemande(racine);
  if (lue === null || lue.rendu !== undefined) return;
  let rendu: Appairage;
  try {
    rendu = await appairer(lue.code);
  } catch (erreur) {
    rendu = { refus: message(erreur) };
  }
  // La station a pu afficher un autre code entre-temps : la réponse ne vaut que pour le sien.
  if (lireDemande(racine)?.code === lue.code) ecrireDUnCoup(join(racine, APPAIRAGE), { code: lue.code, rendu });
}
