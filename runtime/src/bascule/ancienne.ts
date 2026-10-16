// L'ancienne installation d'une machine, lue avant d'y toucher : une unité
// par projet (`brigade@<projet>.service`) et sa porte
// (`brigade-porte@<projet>.service`), ses réglages dans des drop-ins, ses
// gestes liés depuis /usr/local/bin vers le clone de brigade, leurs règles
// sudoers. La bascule en tire un plan : ce que la station reprend — une ligne
// de sa configuration par projet, son état laissé où il est —, et ce qui
// part. Tout est lu, et tout refus dit, avant que rien ne change.
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DECISIONS } from "../decisions.ts";
import { NOM_DE_PROJET } from "../runtime.ts";
import { CONFIGURATION, ETATS, lireConfiguration, lireFichierDeConfiguration } from "../station/configuration.ts";
import { environnementDe, fichiersDeLInstance, lireAvecInstance, lireDirectives, type Directive } from "./unites.ts";

// Les lieux de la machine, sous `racine` (`/`, hors des tests).
export function lieux(racine: string) {
  const sous = (...chemin: string[]) => join(racine, ...chemin);
  return {
    unites: sous("etc/systemd/system"),
    bin: sous("usr/local/bin"),
    sudoers: sous("etc/sudoers.d"),
    station: sous("var/lib/brigade"),
    // Ce que le paquet de la station pose : son unité, et le geste `brigade`.
    uniteDeLaStation: sous("usr/lib/systemd/system/brigade-station.service"),
    geste: sous("usr/lib/brigade-station/brigade"),
    // Où la bascule note ce qu'elle a fait, à côté de la mise à jour (à root).
    note: sous("var/lib/brigade-station/bascule.json"),
  };
}
export type Lieux = ReturnType<typeof lieux>;

export const GABARIT = "brigade@.service";
const INSTANCE = /^brigade@([^.]+)\.service$/;
const DROPINS_D_INSTANCE = /^brigade@([^.]+)\.service\.d$/;
// La porte d'un projet de l'ancienne installation : une unité à côté de la
// sienne, qui tient sa liste blanche. Les portes de la station la remplacent
// — même port, même liste, lue au même journal.
export const GABARIT_PORTE = "brigade-porte@.service";
const INSTANCE_PORTE = /^brigade-porte@([^.]+)\.service$/;
const DROPINS_DE_PORTE = /^brigade-porte@([^.]+)\.service\.d$/;
// Le renouvellement de la session Max de l'ancienne installation : le paquet
// porte le sien, sur le même fichier d'état. Deux qui tournent se disputent
// les identifiants du compte.
export const ANCIEN_RENOUVELLEMENT = ["brigade-renouvellement.timer", "brigade-renouvellement.service"];

// Ce qu'une ligne de la configuration ne porte pas : ses trois premiers
// champs, et ce que la station tient elle-même.
const TENUES = ["BRIGADE_PROJECT", "BRIGADE_GITHUB_REPO", "BRIGADE_BASE_BRANCH", "BRIGADE_STATE_DIR", "BRIGADE_STATION_DIR"];
// Le port de sa porte : la station le tient, il ne s'écrit pas sur la ligne
// (`ProjetRepris.porte`).
const PORTE = "BRIGADE_PROXY_PORT";
// Hors de `BRIGADE_…`, ce qui ne se reprend pas sans rien perdre : le PATH de
// l'ancienne unité, la station a le sien.
const IGNOREES = ["PATH"];

export type ProjetRepris = {
  nom: string;
  depot: string;
  base: string;
  // Le répertoire d'état de l'ancienne unité — journal, verrou, runs,
  // worktrees : il reste où il est, la station y accède par `etat/<nom>`.
  etat: string;
  clone: string;
  reglages: Record<string, string>;
  // Le port de sa porte dans l'ancienne installation, que celle de la station
  // reprend : un cook en vol la retrouve où il la connaît. Null : il n'en
  // avait pas, la station lui en ouvre une.
  porte: number | null;
  // La ligne de la configuration qui le reprend.
  ligne: string;
  // Déjà dans la configuration (une bascule reprise après une panne).
  dejaConfigure: boolean;
  dejaLie: boolean;
  // Ce qui ne se reprend pas, dit : les décisions trouvées dans l'unité (elles
  // vivent au journal), les autres réglages de l'unité (la station a les siens).
  decisionsEcartees: string[];
  reglagesDeLUnite: string[];
};

