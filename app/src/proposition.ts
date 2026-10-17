// Ce que l'écran d'ajout propose au lieu de le demander : une valeur qui se déduit
// n'est pas une question. Rien ici ne choisit à la place du chef — le calibrage reste
// son quota, la racine des sauvegardes reste le disque que la box a posé — et rien
// n'est proposé sans dire d'où cela vient : la vue le montre, tant qu'il ne l'a pas
// lui-même choisi.
import { execFile } from "node:child_process";
import type { CalibrageDuProjet, Projet } from "./config.ts";

// Ce sur quoi la box de brigade tourne (docs/runtime/README.md) : à défaut de tout autre projet.
export const MESURE: CalibrageDuProjet = { manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "sonnet", effort: "medium" } };

export type PropositionCalibrage = { calibrage: CalibrageDuProjet; origine: string };

// Le calibrage du dernier projet ajouté depuis l'app, sinon la valeur mesurée.
export function proposerCalibrage(projets: readonly Projet[]): PropositionCalibrage {
  const autre = projets.findLast((projet) => projet.calibrage !== undefined && projet.desinstalle === undefined);
  if (autre?.calibrage !== undefined) return { calibrage: autre.calibrage, origine: `what “${autre.nom}” runs on, the last project you added here` };
  return { calibrage: MESURE, origine: "the value measured on brigade's box, for lack of another project added here: sonnet/medium judged tickets, split epics and reviewed deliveries there without a single disagreement" };
}

// Le réglage du geste d'installation de la box (/etc/brigade-installer.conf) : sa racine des sauvegardes.
export const REGLAGE = "/etc/brigade-installer.conf";

export function racineDuReglage(contenu: string): string | undefined {
  for (const ligne of contenu.split("\n")) {
    const [, valeur] = /^\s*sauvegardes\s*=\s*(.*?)\s*$/.exec(ligne) ?? [];
    if (valeur === undefined) continue;
    const racine = valeur.replace(/\/+$/, "");
    return racine.startsWith("/") && !racine.includes("\0") ? racine : undefined;
  }
  return undefined;
}

// La destination proposée : sous la racine, au nom du projet. Rien tant qu'il n'a pas de nom.
export function destinationProposee(racine: string, nom: string): string | undefined {
  return nom === "" ? undefined : `${racine}/${nom}`;
}

export type Racine = { racine: string; origine: string } | { raison: string };

// Lit la racine que la box accepte, dans son réglage — lisible de tous. Jamais d'exception :
// une box pas jointe, ou un réglage qui n'y est pas, c'est un champ qui reste à écrire.
export function lireRacine(options: { ssh: string; delaiMs: number; connexionS: number }, hote: string): Promise<Racine> {
  const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${options.connexionS}`, "--", hote, "cat", REGLAGE];
  return new Promise((resoudre) => {
    execFile(options.ssh, args, { timeout: options.delaiMs, maxBuffer: 1024 * 1024 }, (erreur, sortie) => {
      if (erreur !== null) return resoudre({ raison: `The backup root could not be read on “${hote}” (${REGLAGE}): type the destination.` });
      const racine = racineDuReglage(sortie);
      resoudre(racine === undefined ? { raison: `${REGLAGE} gives no \`sauvegardes=\` root on “${hote}”: type the destination.` } : { racine, origine: `the root that “${hote}” accepts (${racine}, read from ${REGLAGE}), then the project name` });
    });
  });
}
