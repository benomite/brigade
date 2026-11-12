#!/usr/bin/env node
// Doublure de `gh` pour une vraie station qui sert un premier ticket, sans
// réseau : un GitHub qui se souvient. Les tickets, leurs labels et leurs
// commentaires, et les PR ouvertes vivent dans `$FAUX_GITHUB/etat.json`, que le
// test écrit avant de lancer la station et relit ensuite ; chaque appel y est
// noté dans `$FAUX_GITHUB/appels`, une ligne chacun, ceux auxquels elle ne sait
// pas répondre précédés de « ? » (404, comme un chemin inconnu de GitHub).
//
// `gh repo clone <owner>/<repo> <dossier>` clone l'origine nue
// `$FAUX_ORIGINES/<owner>/<repo>.git`. `gh api -i [-X <méthode>] [-f|-F
// champ=valeur]… <chemin>` répond comme `gh api --include` : le statut, les
// en-têtes, une ligne vide, le corps JSON.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type TicketFaux = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; created_at: string };
export type CommentaireFaux = { id: number; body: string; user: { login: string }; author_association: string; created_at: string };
export type PRFaux = { number: number; title: string; body: string; head: string; base: string; sha: string; state: "open" | "closed"; merged: boolean };
export type EtatFaux = { compte: string; tickets: TicketFaux[]; commentaires: Record<string, CommentaireFaux[]>; prs: PRFaux[]; horloge: number; suivant: number };

const dossier = process.env.FAUX_GITHUB ?? "";
const args = process.argv.slice(2);
appendFileSync(join(dossier, "appels"), `${JSON.stringify(args)}\n`);

if (args[0] === "repo" && args[1] === "clone") {
  const [depot = "", cible = ""] = args.slice(2);
  execFileSync("git", ["clone", "-q", join(process.env.FAUX_ORIGINES ?? "", `${depot.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "")}.git`), cible], { stdio: "inherit" });
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "token") {
  process.stdout.write("gho_faux\n");
  process.exit(0);
}
if (args[0] !== "api") {
  appendFileSync(join(dossier, "appels"), `? ${JSON.stringify(args)}\n`);
  process.exit(1);
}

// Les appels concurrents de la station se suivent : un verrou par répertoire.
const verrou = join(dossier, "verrou");
for (;;) {
  try {
    mkdirSync(verrou);
    break;
  } catch {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
  }
}
let code = 0;
try {
  code = repondre();
} finally {
  rmdirSync(verrou);
}
process.exit(code);

