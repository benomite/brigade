// Le déménagement de la cuisine d'un projet, tel que l'app le demande — sur
// cette station, sa box, ou une autre, sans retirer ni rajouter le projet :
//
//   node runtime/src/demenagement/demenager.ts <projet> <gist de la station visée> <gist>…
//
// Les gists sont ceux des stations du chef (celle visée comprise) : la commande
// y lit la demande de chacune et ce qu'elle en suit, puis réécrit les deux qui
// changent — `remise` sur celle que la cuisine quitte, `reprise` sur celle qui
// la reprend (`projets/demande.ts`). Le reste se fait entre les deux stations,
// par leurs gists (`projets/tenir.ts`) ; rien ne part directement vers l'une
// d'elles.
//
// Vers cet ordinateur — la station de `BRIGADE_STATION_DIR` —, la commande
// joue d'abord la vérification du bac à sable (`bac-a-sable/verifier.ts`) :
// indisponible, le déménagement est refusé avec sa raison, et rien n'est écrit.
//
// Elle rend une ligne JSON : `{"moved":true,"project","from","to","askedAt"}`
// (code 0), ou `{"moved":false,"said":"<une phrase>"}` (code 1) — rien n'a
// changé. 2 : elle est mal appelée ; 3 : GitHub n'a pu être lu ni écrit.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { enProcess, Sortie, type Appel } from "../appel.ts";
import { canalGitHub, type Canal } from "../appairage/canal.ts";
import { FICHIER_STATION } from "../appairage/document.ts";
import { FICHIER_LOCAL } from "../appairage/presence.ts";
import { sondesDeLaMachine } from "../bac-a-sable/detection.ts";
import { lireCaches, verifier, type Verification } from "../bac-a-sable/local.ts";
import { documentDeDemande, FICHIER_PROJETS, FICHIER_SUIVI, lireDemande, suiviDe, type ProjetDemande } from "../projets/demande.ts";
import { NOM_DE_PROJET } from "../runtime.ts";
import { worktreesDeLaStation } from "../station/configuration.ts";

const USAGE = "usage : node runtime/src/demenagement/demenager.ts <projet> <gist de la station visée> <gist>…";

// Ce que la commande lit d'une station : son nom, sa demande, son suivi.
export type StationLue = { gist: string; nom: string; demande: ProjetDemande[] | null; suivi: string | undefined };

export type Demenagement = { ecrire: Array<{ gist: string; projets: ProjetDemande[] }>; de: string; vers: string; demandeLe: string };

const sans = ({ remise: _remise, reprise: _reprise, ...reste }: ProjetDemande): ProjetDemande => reste;

// Les demandes réécrites pour déménager `projet` vers la station `vers` (son
// gist), ou pourquoi ce n'est pas possible — en une phrase. Ne lit rien, n'écrit rien.
export function demenager(stations: StationLue[], projet: string, vers: string, demandeLe: string): Demenagement | { refus: string } {
  const illisible = stations.find(({ demande }) => demande === null);
  if (illisible !== undefined) return { refus: `what the app asked of ${illisible.nom} is unreadable on its gist: nothing is changed` };
  const cible = stations.find(({ gist }) => gist === vers);
  if (cible === undefined) return { refus: `the station whose gist is ${vers} is not one of yours` };
  const entree = (station: StationLue) => (station.demande ?? []).find(({ nom }) => nom === projet);
  const principales = stations.filter((station) => entree(station)?.principale === true);
  const source = principales[0];
  if (source === undefined) return { refus: `${projet} cooks on none of your stations: add it rather than move it` };
  if (principales.length > 1) return { refus: `${projet} has several main stations (${principales.map(({ nom }) => nom).join(", ")}): nothing is changed until it has only one` };
  const tenue = entree(source) as ProjetDemande;
  const enCours = tenue.reprise ?? null;
  if (enCours !== null) {
    const ou = suiviDe(source.suivi, projet)?.bascule ?? null;
    const recue = ou !== null && ou.etape === "recue" && ou.demandeLe === enCours.demandeLe;
    if (!recue) {
      // Un déménagement que la station visée n'a pas encore accepté se reprend :
      // il revient vers celle qui le sert toujours.
      const origine = stations.find(({ nom }) => nom === enCours.de);
      const annulable = origine !== undefined && origine.gist === vers && (ou === null || ou.etape === "demandee" || ou.etape === "refusee");
      if (!annulable) return { refus: `${projet} is already moving from ${enCours.de} to ${source.nom}: wait until ${source.nom} serves it` };
      return {
        ecrire: stations.flatMap((station) => {
          const avant = station.demande ?? [];
          const sienne = entree(station);
          if (sienne === undefined) return [];
          const apres = avant.map((un) => (un.nom === projet ? { ...sans(un), principale: station.gist === vers } : un));
          return JSON.stringify(apres) === JSON.stringify(avant) ? [] : [{ gist: station.gist, projets: apres }];
        }),
        de: source.nom,
        vers: cible.nom,
        demandeLe,
      };
    }
  }
  if (source.gist === vers) return { refus: `${projet} already cooks on ${cible.nom}` };

  const ecrire = stations.flatMap((station) => {
    const avant = station.demande ?? [];
    let apres: ProjetDemande[];
    if (station.gist === source.gist) apres = avant.map((un) => (un.nom === projet ? { ...sans(un), principale: false, remise: { vers: cible.nom, gist: cible.gist, demandeLe } } : un));
    else if (station.gist === vers) {
      const reprise = { de: source.nom, gist: source.gist, demandeLe };
      const sienne = entree(station);
      // Sans ligne pour lui, la station visée reçoit celle de la principale : ses
      // réglages sont ceux du projet, pas un nouveau parcours.
      apres = sienne === undefined ? [...avant, { ...sans(tenue), principale: true, demandeLe, reprise }] : avant.map((un) => (un.nom === projet ? { ...sans(un), principale: true, reprise } : un));
    } else apres = avant.map((un) => (un.nom === projet ? sans(un) : un));
    return JSON.stringify(apres) === JSON.stringify(avant) ? [] : [{ gist: station.gist, projets: apres }];
  });
  return { ecrire, de: source.nom, vers: cible.nom, demandeLe };
}

