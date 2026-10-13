// Ce que l'écran d'ajout propose au lieu de le demander : une valeur qui se déduit
// n'est pas une question. Rien ici ne choisit à la place du chef — le calibrage reste
// son quota, la racine des sauvegardes reste le disque que la box a posé — et rien
// n'est proposé sans dire d'où cela vient : la vue le montre, tant qu'il ne l'a pas
// lui-même choisi.
import { execFile } from "node:child_process";
import type { CalibrageDuProjet, Projet } from "./config.ts";

// Ce sur quoi la box de brigade tourne (docs/runtime.md) : à défaut de tout autre projet.
export const MESURE: CalibrageDuProjet = { manager: { modele: "sonnet", effort: "medium" }, reviewer: { modele: "sonnet", effort: "medium" } };

export type PropositionCalibrage = { calibrage: CalibrageDuProjet; origine: string };

// Le calibrage du dernier projet ajouté depuis l'app, sinon la valeur mesurée.
export function proposerCalibrage(projets: readonly Projet[]): PropositionCalibrage {
  const autre = projets.findLast((projet) => projet.calibrage !== undefined && projet.desinstalle === undefined);
  if (autre?.calibrage !== undefined) return { calibrage: autre.calibrage, origine: `ce sur quoi « ${autre.nom} » tourne, le dernier projet que tu as ajouté ici` };
  return { calibrage: MESURE, origine: "la valeur mesurée sur la box de brigade, faute d'un autre projet ajouté ici : sonnet/medium y a jugé les tickets, découpé les épiques et relu les livraisons sans un désaccord" };
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
      if (erreur !== null) return resoudre({ raison: `La racine des sauvegardes ne s'est pas lue sur « ${hote} » (${REGLAGE}) : écris la destination.` });
      const racine = racineDuReglage(sortie);
      resoudre(racine === undefined ? { raison: `${REGLAGE} ne dit pas de racine \`sauvegardes=\` sur « ${hote} » : écris la destination.` } : { racine, origine: `la racine que « ${hote} » accepte (${racine}, lue dans ${REGLAGE}), puis le nom du projet` });
    });
  });
}
