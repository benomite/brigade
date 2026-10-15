// Ce que la mise à jour de la station tient, dans son propre répertoire
// (`BRIGADE_MISE_A_JOUR_DIR`, /var/lib/brigade-station sur une machine
// installée — à root, lisible de tous) :
//
//   etat.json   où elle en est : la version installée, la plus récente
//               publiée, le gel, et ce qui retient la suivante — l'état
//               exposé, réécrit à chaque passage ;
//   issues      ce que chaque mise à jour a donné, une ligne JSON chacune,
//               en ajout seul — la station les relaie au journal de chaque
//               projet, d'où la file les dit ;
//   paquets/    le paquet de la version installée et de la précédente : de
//               quoi revenir en arrière sans rien télécharger.
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ETAT = "etat.json";
export const ISSUES = "issues";
export const PAQUETS = "paquets";

// Ce qu'une mise à jour a donné. `le` : l'instant où cela s'est su — pour un
// passage, celui où la station a démarré sur la nouvelle version.
export type Issue =
  // La station est passée de `depuis` à `version`.
  | { quoi: "passee"; version: string; depuis: string | null; le: string }
  // `visee` n'a pas démarré (`motif`) : la station est revenue à `restauree`.
  // `retour` : nul si la version d'avant tourne de nouveau ; sinon, pourquoi
  // le retour a échoué lui aussi.
  | { quoi: "revenue"; visee: string; restauree: string; motif: string; le: string; retour: string | null };

export type EtatMiseAJour = {
  installee: string | null;
  // La plus récente des versions publiées, au dernier passage.
  disponible: string | null;
  gelee: boolean;
  // Le dernier passage, et ce qui l'a empêché de lire les versions publiées.
  verifieeLe: string;
  verification: string | null;
  // Pourquoi la version disponible n'est pas installée : gel, version déjà
  // ratée, aucun paquet pour revenir en arrière. Nul quand rien n'attend.
  retenue: string | null;
  // Les versions qui n'ont pas démarré : elles ne sont pas réessayées, la
  // suivante l'est.
  ratees: string[];
  derniere: Issue | null;
  // L'essai en cours : noté avant d'installer, effacé quand il est conclu.
  // Trouvé au passage suivant — la machine a redémarré, la mise à jour a été
  // tuée —, il est conclu d'abord. `servis` : les projets que la version
  // d'avant servait.
  essai?: { visee: string; depuis: string; servis: string[] } | null;
};

export function lireEtatMiseAJour(dossier: string): EtatMiseAJour | null {
  try {
    return JSON.parse(readFileSync(join(dossier, ETAT), "utf8")) as EtatMiseAJour;
  } catch {
    return null;
  }
}

export function ecrireEtatMiseAJour(dossier: string, etat: EtatMiseAJour): void {
  mkdirSync(dossier, { recursive: true, mode: 0o755 });
  const fichier = join(dossier, ETAT);
  writeFileSync(`${fichier}.tmp`, `${JSON.stringify(etat, null, 2)}\n`, { mode: 0o644 });
  renameSync(`${fichier}.tmp`, fichier);
}

export function noterIssue(dossier: string, issue: Issue): void {
  mkdirSync(dossier, { recursive: true, mode: 0o755 });
  appendFileSync(join(dossier, ISSUES), `${JSON.stringify(issue)}\n`, { mode: 0o644 });
}

const estIssue = (lu: unknown): lu is Issue => {
  const issue = lu as Partial<Record<string, unknown>> | null;
  if (typeof issue !== "object" || issue === null || typeof issue.le !== "string") return false;
  if (issue.quoi === "passee") return typeof issue.version === "string";
  return issue.quoi === "revenue" && typeof issue.visee === "string" && typeof issue.restauree === "string" && typeof issue.motif === "string";
};

// Les issues notées, dans l'ordre. Une ligne illisible — une écriture coupée —
// est passée.
export function lireIssues(dossier: string): Issue[] {
  let texte: string;
  try {
    texte = readFileSync(join(dossier, ISSUES), "utf8");
  } catch {
    return [];
  }
  return texte.split("\n").flatMap((ligne) => {
    try {
      const lu: unknown = JSON.parse(ligne);
      return estIssue(lu) ? [lu] : [];
    } catch {
      return [];
    }
  });
}
