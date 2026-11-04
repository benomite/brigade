// Ce que le runtime a décidé de l'interrupteur « GitHub seul » (#2060), pour que
// le chef le lise sans fouiller le journal de la box (#2161) : accepté, la station
// GitHub seul tourne ; refusé, l'ancien chemin est gardé, et la raison est dite.
// Le runtime l'écrit à l'ouverture du projet ; `status` et `facts` le relisent, sans process.
// Éteint, rien n'est écrit et l'ancien fichier est retiré : ni ligne, ni entrée.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FICHIER_GITHUB_SEUL = "github-seul-etat.json";

export type EtatGitHubSeul = { etat: "accepted"; since: string } | { etat: "refused"; reason: string; since: string };

export function noterGitHubSeul(repertoireEtat: string, etat: { etat: "accepted" } | { etat: "refused"; reason: string } | null, maintenant = new Date()): void {
  const chemin = join(repertoireEtat, FICHIER_GITHUB_SEUL);
  if (etat === null) return rmSync(chemin, { force: true });
  mkdirSync(repertoireEtat, { recursive: true });
  const ecrit = { ...etat, since: maintenant.toISOString() };
  writeFileSync(`${chemin}.tmp`, JSON.stringify(ecrit));
  renameSync(`${chemin}.tmp`, chemin);
}

// Rien quand le fichier manque ou ne se lit pas : un projet qui n'a pas l'interrupteur allumé.
export function lireGitHubSeul(repertoireEtat: string | undefined): EtatGitHubSeul | null {
  if (!repertoireEtat) return null;
  try {
    const lu: unknown = JSON.parse(readFileSync(join(repertoireEtat, FICHIER_GITHUB_SEUL), "utf8"));
    if (typeof lu !== "object" || lu === null) return null;
    const { etat, reason, since } = lu as Record<string, unknown>;
    if (typeof since !== "string") return null;
    if (etat === "accepted") return { etat, since };
    if (etat === "refused" && typeof reason === "string") return { etat, reason, since };
    return null;
  } catch {
    return null;
  }
}

// La ligne de `status`. L'app relit la ligne refusée par `facts` (`githubSeul`), pas par ce texte.
export function direGitHubSeul(etat: EtatGitHubSeul): string {
  return etat.etat === "accepted"
    ? `GitHub-only state — on since ${etat.since}: the station takes, cooks, reviews and merges the tickets from GitHub only`
    : `GitHub-only state REFUSED — on in the project settings, but ${etat.reason}; the old path is kept (since ${etat.since})`;
}
