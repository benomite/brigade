// La fin d'une alerte de publication (#3089). Le job `alerter` de
// `.github/workflows/publier-app.yml` ouvre une issue titrée
// « publier-app: app-v1.0.185 was not published, … » quand un run ne publie pas
// l'app. Un run rejoué ou suivant la publie (#3084) : l'alerte n'a plus d'objet.
// Le job `fermer-alertes` du même workflow joue ce fichier après chaque
// publication : chaque alerte ouverte dont la release est publiée est fermée,
// avec un commentaire d'une ligne qui nomme le run qui l'a publiée.
//
//   GH_TOKEN=… GH_REPO=<owner>/<repo> [TAG=app-v<x.y.z> RUN_URL=<url>] node runtime/src/fermeture-alerte-publication.ts
//
// `TAG` et `RUN_URL` : la release que le run en cours vient de publier, et son
// adresse. Une autre release se rattache au run réussi de `publier-app` sur son
// commit ; sans run trouvé, rien n'est inventé : l'alerte reste ouverte.
//
// Rien n'est fermé sur un doute : une release qui ne se lit pas, une alerte qui
// en nomme une autre encore non publiée (l'`alerter` commente l'alerte ouverte
// au lieu d'en ouvrir une seconde), un run introuvable laissent l'alerte ouverte.
import { enProcess, Sortie, type Appel } from "./appel.ts";

// Le titre que l'`alerter` pose, quelle que soit la raison qui suit la virgule.
const TITRE_ALERTE = /^publier-app: (app-v\d+\.\d+\.\d+) was not published(?:,|$)/;
// Ce que l'`alerter` écrit dans le corps et dans chaque commentaire d'un échec.
const RELEASE_NON_PUBLIEE = /did not publish (app-v\d+\.\d+\.\d+)/g;

export const tagDeLAlerte = (titre: string): string | null => TITRE_ALERTE.exec(titre)?.[1] ?? null;

export const commentaireDeFermeture = (tag: string, run: string): string => `${tag} is published by the run ${run}, so this alert is closed.`;
const debutDuCommentaire = (tag: string) => `${tag} is published by the run `;

export type AlerteOuverte = { number: number; title: string; body: string };

// Ce que la fermeture lit et écrit de GitHub.
export type GitHubDesAlertes = {
  // Les issues ouvertes du dépôt, PR écartées.
  issuesOuvertes(): Promise<AlerteOuverte[]>;
  // Le commit d'une release publiée, ou null si elle ne l'est pas (absente ou brouillon).
  release(tag: string): Promise<{ commit: string } | null>;
  // L'adresse du run réussi de `publier-app` sur ce commit, ou null.
  runSurLeCommit(commit: string): Promise<string | null>;
  commentaires(numero: number): Promise<string[]>;
  commenter(numero: number, corps: string): Promise<void>;
  fermerIssue(numero: number): Promise<void>;
};

export type Fermeture =
  | { numero: number; tag: string; fermee: true; run: string }
  // `echec` : une lecture ou une écriture de GitHub a échoué ; l'alerte reste ouverte.
  | { numero: number; tag: string; fermee: false; raison: string; echec?: true };

export type OptionsDesAlertes = {
  github: GitHubDesAlertes;
  // La release que le run en cours vient de publier, et son adresse.
  courant?: { tag: string; run: string };
};

export async function fermerLesAlertes({ github, courant }: OptionsDesAlertes): Promise<Fermeture[]> {
  const issues = await github.issuesOuvertes();
  const resultats: Fermeture[] = [];
  for (const { number, title, body } of issues) {
    const tag = tagDeLAlerte(title);
    if (tag === null) continue;
    try {
      resultats.push(await fermerUneAlerte(github, courant, number, tag, body));
    } catch (erreur) {
      resultats.push({ numero: number, tag, fermee: false, raison: erreur instanceof Error ? erreur.message : String(erreur), echec: true });
    }
  }
  return resultats;
}

async function fermerUneAlerte(github: GitHubDesAlertes, courant: OptionsDesAlertes["courant"], numero: number, tag: string, corps: string): Promise<Fermeture> {
  const reste = (raison: string): Fermeture => ({ numero, tag, fermee: false, raison });
  const release = await github.release(tag);
  if (release === null) return reste(`${tag} is not published`);
  const commentaires = await github.commentaires(numero);
  // Les autres releases que l'alerte dit non publiées : chacune doit l'être aussi.
  const nommees = new Set([corps, ...commentaires].flatMap((texte) => [...texte.matchAll(RELEASE_NON_PUBLIEE)].map((trouve) => trouve[1] as string)));
  nommees.delete(tag);
  for (const autre of nommees) {
    if ((await github.release(autre)) === null) return reste(`it also reports ${autre}, which is not published`);
  }
  const run = courant?.tag === tag ? courant.run : await github.runSurLeCommit(release.commit);
  if (run === null) return reste(`no successful publier-app run found on ${release.commit}`);
  // Un passage précédent a commenté sans fermer : le commentaire n'est pas redit.
  if (!commentaires.some((commentaire) => commentaire.startsWith(debutDuCommentaire(tag)))) await github.commenter(numero, commentaireDeFermeture(tag, run));
  await github.fermerIssue(numero);
  return { numero, tag, fermee: true, run };
}