export type Plan = {
  projets: ProjetRepris[];
  // Les instances sans journal : rien à reprendre, leur unité part.
  sansJournal: string[];
  // Toutes les instances de l'ancienne unité, à arrêter et désactiver.
  instances: string[];
  // Toutes les portes de l'ancienne installation, à arrêter et désactiver
  // après elles.
  portes: string[];
  // Le renouvellement de l'ancienne installation, à arrêter et retirer.
  renouvellement: string[];
  // Les fichiers et répertoires d'unités à retirer, et les liens d'activation.
  unites: string[];
  // Les gestes de l'ancienne installation liés depuis /usr/local/bin, à retirer.
  liens: string[];
  // Le lien du geste `brigade`, à pointer sur celui du paquet.
  geste: { lien: string; vers: string } | null;
  // Les règles sudoers qui ne nomment qu'un geste retiré.
  regles: string[];
};

export type Lecture = { plan: Plan | null; refus: string[] };

const lister = (repertoire: string) => (existsSync(repertoire) ? readdirSync(repertoire) : []);
const estLien = (chemin: string) => {
  try {
    return lstatSync(chemin).isSymbolicLink();
  } catch {
    return false;
  }
};
const reel = (chemin: string) => {
  try {
    return realpathSync(chemin);
  } catch {
    return resolve(chemin);
  }
};
const sous = (racine: string, chemin: string) => chemin.startsWith(`${racine}/`);

