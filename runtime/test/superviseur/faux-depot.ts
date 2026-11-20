// Un faux dépôt GitHub sous le vrai client du runtime (`github.ts`), à la place
// de `gh api -i` : il répond en mémoire aux routes que les gestes du
// superviseur appellent, et garde chaque appel — les commentaires écrits se
// comptent sur lui, pas sur une doublure du client.
import { ouvrirGitHub, type Transport } from "../../src/github.ts";
import { ouvrirLimitesDuCompte } from "../../src/github-limite.ts";
import { ouvrirLimite } from "../../src/limite-github.ts";

export const DEPOT = "acme/shop";
export const TETE = "a".repeat(40);

type IssueFausse = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; association: string };
type CheckFaux = { name: string; status: string; conclusion: string | null; html_url: string | null };
export type Appel = { methode: string; chemin: string; champs: Array<[string, string]> };

let rang = 0;

export class FauxDepot {
  readonly appels: Appel[] = [];
  readonly issues = new Map<number, IssueFausse>();
  readonly commentaires = new Map<number, string[]>();
  checks: CheckFaux[] = [];
  readonly runs = new Map<number, { run_attempt: number; status: string }>();
  // Le prochain commentaire posté échoue (HTTP 502).
  commentaireEnEchec = false;
  private suivant = 500;

  issue(number: number, labels: string[], body = `the body of ${number}`, association = "OWNER"): void {
    this.issues.set(number, { number, title: `ticket ${number}`, body, labels: [...labels], state: "open", association });
  }

  labelsDe(number: number): string[] {
    return this.issues.get(number)?.labels ?? [];
  }

  // Les commentaires écrits, et les issues créées, tels que GitHub les a reçus.
  ecrits(): Appel[] {
    return this.appels.filter(({ methode, chemin }) => methode === "POST" && /\/issues\/\d+\/comments$/.test(chemin));
  }
  creees(): Appel[] {
    return this.appels.filter(({ methode, chemin }) => methode === "POST" && chemin === `repos/${DEPOT}/issues`);
  }
  relances(): number[] {
    return this.appels.flatMap(({ methode, chemin }) => (methode === "POST" ? Number(/actions\/runs\/(\d+)\/rerun-failed-jobs$/.exec(chemin)?.[1] ?? Number.NaN) : Number.NaN)).filter((run) => !Number.isNaN(run));
  }

  // Un check rouge de la tête de la base, job du run `run`.
  checkRouge(name: string, run: number, run_attempt = 1, status = "completed"): void {
    this.checks.push({ name, status: "completed", conclusion: "failure", html_url: `https://github.com/${DEPOT}/actions/runs/${run}/job/${run * 10}` });
    this.runs.set(run, { run_attempt, status });
  }

  // Le vrai client, branché sur ce dépôt — un client neuf par appel : rien ne se garde de l'un à l'autre.
  client() {
    return ouvrirGitHub({ depot: DEPOT, bin: `faux-gh-3944-${rang++}`, transport: this.transport, limite: ouvrirLimite(), limitesDuCompte: ouvrirLimitesDuCompte() });
  }

  readonly transport: Transport = async (args) => {
    const appel = lire(args);
    this.appels.push(appel);
    const { statut, corps } = this.repondre(appel);
    return { erreur: statut >= 300 ? new Error(`HTTP ${statut}`) : null, stdout: `HTTP/2.0 ${statut} X\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}`, stderr: "" };
  };

  private brute(issue: IssueFausse) {
    const { association, ...reste } = issue;
    return { ...reste, labels: issue.labels.map((name) => ({ name })), html_url: `https://github.com/${DEPOT}/issues/${issue.number}`, created_at: "2026-11-20T09:00:00Z", updated_at: "2026-11-20T09:00:00Z", author_association: association, user: { login: "chef" } };
  }

