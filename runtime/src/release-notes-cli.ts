// Le geste du chef qui publie le résumé d'une semaine comme notes d'une version (#3262) :
//   npm --prefix runtime run release-notes -- <tag> <summary.json>
// `summary.json` est l'enregistrement du résumé ({ project, weekStart, weekEnd, themes, … markdown }) ;
// son `markdown` devient le corps de la release du tag, sur le dépôt du projet. Le geste est le seul
// chemin vers `publierNotesDeVersion` : rien ne publie de lui-même, ni la génération d'un résumé ni la station.
import { readFileSync } from "node:fs";
import { configRail } from "./alimenter.ts";
import { enProcess, Sortie, type Appel } from "./appel.ts";
import { ouvrirGitHub } from "./github.ts";
import { publierNotesDeVersion } from "./notes-de-version/publier.ts";
import { ConfigInvalide } from "./runtime.ts";

const USAGE = "usage: BRIGADE_GITHUB_REPO=<owner>/<repo> npm --prefix runtime run release-notes -- <tag> <summary.json>";

export async function principal({ args, env, dire, redire }: Appel): Promise<void> {
  function echouer(code: number, message: string): never {
    redire(`brigade : ${message}`);
    throw new Sortie(code);
  }
  const [tag, fichier, ...deTrop] = args;
  if (tag === undefined || fichier === undefined || deTrop.length > 0) echouer(2, USAGE);
  let rail: ReturnType<typeof configRail>;
  try {
    rail = configRail(env);
  } catch (erreur) {
    if (erreur instanceof ConfigInvalide) echouer(2, `${erreur.message}\n${USAGE}`);
    throw erreur;
  }
  let markdown: unknown;
  try {
    markdown = (JSON.parse(readFileSync(fichier, "utf8")) as { markdown?: unknown } | null)?.markdown;
  } catch (erreur) {
    echouer(1, `the summary ${fichier} cannot be read: ${erreur instanceof Error ? erreur.message : String(erreur)}. Nothing was published.`);
  }
  if (typeof markdown !== "string") echouer(1, `the summary ${fichier} has no markdown: nothing was published.`);

  // Un geste du chef : la box ne retient aucun de ses appels (limite-github.ts).
  const github = ouvrirGitHub({ depot: rail.depot, bin: rail.gh, usage: "geste" });
  try {
    const resultat = await publierNotesDeVersion(github, { markdown }, tag);
    if (resultat.statut === "refusee") echouer(1, resultat.erreur);
    dire(resultat.statut === "publiee" ? `release ${tag} published: ${resultat.url}` : `release ${tag} already published: ${resultat.url} — nothing was changed`);
  } finally {
    github.fermer();
  }
}

if (import.meta.main) await enProcess(principal);
