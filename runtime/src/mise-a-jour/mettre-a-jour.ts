// Un passage de la mise à jour de la station, comme son minuteur le lance
// (systemd, ou launchd par `StartInterval`) : elle lit les versions publiées
// et, s'il y en a une plus récente que celle installée, elle l'installe — sauf
// si la version est gelée, ou si celle-ci a déjà raté. Installer, c'est
// télécharger l'archive de la version, la défaire sous
// /opt/brigade-station/<version>/, jouer l'`install.sh` de cette version en
// mode mise à jour (il rafraîchit les unités ou les plists), puis faire de la
// version la courante (`current`) et relancer la station. Seul le process de
// la station est relancé : ses cooks, portés chacun par un relais, lui
// survivent, et la station relancée les suit jusqu'à leur fin (#4401).
// L'installation n'attend donc rien d'eux.
//
// Une version est gardée quand la station relancée sur elle s'est dite en
// service — sa version, sous le pid que le gestionnaire lui donne — et sert au
// moins les projets que la version d'avant servait. Sinon elle n'a pas
// démarré : `current` revient à la version d'avant, la station est relancée
// dessus, et l'issue le dit en une ligne. Une version ratée n'est pas
// réessayée ; la suivante l'est. Gardée, la version d'avant reste posée pour
// le retour suivant ; les plus anciennes sont effacées.
//
// Ce que la mise à jour a donné est noté dans son répertoire (`etat.ts`) :
// c'est ce que la station relaie au journal de chaque projet, et ce que la
// file dit.
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CONFIGURATION, lireFichierDeConfiguration } from "../station/configuration.ts";
import { lireEnService } from "./en-service.ts";
import { ARCHIVES, ecrireEtatMiseAJour, lireEtatMiseAJour, noterIssue, type EtatMiseAJour, type Issue } from "./etat.ts";
import type { Publication, Publications } from "./publications.ts";
import { lireReglages } from "./reglages.ts";
import type { Systeme } from "./systeme.ts";
import { comparerVersions } from "./versions.ts";

export type OptionsMiseAJour = {
  // Le répertoire de la station (`BRIGADE_STATION_DIR`) : ses réglages, sa
  // configuration, ce qu'elle dit de son démarrage.
  racine: string;
  // Le répertoire de la mise à jour (`BRIGADE_MISE_A_JOUR_DIR`).
  dossier: string;
  systeme: Systeme;
  publications: Publications;
  dire: (ligne: string) => void;
  maintenant?: () => Date;
  // Le temps laissé à la station pour se dire en service sur une version.
  gardeMs?: number;
  // Entre deux regards sur la station qui démarre.
  pasMs?: number;
};

export const GARDE_MS = 120_000;
const PAS_MS = 250;

const message = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));
const pause = (ms: number) => new Promise<void>((resoudre) => setTimeout(resoudre, ms));

// Ce qu'un passage ferait, sans rien changer : la version installée, la plus
// récente publiée, et soit la version qu'il installerait (`visee`), soit ce
// qui l'en retient.
export type Prevision = {
  installee: string | null;
  disponible: string | null;
  gelee: boolean;
  visee: Publication | null;
  // Ce qui a empêché de lire les versions publiées, ou de partir d'une version installée.
  verification: string | null;
  // Pourquoi la version disponible n'est pas installée : gel, version déjà ratée.
  retenue: string | null;
  problemes: string[];
};

export async function prevoir(options: Pick<OptionsMiseAJour, "racine" | "dossier" | "systeme" | "publications">): Promise<Prevision> {
  const { racine, dossier, systeme, publications } = options;
  const ratees = new Set(lireEtatMiseAJour(dossier)?.ratees ?? []);
  const reglages = lireReglages(racine);
  const installee = systeme.installee();
  const prevision: Prevision = { installee, disponible: lireEtatMiseAJour(dossier)?.disponible ?? null, gelee: reglages.gel, visee: null, verification: null, retenue: null, problemes: reglages.problemes };
  if (installee === null) {
    prevision.verification = "aucune version n'est installée (le lien current ne désigne rien de posé) : rien n'est mis à jour";
    return prevision;
  }
  let liste: Publication[];
  try {
    liste = await publications.lister();
  } catch (erreur) {
    prevision.verification = `les versions publiées ne se lisent pas (${publications.nom}) : ${message(erreur)}`;
    return prevision;
  }
  const plusRecente = liste.reduce<Publication | null>((meilleure, publication) => (meilleure === null || comparerVersions(publication.version, meilleure.version) > 0 ? publication : meilleure), null);
  prevision.disponible = plusRecente?.version ?? null;
  if (plusRecente === null || comparerVersions(plusRecente.version, installee) <= 0) return prevision;
  const visee = plusRecente.version;
  if (reglages.gel) prevision.retenue = `version gelée en ${installee} : ${visee} attend que le gel soit levé`;
  else if (ratees.has(visee)) prevision.retenue = `${visee} n'a pas démarré à son essai : elle n'est pas réessayée, la version publiée après elle le sera — ${installee} reste en service`;
  else prevision.visee = plusRecente;
  return prevision;
}