function repondre(): number {
  const fichier = join(dossier, "etat.json");
  const etat = JSON.parse(readFileSync(fichier, "utf8")) as EtatFaux;
  // Le chemin est le seul argument qui n'est ni une option ni sa valeur.
  let methode = "GET";
  let chemin = "";
  const champs = new Map<string, string[]>();
  for (let rang = 1; rang < args.length; rang++) {
    const arg = args[rang] ?? "";
    if (arg === "-i") continue;
    if (arg === "-X" || arg === "--method") methode = args[++rang] ?? methode;
    else if (arg === "-f" || arg === "-F") {
      const champ = args[++rang] ?? "";
      const egal = champ.indexOf("=");
      champs.set(champ.slice(0, egal), [...(champs.get(champ.slice(0, egal)) ?? []), champ.slice(egal + 1)]);
    } else if (arg.startsWith("-")) rang++;
    else chemin = arg.replace(/^\//, "");
  }
  const [route = "", requete = ""] = chemin.split("?");
  const parametres = new URLSearchParams(requete);
  const maintenant = () => new Date((etat.horloge += 1000)).toISOString();
  const ecrire = () => {
    writeFileSync(`${fichier}.tmp`, JSON.stringify(etat, null, 2));
    renameSync(`${fichier}.tmp`, fichier);
  };
  const rendre = (statut: number, corps: unknown) => {
    process.stdout.write(`HTTP/2.0 ${statut}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}\n`);
    return statut >= 400 ? 1 : 0;
  };
  const inconnu = () => {
    appendFileSync(join(dossier, "appels"), `? ${methode} ${chemin}\n`);
    return rendre(404, { message: "Not Found" });
  };
  const issue = (ticket: TicketFaux) => ({ ...ticket, labels: ticket.labels.map((name) => ({ name })), updated_at: ticket.created_at, html_url: `https://github.com/acme/shop/issues/${ticket.number}`, user: { login: "chef" }, author_association: "OWNER", assignees: [] });
  const pr = (lue: PRFaux) => ({ number: lue.number, title: lue.title, body: lue.body, html_url: `https://github.com/acme/shop/pull/${lue.number}`, state: lue.state, merged: lue.merged, merged_at: null, mergeable_state: "clean", mergeable: true, base: { ref: lue.base }, head: { ref: lue.head, sha: lue.sha }, merged_by: null, user: { login: etat.compte } });

  if (route === "user") return rendre(200, { login: etat.compte });
  // L'instantané du tour (github-etat/instantane.ts) : les tickets `fire`
  // ouverts, les PR ouvertes, et une CI verte partout.
  const vert = { contexts: { pageInfo: { hasNextPage: false }, nodes: [{ __typename: "CheckRun", name: "tests", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: null }] } };
  if (route === "graphql" && (champs.get("query")?.[0] ?? "").includes("pullRequests(first: 30")) {
    return rendre(200, {
      data: {
        repository: {
          issues: { pageInfo: { hasNextPage: false }, nodes: etat.tickets.filter((t) => t.state === "open" && t.labels.includes("fire")).map((t) => ({ number: t.number, title: t.title, body: t.body, labels: { nodes: t.labels.map((name) => ({ name })) } })) },
          pullRequests: {
            pageInfo: { hasNextPage: false },
            nodes: etat.prs.filter((p) => p.state === "open").map((p) => ({ number: p.number, headRefName: p.head, headRefOid: p.sha, isCrossRepository: false, mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", files: { pageInfo: { hasNextPage: false }, nodes: [] }, commits: { nodes: [{ commit: { statusCheckRollup: vert } }] } })),
          },
          ref: { target: { statusCheckRollup: vert } },
        },
      },
    });
  }
  const m = /^repos\/([^/]+\/[^/]+)(?:\/(.*))?$/.exec(route);
  if (m === null) return inconnu();
  const reste = m[2] ?? "";
  let n: RegExpExecArray | null;
  if (reste === "" && methode === "GET") return rendre(200, { full_name: m[1], default_branch: "main", permissions: { admin: true, push: true, pull: true } });
  if (reste === "issues" && methode === "GET") {
    const etatVoulu = parametres.get("state") ?? "open";
    const labels = (parametres.get("labels") ?? "").split(",").filter(Boolean);
    return rendre(200, etat.tickets.filter((t) => (etatVoulu === "all" || t.state === etatVoulu) && labels.every((l) => t.labels.includes(l))).map(issue));
  }
  if ((n = /^issues\/(\d+)$/.exec(reste))) {
    const ticket = etat.tickets.find((t) => t.number === Number(n?.[1]));
    if (ticket === undefined) return inconnu();
    if (methode === "PATCH") {
      if (champs.has("state")) ticket.state = champs.get("state")?.[0] as "open" | "closed";
      ecrire();
    }
    return rendre(200, issue(ticket));
  }
  if ((n = /^issues\/(\d+)\/comments$/.exec(reste))) {
    const cle = String(Number(n[1]));
    if (methode === "POST") {
      const commentaire = { id: etat.suivant++, body: champs.get("body")?.[0] ?? "", user: { login: etat.compte }, author_association: "OWNER", created_at: maintenant() };
      etat.commentaires[cle] = [...(etat.commentaires[cle] ?? []), commentaire];
      ecrire();
      return rendre(201, commentaire);
    }
    return rendre(200, etat.commentaires[cle] ?? []);
  }
  if ((n = /^issues\/comments\/(\d+)$/.exec(reste))) {
    const commentaire = Object.values(etat.commentaires).flat().find((c) => c.id === Number(n?.[1]));
    if (commentaire === undefined) return inconnu();
    if (methode === "PATCH") {
      commentaire.body = champs.get("body")?.[0] ?? commentaire.body;
      ecrire();
    }
    return rendre(200, commentaire);
  }
  if ((n = /^issues\/(\d+)\/labels(?:\/(.+))?$/.exec(reste))) {
    const ticket = etat.tickets.find((t) => t.number === Number(n?.[1]));
    if (ticket === undefined) return inconnu();
    if (methode === "POST") ticket.labels = [...new Set([...ticket.labels, ...(champs.get("labels[]") ?? [])])];
    if (methode === "DELETE") ticket.labels = ticket.labels.filter((l) => l !== decodeURIComponent(n?.[2] ?? ""));
    ecrire();
    return rendre(200, ticket.labels.map((name) => ({ name })));
  }
  if (/^issues\/\d+\/(events|timeline)$/.test(reste)) return rendre(200, []);
  if (reste === "pulls" && methode === "POST") {
    const ouverte: PRFaux = { number: etat.suivant++, title: champs.get("title")?.[0] ?? "", body: champs.get("body")?.[0] ?? "", head: champs.get("head")?.[0] ?? "", base: champs.get("base")?.[0] ?? "", sha: "", state: "open", merged: false };
    ouverte.sha = execFileSync("git", ["--git-dir", join(process.env.FAUX_ORIGINES ?? "", `${m[1]}.git`), "rev-parse", ouverte.head], { encoding: "utf8" }).trim();
    etat.prs.push(ouverte);
    ecrire();
    return rendre(201, pr(ouverte));
  }
  if (reste === "pulls") {
    const tete = parametres.get("head")?.split(":").at(-1);
    const voulu = parametres.get("state") ?? "open";
    return rendre(200, etat.prs.filter((p) => (voulu === "all" || p.state === voulu) && (tete === undefined || p.head === tete)).map(pr));
  }
  if ((n = /^pulls\/(\d+)$/.exec(reste))) {
    const lue = etat.prs.find((p) => p.number === Number(n?.[1]));
    return lue === undefined ? inconnu() : rendre(200, pr(lue));
  }
  if (/^pulls\/\d+\/files$/.test(reste)) return rendre(200, []);
  if (/^commits\/[^/]+\/check-runs$/.test(reste)) return rendre(200, { total_count: 1, check_runs: [{ name: "tests", status: "completed", conclusion: "success", html_url: null }] });
  if (/^commits\/[^/]+\/status$/.test(reste)) return rendre(200, { state: "success", statuses: [] });
  return inconnu();
}