export type Dependances = {
  canal: Canal;
  maintenant: () => Date;
  // Le gist de la station de cet ordinateur, s'il en a une.
  gistLocal: string | null;
  verifierBacASable: () => Verification;
};

function gistDeLaStation(env: Record<string, string | undefined>): string | null {
  const racine = env.BRIGADE_STATION_DIR;
  if (!racine) return null;
  try {
    const lu = JSON.parse(readFileSync(join(resolve(racine), FICHIER_LOCAL), "utf8")) as { gist?: unknown };
    return typeof lu.gist === "string" && lu.gist !== "" ? lu.gist : null;
  } catch {
    return null;
  }
}

export function dependancesDuProcess(env: Record<string, string | undefined>): Dependances {
  const racine = env.BRIGADE_STATION_DIR;
  return {
    canal: canalGitHub({ gh: env.BRIGADE_GH_BIN || "gh" }),
    maintenant: () => new Date(),
    gistLocal: gistDeLaStation(env),
    verifierBacASable: () =>
      racine
        ? verifier(sondesDeLaMachine(env.BRIGADE_CLAUDE_BIN || "claude"), { home: env.HOME ?? homedir(), worktrees: worktreesDeLaStation(resolve(racine), env.HOME ?? homedir()), caches: lireCaches(env) })
        : { ok: false, raison: "BRIGADE_STATION_DIR n'est pas défini : la vérification éprouve les lieux de la station de cette machine" },
  };
}

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

export async function principal({ args, env, dire, redire }: Appel, dependances: Dependances = dependancesDuProcess(env)): Promise<void> {
  const [projet, vers, ...autres] = args;
  if (projet === undefined || vers === undefined || !NOM_DE_PROJET.test(projet) || [vers, ...autres].some((gist) => !/^[A-Za-z0-9]{1,64}$/.test(gist))) {
    redire(`brigade : un projet, puis des gists — ${USAGE}`);
    throw new Sortie(2);
  }
  const refuser = (said: string): never => {
    dire(JSON.stringify({ moved: false, said }));
    throw new Sortie(1);
  };
  // Vers cet ordinateur : pas sans bac à sable, et rien n'est lu ni écrit avant.
  if (dependances.gistLocal !== null && vers === dependances.gistLocal) {
    const bac = dependances.verifierBacASable();
    if (!bac.ok) refuser(bac.raison);
  }
  const { canal } = dependances;
  let stations: StationLue[];
  try {
    stations = await Promise.all(
      [...new Set([vers, ...autres])].map(async (gist): Promise<StationLue> => {
        const fichiers = await canal.lire(gist);
        if (fichiers === null) throw new Error(`the gist ${gist} no longer exists`);
        let nom = gist;
        try {
          const lu = JSON.parse(fichiers[FICHIER_STATION] ?? "") as { nom?: unknown };
          if (typeof lu.nom === "string" && lu.nom !== "") nom = lu.nom;
        } catch {
          // Une station qui ne s'est pas encore publiée garde son gist pour nom.
        }
        const brut = fichiers[FICHIER_PROJETS];
        return { gist, nom, demande: brut === undefined ? [] : (lireDemande(brut)?.projets ?? null), suivi: fichiers[FICHIER_SUIVI] };
      }),
    );
  } catch (erreur) {
    redire(`brigade : les stations n'ont pas pu être lues sur GitHub, rien n'est changé — ${message(erreur)}`);
    throw new Sortie(3);
  }
  const demandeLe = dependances.maintenant().toISOString();
  const rendu = demenager(stations, projet, vers, demandeLe);
  if ("refus" in rendu) return refuser(rendu.refus);
  // Celle qui le reprend d'abord : celle qu'il quitte ne bouge qu'une fois
  // qu'elle s'est dite prête, quel que soit l'ordre où elles lisent.
  const ordre = [...rendu.ecrire].sort((a, b) => Number(b.gist === vers) - Number(a.gist === vers));
  try {
    for (const { gist, projets } of ordre) {
      if ((await canal.ecrire(gist, { [FICHIER_PROJETS]: documentDeDemande(projets) })) === "absent") throw new Error(`the gist ${gist} no longer exists`);
    }
  } catch (erreur) {
    redire(`brigade : la demande n'a pas pu être écrite sur GitHub — ${message(erreur)}`);
    throw new Sortie(3);
  }
  dire(JSON.stringify({ moved: true, project: projet, from: rendu.de, to: rendu.vers, askedAt: demandeLe }));
}

if (import.meta.main) await enProcess((appel) => principal(appel));