  private repondre({ methode, chemin, champs }: Appel): { statut: number; corps: unknown } {
    const champ = (nom: string) => champs.find(([cle]) => cle === nom)?.[1] ?? "";
    const route = chemin.slice(`repos/${DEPOT}/`.length);
    const [base = "", requete = ""] = route.split("?");
    const s = base.split("/");
    if (methode === "GET" && base === "issues" && new URLSearchParams(requete).get("state") === "open") return { statut: 200, corps: [...this.issues.values()].filter(({ state }) => state === "open").map((issue) => this.brute(issue)) };
    if (methode === "POST" && base === "issues") {
      const number = this.suivant++;
      this.issues.set(number, { number, title: champ("title"), body: champ("body"), labels: champs.filter(([cle]) => cle === "labels[]").map(([, valeur]) => valeur), state: "open", association: "OWNER" });
      return { statut: 201, corps: { number } };
    }
    if (s[0] === "issues" && s.length >= 2) {
      const issue = this.issues.get(Number(s[1]));
      if (issue === undefined) return { statut: 404, corps: { message: "Not Found" } };
      if (s[2] === undefined && methode === "GET") return { statut: 200, corps: this.brute(issue) };
      if (s[2] === undefined && methode === "PATCH") {
        if (champ("state") === "closed") issue.state = "closed";
        return { statut: 200, corps: this.brute(issue) };
      }
      if (s[2] === "comments" && methode === "GET") return { statut: 200, corps: (this.commentaires.get(issue.number) ?? []).map((body) => ({ body, author_association: "OWNER", user: { login: "box" }, created_at: "2026-11-20T10:00:00Z" })) };
      if (s[2] === "comments" && methode === "POST") {
        if (this.commentaireEnEchec) return { statut: 502, corps: { message: "Bad Gateway" } };
        this.commentaires.set(issue.number, [...(this.commentaires.get(issue.number) ?? []), champ("body")]);
        return { statut: 201, corps: { id: this.suivant++ } };
      }
      if (s[2] === "labels" && methode === "POST") {
        issue.labels = [...new Set([...issue.labels, ...champs.filter(([cle]) => cle === "labels[]").map(([, valeur]) => valeur)])];
        return { statut: 200, corps: issue.labels.map((name) => ({ name })) };
      }
      if (s[2] === "labels" && methode === "DELETE") {
        const label = decodeURIComponent(s[3] ?? "");
        if (!issue.labels.includes(label)) return { statut: 404, corps: { message: "Label does not exist" } };
        issue.labels = issue.labels.filter((autre) => autre !== label);
        return { statut: 200, corps: [] };
      }
    }
    if (methode === "GET" && base === "commits/main") return { statut: 200, corps: { sha: TETE } };
    if (methode === "GET" && base === `commits/${TETE}/check-runs`) return { statut: 200, corps: { check_runs: this.checks } };
    if (methode === "GET" && base === `commits/${TETE}/status`) return { statut: 200, corps: { statuses: [] } };
    if (s[0] === "actions" && s[1] === "runs") {
      const run = this.runs.get(Number(s[2]));
      if (run === undefined) return { statut: 404, corps: { message: "Not Found" } };
      if (methode === "GET" && s[3] === undefined) return { statut: 200, corps: run };
      if (methode === "POST" && s[3] === "rerun-failed-jobs") {
        run.run_attempt += 1;
        run.status = "queued";
        return { statut: 201, corps: {} };
      }
    }
    throw new Error(`le faux dépôt ne sait pas répondre à ${methode} ${chemin}`);
  }
}

// Les arguments de `gh api -i` : la méthode, les en-têtes, les champs, puis le chemin.
function lire(args: string[]): Appel {
  let methode: string | null = null;
  const champs: Array<[string, string]> = [];
  for (let i = 0; i < args.length - 1; i += 1) {
    const arg = args[i];
    const valeur = args[i + 1] ?? "";
    if (arg === "-X") methode = valeur.toUpperCase();
    else if (arg === "-f" || arg === "-F") {
      const egal = valeur.indexOf("=");
      champs.push([valeur.slice(0, egal), valeur.slice(egal + 1)]);
    } else if (arg !== "-H") continue;
    i += 1;
  }
  return { methode: methode ?? (champs.length > 0 ? "POST" : "GET"), chemin: args.at(-1) ?? "", champs };
}
