// Un passage de la mise à jour de la station, comme son minuteur le lance :
// elle lit les versions publiées et, s'il y en a une plus récente que celle
// installée, elle l'installe — sauf si la version est gelée, ou si celle-ci a
// déjà raté. Installer, c'est remettre le paquet à apt : dpkg pose le nouveau
// code et les unités qu'il porte, puis son postinst recharge systemd et relance
// la station. Seul le process de la station est relancé (`KillMode=process`) :
// les cooks en cours finissent leur travail, la station suivante les reprend
// (#704).
//
// Une version est gardée quand la station relancée sur elle s'est dite en
// service — sa version, sous le pid que systemd lui donne — et sert au moins
// les projets que la version d'avant servait. Sinon elle n'a pas démarré : le
// paquet de la version d'avant est réinstallé, la station revient dessus, et
// l'issue le dit en une ligne. Une version ratée n'est pas réessayée ; la
// suivante l'est.
//
// Ce que la mise à jour a donné est noté dans son répertoire (`etat.ts`) :
// c'est ce que la station relaie au journal de chaque projet, et ce que la
// file dit.
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CONFIGURATION, lireFichierDeConfiguration } from "../station/configuration.ts";
import { lireEnService } from "./en-service.ts";
import { ecrireEtatMiseAJour, lireEtatMiseAJour, noterIssue, PAQUETS, type EtatMiseAJour, type Issue } from "./etat.ts";
import type { Publication, Publications } from "./publications.ts";
import { lireReglages } from "./reglages.ts";
import { PAQUET, type Systeme } from "./systeme.ts";
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

// Ce qu'un passage a laissé : l'état exposé, et l'issue de la mise à jour
// qu'il a faite — nulle s'il n'en a fait aucune.
export type Passage = { etat: EtatMiseAJour; issue: Issue | null };

