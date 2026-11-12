// Les notes de version (#3262) : le résumé d'une semaine devient la release d'un
// tag, sur un geste explicite du chef. Aucun autre chemin n'appelle cette action :
// ni la génération d'un résumé, ni une boucle de la station.
import type { GitHub } from "../github.ts";

// Ce qu'un résumé de semaine porte ; seul `markdown` part vers GitHub.
export type Resume = { project: string; weekStart: string; weekEnd: string; themes: unknown[]; autonomy?: unknown; waiting: unknown; markdown: string };

export type ResultatPublication =
  | { statut: "publiee"; url: string }
  | { statut: "deja-publiee"; url: string }
  | { statut: "refusee"; erreur: string };

// Le client du dépôt du projet : les trois appels dont l'action a besoin.
export type ClientRelease = Required<Pick<GitHub, "tagExiste" | "releaseDuTag" | "creerRelease">>;

export async function publierNotesDeVersion(github: ClientRelease, resume: Pick<Resume, "markdown">, tag: string): Promise<ResultatPublication> {
  if (tag.trim() === "") return { statut: "refusee", erreur: "No version tag given: nothing was published." };
  if (resume.markdown.trim() === "") return { statut: "refusee", erreur: "The summary is empty: nothing was published." };
  try {
    const existante = await github.releaseDuTag(tag);
    if (existante) return { statut: "deja-publiee", url: existante.url };
    // Sans le tag, GitHub en créerait un au bout de la branche par défaut : on ne le laisse pas faire.
    if (!(await github.tagExiste(tag))) return { statut: "refusee", erreur: `The tag ${tag} does not exist on the repository: nothing was published.` };
    return { statut: "publiee", ...(await github.creerRelease(tag, resume.markdown)) };
  } catch (erreur) {
    return { statut: "refusee", erreur: `GitHub refused the release of ${tag}: ${erreur instanceof Error ? erreur.message : String(erreur)}. Nothing was published.` };
  }
}