// Le client de l'API REST de GitHub, sur le jeton du run.
export function githubDesAlertes({ api, depot, jeton }: { api: string; depot: string; jeton: string }): GitHubDesAlertes {
  const appeler = async (chemin: string, init: { method?: string; body?: unknown } = {}): Promise<{ statut: number; donnees: unknown }> => {
    const reponse = await fetch(`${api}${chemin}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${jeton}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const texte = await reponse.text();
    if (!reponse.ok && reponse.status !== 404) throw new Error(`GitHub answered ${reponse.status} to ${init.method ?? "GET"} ${chemin}: ${texte.slice(0, 200)}`);
    return { statut: reponse.status, donnees: texte === "" ? null : JSON.parse(texte) };
  };
  const lire = async (chemin: string): Promise<unknown> => {
    const { statut, donnees } = await appeler(chemin);
    if (statut === 404) throw new Error(`GitHub answered 404 to GET ${chemin}`);
    return donnees;
  };
  const pages = async <T>(chemin: string): Promise<T[]> => {
    const tout: T[] = [];
    for (let page = 1; ; page++) {
      const lus = (await lire(`${chemin}${chemin.includes("?") ? "&" : "?"}per_page=100&page=${page}`)) as T[];
      tout.push(...lus);
      if (lus.length < 100) return tout;
    }
  };
  return {
    issuesOuvertes: async () =>
      (await pages<{ number: number; title: string; body: string | null; pull_request?: unknown }>(`/repos/${depot}/issues?state=open`))
        .filter((issue) => issue.pull_request === undefined)
        .map(({ number, title, body }) => ({ number, title, body: body ?? "" })),
    release: async (tag) => {
      const { statut, donnees } = await appeler(`/repos/${depot}/releases/tags/${encodeURIComponent(tag)}`);
      if (statut === 404) return null;
      const release = donnees as { draft: boolean; target_commitish: string };
      return release.draft ? null : { commit: release.target_commitish };
    },
    runSurLeCommit: async (commit) => {
      const { workflow_runs: runs } = (await lire(`/repos/${depot}/actions/workflows/publier-app.yml/runs?head_sha=${encodeURIComponent(commit)}&status=success&per_page=100`)) as { workflow_runs: { html_url: string; created_at: string }[] };
      // Le premier run réussi est celui qui a publié : un run suivant sur le même commit trouve le tag posé et ne publie rien.
      const premier = [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      return premier?.html_url ?? null;
    },
    commentaires: async (numero) => (await pages<{ body: string | null }>(`/repos/${depot}/issues/${numero}/comments`)).map(({ body }) => body ?? ""),
    commenter: async (numero, corps) => {
      await appeler(`/repos/${depot}/issues/${numero}/comments`, { method: "POST", body: { body: corps } });
    },
    fermerIssue: async (numero) => {
      await appeler(`/repos/${depot}/issues/${numero}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } });
    },
  };
}

export async function principal({ env, dire, redire }: Appel): Promise<void> {
  const { GH_TOKEN: jeton, GH_REPO: depot, TAG: tag, RUN_URL: run } = env;
  if (!jeton || !depot || !tag !== !run) {
    redire("usage: GH_TOKEN=… GH_REPO=<owner>/<repo> [TAG=app-v<x.y.z> RUN_URL=<url>] node runtime/src/fermeture-alerte-publication.ts");
    throw new Sortie(2);
  }
  const github = githubDesAlertes({ api: env.GITHUB_API_URL || "https://api.github.com", depot, jeton });
  // Une alerte qui ne se lit pas ou ne se ferme pas reste ouverte, et le run le dit en rouge ; les autres passent.
  const resultats = await fermerLesAlertes({ github, ...(tag && run ? { courant: { tag, run } } : {}) });
  for (const resultat of resultats) {
    if (resultat.fermee) dire(`#${resultat.numero} closed: ${resultat.tag} is published by the run ${resultat.run}.`);
    else if (resultat.echec) redire(`::error::#${resultat.numero} stays open, GitHub could not be read or written: ${resultat.raison}`);
    else dire(`#${resultat.numero} stays open: ${resultat.raison}.`);
  }
  if (resultats.length === 0) dire("No open publier-app alert.");
  const echecs = resultats.filter((resultat) => !resultat.fermee && resultat.echec).length;
  if (echecs > 0) throw new Sortie(1);
}

if (import.meta.main) await enProcess(principal);