// Ce que `update --check` dit : la version que le passage installerait, ou
// pourquoi il n'en installerait aucune. Rien n'est changé, pas même l'état.
export async function verifier(options: Pick<OptionsMiseAJour, "racine" | "dossier" | "systeme" | "publications">): Promise<string> {
  const prevision = await prevoir(options);
  if (prevision.verification !== null) return prevision.verification;
  if (prevision.visee !== null) return `installerait la version ${prevision.visee.version} (installée : ${prevision.installee})`;
  if (prevision.retenue !== null) return prevision.retenue;
  return `à jour en ${prevision.installee}`;
}

// Ce qu'un passage a laissé : l'état exposé, et l'issue de la mise à jour
// qu'il a faite — nulle s'il n'en a fait aucune.
export type Passage = { etat: EtatMiseAJour; issue: Issue | null };

export async function passer(options: OptionsMiseAJour): Promise<Passage> {
  const { racine, dossier, systeme, publications, dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const gardeMs = options.gardeMs ?? GARDE_MS;
  const pasMs = options.pasMs ?? PAS_MS;
  const archives = join(dossier, ARCHIVES);

  const avant = lireEtatMiseAJour(dossier);
  const ratees = new Set(avant?.ratees ?? []);
  const prevision = await prevoir({ racine, dossier, systeme, publications });
  for (const probleme of prevision.problemes) dire(`brigade : mise à jour — ${probleme}`);
  const etat: EtatMiseAJour = {
    installee: prevision.installee,
    disponible: prevision.disponible,
    gelee: prevision.gelee,
    verifieeLe: maintenant().toISOString(),
    verification: null,
    retenue: null,
    ratees: [],
    derniere: avant?.derniere ?? null,
    essai: avant?.essai ?? null,
  };
  const ecrire = () => {
    etat.ratees = [...ratees].sort(comparerVersions);
    ecrireEtatMiseAJour(dossier, etat);
  };
  const conclure = (issue: Issue | null = null): Passage => {
    ecrire();
    if (etat.verification !== null) dire(`brigade : mise à jour — ${etat.verification}`);
    if (etat.retenue !== null) dire(`brigade : mise à jour — ${etat.retenue}`);
    return { etat, issue };
  };

  // Attend que la station se dise en service en `version`, sous le pid que
  // le gestionnaire lui donne, démarrée après `debut`, en servant encore les
  // projets `servis` qui sont toujours configurés. Rend l'instant où elle a
  // démarré, ou pourquoi elle ne l'a pas fait.
  const attendreEnService = async (version: string, debut: number, servis: string[]): Promise<{ le: string } | { motif: string }> => {
    const fin = Date.now() + gardeMs;
    const relances = systeme.service().redemarrages;
    let attente = `la station ne s'est pas dite en service en ${version}`;
    for (;;) {
      const service = systeme.service();
      if (service.actif === "failed") return { motif: `la station s'est arrêtée en échec en ${version} (service : failed)` };
      if (service.redemarrages > relances) return { motif: `la station est tombée en ${version} : le service l'a relancée ${service.redemarrages - relances} fois` };
      const dite = lireEnService(racine);
      if (dite !== null && comparerVersions(dite.version, version) === 0 && dite.pid === service.pid && Date.parse(dite.depuis) >= debut - 1000) {
        const configures = new Set(lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets.map((projet) => projet.nom));
        const perdus = servis.filter((projet) => configures.has(projet) && !dite.servis.includes(projet));
        if (perdus.length === 0) return { le: dite.depuis };
        attente = perdus.map((projet) => `le projet ${projet} n'est plus servi en ${version}${dite.refuses[projet] ? ` : ${dite.refuses[projet]}` : ""}`).join(" ; ");
      }
      if (Date.now() >= fin) return { motif: `${attente} en ${Math.round(gardeMs / 1000)} s (service : ${service.actif})` };
      await pause(pasMs);
    }
  };

  // Fait de `version` la version courante, relance la station, et attend
  // qu'elle s'y dise en service.
  const basculer = async (version: string, servis: string[]): Promise<{ le: string } | { motif: string }> => {
    const debut = Date.now();
    const bascule = systeme.basculer(version);
    if (!bascule.ok) return { motif: `le passage à ${version} a échoué : ${bascule.motif}` };
    return attendreEnService(version, debut, servis);
  };

  // Conclut un essai : gardé, ou `current` remis sur la version d'avant.
  // `basculee` : faux quand rien n'a été changé — la pose a échoué —, et qu'il
  // n'y a donc rien à remettre.
  const conclureEssai = async (visee: string, depuis: string, servis: string[], essai: { le: string } | { motif: string }, basculee = true): Promise<Issue> => {
    let issue: Issue;
    if ("le" in essai) {
      issue = { quoi: "passee", version: visee, depuis, le: essai.le };
      // De côté : la version en service, et celle d'avant pour en revenir.
      for (const version of systeme.posees()) if (version !== visee && version !== depuis) systeme.retirer(version);
      dire(`brigade : mise à jour — passée en version ${visee}`);
    } else {
      ratees.add(visee);
      dire(`brigade : mise à jour — ${visee} n'a pas démarré (${essai.motif}) : retour à ${depuis}`);
      const revenue = basculee ? await basculer(depuis, servis) : await attendreEnService(depuis, 0, servis);
      issue = { quoi: "revenue", visee, restauree: depuis, motif: essai.motif, le: maintenant().toISOString(), retour: "le" in revenue ? null : revenue.motif };
      dire(`brigade : mise à jour — ${"le" in revenue ? `revenue en version ${depuis}` : `le retour à ${depuis} a échoué aussi : ${revenue.motif}`}`);
    }
    noterIssue(dossier, issue);
    etat.derniere = issue;
    etat.essai = null;
    etat.installee = systeme.installee();
    return issue;
  };

  mkdirSync(archives, { recursive: true, mode: 0o755 });

  // Un essai que le passage d'avant n'a pas conclu — la machine a redémarré,
  // la mise à jour a été tuée — se conclut d'abord : la station tourne-t-elle
  // sur la version visée ?
  if (etat.essai) {
    const { visee, depuis, servis } = etat.essai;
    dire(`brigade : mise à jour — l'essai de ${visee} n'a pas été conclu : la station est regardée`);
    const installee = prevision.installee;
    if (installee !== null && comparerVersions(installee, depuis) === 0) {
      // Rien n'a été basculé : il n'y a rien à conclure.
      etat.essai = null;
    } else {
      const constat =
        installee !== null && comparerVersions(installee, visee) === 0
          ? await attendreEnService(visee, 0, servis)
          : { motif: `le passage à ${visee} a été interrompu (current : ${installee ?? "aucune version posée"})` };
      return conclure(await conclureEssai(visee, depuis, servis, constat));
    }
  }

  const { installee } = prevision;
  if (prevision.verification !== null) {
    etat.verification = prevision.verification;
    return conclure();
  }
  if (installee === null || prevision.visee === null) {
    if (prevision.retenue !== null) etat.retenue = prevision.retenue;
    else dire(`brigade : mise à jour — à jour en ${installee}`);
    return conclure();
  }
  const visee = prevision.visee.version;
  const archive = join(archives, `${visee}.tar.gz`);

  try {
    await publications.telecharger(prevision.visee, archive);
  } catch (erreur) {
    rmSync(archive, { force: true });
    etat.verification = `l'archive de ${visee} ne s'obtient pas : ${message(erreur)}`;
    return conclure();
  }

  // Ce que la version d'avant servait, et qu'il faut encore servir.
  const enServiceAvant = lireEnService(racine);
  const servis = enServiceAvant !== null && comparerVersions(enServiceAvant.version, installee) === 0 ? enServiceAvant.servis : [];

  // L'essai est noté avant de partir : interrompu, le passage suivant le conclut.
  etat.essai = { visee, depuis: installee, servis };
  ecrire();
  dire(`brigade : mise à jour — ${installee} → ${visee}`);
  const pose = systeme.poser(archive, visee);
  rmSync(archive, { force: true });
  if (!pose.ok) return conclure(await conclureEssai(visee, installee, servis, { motif: `sa pose a échoué : ${pose.motif}` }, false));
  return conclure(await conclureEssai(visee, installee, servis, await basculer(visee, servis)));
}