// Lit l'ancienne installation. Sans elle — ni gabarit, ni instance —, il n'y a
// rien à basculer : `plan` est null.
export function lireAncienneInstallation(ici: Lieux): Lecture {
  const refus: string[] = [];
  const gabarit = join(ici.unites, GABARIT);
  const noms = new Set<string>();
  const portes = new Set<string>();
  for (const entree of lister(ici.unites)) {
    const declare = DROPINS_D_INSTANCE.exec(entree)?.[1];
    if (declare) noms.add(declare);
    const porte = DROPINS_DE_PORTE.exec(entree)?.[1];
    if (porte) portes.add(porte);
    if (entree.endsWith(".wants") || entree.endsWith(".requires")) {
      for (const lien of lister(join(ici.unites, entree))) {
        const active = INSTANCE.exec(lien)?.[1];
        if (active) noms.add(active);
        const activePorte = INSTANCE_PORTE.exec(lien)?.[1];
        if (activePorte) portes.add(activePorte);
      }
    }
  }
  if (!existsSync(gabarit) && noms.size === 0) return { plan: null, refus };
  if (!existsSync(gabarit)) return { plan: null, refus: [`${[...noms].map((nom) => `brigade@${nom}.service`).join(", ")} sans son gabarit (${gabarit}) : l'environnement de ces projets ne se lit pas`] };

  const directivesDuGabarit = lireDirectives(readFileSync(gabarit, "utf8"));
  const dossierDuGabarit = directivesDuGabarit.find((d) => d.section === "Service" && d.cle === "WorkingDirectory")?.valeur;
  // Les répertoires `deploy/` d'où l'ancienne installation liait ses gestes.
  const deploys = new Set<string>();
  if (dossierDuGabarit) deploys.add(join(dossierDuGabarit, "deploy"));

  const station = lireStation(ici.uniteDeLaStation);
  const configuration = lireFichierDeConfiguration(join(ici.station, CONFIGURATION));
  const projets: ProjetRepris[] = [];
  const sansJournal: string[] = [];
  for (const nom of [...noms].sort()) {
    const unite = `brigade@${nom}.service`;
    const dire = (pourquoi: string) => void refus.push(`${unite} : ${pourquoi}`);
    if (!NOM_DE_PROJET.test(nom)) {
      dire("son nom n'est pas un nom de projet que la station accepte (minuscules, chiffres, tirets)");
      continue;
    }
    const inconnus = new Set<string>();
    const fichiers = fichiersDeLInstance(ici.unites, GABARIT, unite);
    const dropins = fichiers.dropins.map((fichier) => lireAvecInstance(fichier, nom, inconnus));
    const toutes: Directive[] = [...lireAvecInstance(fichiers.gabarit, nom, inconnus), ...dropins.flat()];
    if (inconnus.size > 0) dire(`spécificateurs que la bascule ne remplace pas : ${[...inconnus].join(", ")}`);
    if (toutes.some((d) => d.section === "Service" && d.cle === "EnvironmentFile")) dire("EnvironmentFile= : ses variables ne se lisent pas ici — les écrire en Environment= dans un drop-in, puis relancer l'installation");
    const dossier = toutes.filter((d) => d.section === "Service" && d.cle === "WorkingDirectory").at(-1)?.valeur;
    if (dossier) deploys.add(join(dossier, "deploy"));

    const env = environnementDe(toutes);
    const etat = env.get("BRIGADE_STATE_DIR") ?? "";
    if (etat === "" || !existsSync(join(etat, "log.db"))) {
      sansJournal.push(nom);
      continue;
    }
    const depot = env.get("BRIGADE_GITHUB_REPO") ?? "";
    const base = env.get("BRIGADE_BASE_BRANCH") ?? "";
    const clone = env.get("BRIGADE_REPO_DIR") ?? "";
    if (depot === "") dire("BRIGADE_GITHUB_REPO n'est pas défini : le dépôt du projet ne se reprend pas");
    if (base === "") dire("BRIGADE_BASE_BRANCH n'est pas défini : la branche d'intégration ne se reprend pas");
    if (clone === "" || !existsSync(clone)) dire(`le clone du projet (${clone || "BRIGADE_REPO_DIR non défini"}) n'existe pas`);

    const reglages: Record<string, string> = { BRIGADE_REPO_DIR: clone };
    const decisionsEcartees: string[] = [];
    const portLu = env.get(PORTE);
    let porte: number | null = null;
    if (portLu !== undefined && portLu !== "") {
      porte = Number(portLu);
      if (!/^[1-9][0-9]{0,4}$/.test(portLu) || porte > 65535) dire(`${PORTE} vaut « ${portLu} », qui n'est pas un port : sa porte ne se reprend pas`);
    }
    for (const [cle, valeur] of env) {
      if (TENUES.includes(cle) || cle === "BRIGADE_REPO_DIR" || cle === PORTE) continue;
      if (!cle.startsWith("BRIGADE_")) {
        if (!IGNOREES.includes(cle)) dire(`${cle} : la configuration de la station ne porte que des réglages BRIGADE_… — le retirer de l'unité, ou le donner autrement, puis relancer l'installation`);
        continue;
      }
      if ((DECISIONS as readonly string[]).includes(cle)) {
        decisionsEcartees.push(cle);
        continue;
      }
      if (station.get(cle) === valeur) continue;
      reglages[cle] = valeur;
    }
    for (const [cle, valeur] of Object.entries(reglages)) if (/\s/.test(valeur)) dire(`${cle} : sa valeur contient un blanc, qu'une ligne de la configuration ne porte pas`);
    const reglagesDeLUnite = [...new Set(dropins.flat().flatMap((d) => (d.cle === "Environment" ? [] : [d.cle])))].sort();

    const ligne = [nom, depot, base, ...Object.entries(reglages).map(([cle, valeur]) => `${cle}=${valeur}`)].join(" ");
    const relue = lireConfiguration(ligne);
    if (depot !== "" && base !== "" && relue.problemes.length > 0) dire(`la ligne qui le reprendrait est refusée par la station — ${relue.problemes.join(" ; ")}`);

    const deja = configuration.projets.find((projet) => projet.nom === nom);
    if (deja && (deja.depot !== depot || deja.base !== base)) dire(`la configuration de la station a déjà une ligne « ${nom} » (${deja.depot}, ${deja.base}), qui n'est pas celle de son unité (${depot}, ${base})`);
    const lien = join(ici.station, ETATS, nom);
    let dejaLie = false;
    if (existsSync(lien) || estLien(lien)) {
      if (reel(lien) === reel(etat)) dejaLie = true;
      else dire(`${lien} existe déjà, et n'est pas son état (${etat})`);
    }
    projets.push({ nom, depot, base, etat, clone, reglages, porte, ligne, dejaConfigure: deja !== undefined, dejaLie, decisionsEcartees, reglagesDeLUnite });
  }
  const instances = [...noms].sort().map((nom) => `brigade@${nom}.service`);
  const instancesDePorte = [...portes].sort().map((nom) => `brigade-porte@${nom}.service`);

  // Les fichiers d'unités : le gabarit, ses drop-ins et ceux de chaque
  // instance, ceux des portes, l'ancien renouvellement, et les liens
  // d'activation qui les nomment.
  const unites: string[] = [];
  const renouvellement = ANCIEN_RENOUVELLEMENT.filter((nom) => existsSync(join(ici.unites, nom)));
  for (const entree of lister(ici.unites)) {
    const chemin = join(ici.unites, entree);
    if (entree === GABARIT || entree === `${GABARIT}.d` || DROPINS_D_INSTANCE.test(entree) || INSTANCE.test(entree)) unites.push(chemin);
    if (entree === GABARIT_PORTE || entree === `${GABARIT_PORTE}.d` || DROPINS_DE_PORTE.test(entree) || INSTANCE_PORTE.test(entree)) unites.push(chemin);
    if (ANCIEN_RENOUVELLEMENT.some((nom) => entree === nom || entree === `${nom}.d`)) unites.push(chemin);
    if (entree.endsWith(".wants") || entree.endsWith(".requires")) {
      for (const lien of lister(chemin)) if (INSTANCE.test(lien) || INSTANCE_PORTE.test(lien) || ANCIEN_RENOUVELLEMENT.includes(lien)) unites.push(join(chemin, lien));
    }
  }

  // Les gestes : les liens de /usr/local/bin vers un `deploy/` de l'ancienne
  // installation. Le geste `brigade` est gardé — l'app le lance par `ssh` —,
  // pointé sur celui du paquet ; les autres partent.
  const liens: string[] = [];
  let geste: Plan["geste"] = null;
  const deploysReels = [...deploys].flatMap((d) => [resolve(d), reel(d)]);
  for (const entree of lister(ici.bin)) {
    const chemin = join(ici.bin, entree);
    if (!estLien(chemin)) continue;
    const cible = resolve(dirname(chemin), readlinkSync(chemin));
    if (!deploysReels.some((deploy) => sous(deploy, cible) || sous(deploy, reel(cible)))) continue;
    if (cible.endsWith("/brigade") && existsSync(ici.geste)) geste = { lien: chemin, vers: ici.geste };
    else if (!cible.endsWith("/brigade")) liens.push(chemin);
  }

  // Les règles sudoers : un fichier dont une règle nomme un geste retiré part.
  const regles: string[] = [];
  for (const entree of lister(ici.sudoers)) {
    const chemin = join(ici.sudoers, entree);
    let texte: string;
    try {
      texte = readFileSync(chemin, "utf8");
    } catch (erreur) {
      refus.push(`${chemin} ne se lit pas (${(erreur as Error).message}) : ses règles ne s'éprouvent pas`);
      continue;
    }
    const regle = texte
      .split("\n")
      .filter((ligne) => !ligne.trim().startsWith("#"))
      .join("\n");
    if (liens.some((lien) => new RegExp(`(^|[\\s,:])${lien.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s,])`, "m").test(regle))) regles.push(chemin);
  }

  return { plan: refus.length > 0 ? null : { projets, sansJournal, instances, portes: instancesDePorte, renouvellement, unites, liens, geste, regles }, refus };
}

// L'environnement que l'unité de la station donne à tous ses projets : ce qui
// y est déjà n'a pas à être écrit sur une ligne.
function lireStation(unite: string): Map<string, string> {
  if (!existsSync(unite)) return new Map();
  return environnementDe(lireDirectives(readFileSync(unite, "utf8")));
}