export async function passer(options: OptionsMiseAJour): Promise<Passage> {
  const { racine, dossier, systeme, publications, dire } = options;
  const maintenant = options.maintenant ?? (() => new Date());
  const gardeMs = options.gardeMs ?? GARDE_MS;
  const pasMs = options.pasMs ?? PAS_MS;
  const paquets = join(dossier, PAQUETS);
  const paquetDe = (version: string) => join(paquets, `${version}.deb`);

  const avant = lireEtatMiseAJour(dossier);
  const ratees = new Set(avant?.ratees ?? []);
  const reglages = lireReglages(racine);
  for (const probleme of reglages.problemes) dire(`brigade : mise à jour — ${probleme}`);
  const etat: EtatMiseAJour = {
    installee: systeme.installee(),
    disponible: avant?.disponible ?? null,
    gelee: reglages.gel,
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
  // systemd lui donne, démarrée après `debut`, en servant encore les projets
  // `servis` qui sont toujours configurés. Rend l'instant où elle a démarré,
  // ou pourquoi elle ne l'a pas fait.
  const attendreEnService = async (version: string, debut: number, servedOnes: string[]): Promise<{ le: string } | { motif: string }> => {
    const fin = Date.now() + gardeMs;
    const relances = systeme.service().redemarrages;
    let attente = `la station ne s'est pas dite en service en ${version}`;
    for (;;) {
      const service = systeme.service();
      if (service.actif === "failed") return { motif: `la station s'est arrêtée en échec en ${version} (systemd : failed)` };
      if (service.redemarrages > relances) return { motif: `la station est tombée en ${version} : systemd l'a relancée ${service.redemarrages - relances} fois` };
      const dite = lireEnService(racine);
      if (dite !== null && comparerVersions(dite.version, version) === 0 && dite.pid === service.pid && Date.parse(dite.depuis) >= debut - 1000) {
        const configures = new Set(lireFichierDeConfiguration(join(racine, CONFIGURATION)).projets.map((projet) => projet.nom));
        const perdus = servedOnes.filter((projet) => configures.has(projet) && !dite.servis.includes(projet));
        if (perdus.length === 0) return { le: dite.depuis };
        attente = perdus.map((projet) => `le projet ${projet} n'est plus servi en ${version}${dite.refuses[projet] ? ` : ${dite.refuses[projet]}` : ""}`).join(" ; ");
      }
      if (Date.now() >= fin) return { motif: `${attente} en ${Math.round(gardeMs / 1000)} s (systemd : ${service.actif})` };
      await pause(pasMs);
    }
  };

  // Installe un paquet, puis attend que la station s'y dise en service.
  const installer = async (fichier: string, version: string, servedOnes: string[]): Promise<{ le: string } | { motif: string }> => {
    const debut = Date.now();
    const pose = systeme.installer(fichier);
    if (!pose.ok) return { motif: `son installation a échoué : ${pose.motif}` };
    return attendreEnService(version, debut, servedOnes);
  };

  // Conclut un essai : gardé, ou la version d'avant réinstallée.
  const conclureEssai = async (visee: string, depuis: string, servedOnes: string[], essai: { le: string } | { motif: string }): Promise<Issue> => {
    let issue: Issue;
    if ("le" in essai) {
      issue = { quoi: "passee", version: visee, depuis, le: essai.le };
      // De côté : le paquet en service, et celui d'avant pour en revenir.
      for (const nom of readdirSync(paquets)) if (![`${visee}.deb`, `${depuis}.deb`].includes(nom)) rmSync(join(paquets, nom), { force: true, recursive: true });
      dire(`brigade : mise à jour — passée en version ${visee}`);
    } else {
      ratees.add(visee);
      dire(`brigade : mise à jour — ${visee} n'a pas démarré (${essai.motif}) : retour à ${depuis}`);
      const revenue = await installer(paquetDe(depuis), depuis, servedOnes);
      issue = { quoi: "revenue", visee, restauree: depuis, motif: essai.motif, le: maintenant().toISOString(), retour: "le" in revenue ? null : revenue.motif };
      dire(`brigade : mise à jour — ${"le" in revenue ? `revenue en version ${depuis}` : `le retour à ${depuis} a échoué aussi : ${revenue.motif}`}`);
    }
    noterIssue(dossier, issue);
    etat.derniere = issue;
    etat.essai = null;
    etat.installee = systeme.installee();
    return issue;
  };

  mkdirSync(paquets, { recursive: true, mode: 0o755 });

  // Un essai que le passage d'avant n'a pas conclu — la machine a redémarré,
  // la mise à jour a été tuée — se conclut d'abord : la station tourne-t-elle
  // sur la version visée ?
  if (etat.essai) {
    const { visee, depuis, servis: servedOnes } = etat.essai;
    dire(`brigade : mise à jour — l'essai de ${visee} n'a pas été conclu : la station est regardée`);
    const installee = etat.installee;
    if (installee !== null && comparerVersions(installee, depuis) === 0) {
      // Rien n'a été installé : il n'y a rien à conclure.
      etat.essai = null;
    } else {
      const constat =
        installee !== null && comparerVersions(installee, visee) === 0
          ? await attendreEnService(visee, 0, servedOnes)
          : { motif: `l'installation de ${visee} a été interrompue (dpkg : ${installee ?? "le paquet n'est pas installé tout à fait"})` };
      return conclure(await conclureEssai(visee, depuis, servedOnes, constat));
    }
  }

  const installee = etat.installee;
  if (installee === null) {
    etat.verification = `le paquet ${PAQUET} n'est pas installé tout à fait (dpkg) : rien n'est mis à jour`;
    return conclure();
  }

  let liste: Publication[];
  try {
    liste = await publications.lister();
  } catch (erreur) {
    etat.verification = `les versions publiées ne se lisent pas (${publications.nom}) : ${message(erreur)}`;
    return conclure();
  }
  const plusRecente = liste.reduce<Publication | null>((meilleure, publication) => (meilleure === null || comparerVersions(publication.version, meilleure.version) > 0 ? publication : meilleure), null);
  etat.disponible = plusRecente?.version ?? null;
  if (plusRecente === null || comparerVersions(plusRecente.version, installee) <= 0) {
    dire(`brigade : mise à jour — à jour en ${installee}`);
    return conclure();
  }
  const visee = plusRecente.version;
  if (reglages.gel) {
    etat.retenue = `version gelée en ${installee} : ${visee} attend que le gel soit levé`;
    return conclure();
  }
  if (ratees.has(visee)) {
    etat.retenue = `${visee} n'a pas démarré à son essai : elle n'est pas réessayée, la version publiée après elle le sera — ${installee} reste en service`;
    return conclure();
  }

  // Un paquet vérifié, posé dans le répertoire de la mise à jour : celui qui
  // y est déjà, ou celui de la publication.
  const obtenir = async (version: string, publication: Publication | undefined): Promise<string> => {
    const fichier = paquetDe(version);
    const lu = existsSync(fichier) ? systeme.lirePaquet(fichier) : null;
    if (lu?.paquet === PAQUET && comparerVersions(lu.version, version) === 0) return fichier;
    if (publication === undefined) throw new Error(`aucune publication de ${version}, et aucun paquet de côté`);
    await publications.telecharger(publication, fichier);
    const telecharge = systeme.lirePaquet(fichier);
    if (telecharge?.paquet !== PAQUET || comparerVersions(telecharge.version, version) !== 0) {
      rmSync(fichier, { force: true });
      throw new Error(`le paquet publié pour ${version} n'est pas celui de ${PAQUET} en ${version}${telecharge === null ? "" : ` (${telecharge.paquet} ${telecharge.version})`}`);
    }
    return fichier;
  };

  // Le chemin du retour d'abord : sans le paquet de la version installée,
  // une nouvelle qui ne démarrerait pas ne laisserait rien en service.
  try {
    await obtenir(installee, liste.find((publication) => comparerVersions(publication.version, installee) === 0));
  } catch (erreur) {
    etat.retenue = `${visee} n'est pas installée : rien ne permettrait de revenir à ${installee} si elle ne démarrait pas — ${message(erreur)}`;
    return conclure();
  }
  let nouveau: string;
  try {
    nouveau = await obtenir(visee, plusRecente);
  } catch (erreur) {
    etat.verification = `le paquet de ${visee} ne s'obtient pas : ${message(erreur)}`;
    return conclure();
  }

  // Ce que la version d'avant servait, et qu'il faut encore servir.
  const enServiceAvant = lireEnService(racine);
  const servedOnes = enServiceAvant !== null && comparerVersions(enServiceAvant.version, installee) === 0 ? enServiceAvant.servis : [];

  // L'essai est noté avant de partir : interrompu, le passage suivant le conclut.
  etat.essai = { visee, depuis: installee, servis: servedOnes };
  ecrire();
  dire(`brigade : mise à jour — ${installee} → ${visee}`);
  return conclure(await conclureEssai(visee, installee, servedOnes, await installer(nouveau, visee, servedOnes)));
}
