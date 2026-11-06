// Un faux GitHub, branché sous le client du runtime (`github.ts`) à la place de
// `gh api -i` : il répond en mémoire aux chemins que la station GitHub seul
// demande, et compte chaque appel qui lui arrive. Il rend un ETag sur chaque
// lecture, et un 304 quand on la redemande sous `If-None-Match` sans que rien
// n'ait changé — un appel que GitHub ne compte pas dans son quota. Un appel
// compté est donc tout appel qui n'a pas reçu de 304.
//
// Le compte est le sien : ni le compteur de la box (`limite-github.ts`), ni sa
// cadence n'y sont pour rien.
import { createHash } from "node:crypto";
import type { Transport } from "../../src/github.ts";

export type Appel = { methode: string; chemin: string; statut: number };

type IssueFausse = { number: number; title: string; body: string; labels: string[]; state: "open" | "closed"; created_at: string; updated_at: string };
type CommentaireFaux = { id: number; body: string; author_association: string; user: { login: string }; created_at: string };
type EvenementFaux = { event: string; created_at: string; label?: { name: string }; commit_id?: string };
type PRFausse = { number: number; head: string; sha: string; base: string; title: string; body: string; state: "open" | "closed"; merged: boolean; merged_by: string | null; updated_at: string; fichiers: string[] };

export class FauxGitHub {
  readonly appels: Appel[] = [];
  private issues = new Map<number, IssueFausse>();
  private commentaires = new Map<number, CommentaireFaux[]>();
  private evenements = new Map<number, EvenementFaux[]>();
  private prs: PRFausse[] = [];
  // La protection de la base : un merge n'y passe que sur une tête dont la CI
  // est verte. Sans elle, GitHub merge quoi que dise la CI.
  protection = false;
  // Les têtes dont la CI est verte ; les autres tournent encore.
  private vertes = new Set<string>();
  private horloge = Date.UTC(2026, 10, 3);
  private suivant = 1;

  readonly depot: string;
  // Celui qui agit : l'auteur des commentaires et du merge.
  private readonly login: string;

  constructor(depot: string, login = "box") {
    this.depot = depot;
    this.login = login;
  }

  // Les appels que GitHub compte : tous sauf les 304.
  comptes(depuis = 0): Appel[] {
    return this.appels.slice(depuis).filter((appel) => appel.statut !== 304);
  }

  feu(number: number, labels: string[], title = `ticket ${number}`, body = `the body of ${number}`): void {
    const instant = this.instant();
    this.issues.set(number, { number, title, body, labels: [...labels], state: "open", created_at: instant, updated_at: instant });
    this.suivant = Math.max(this.suivant, number + 1);
  }

  issue(number: number): IssueFausse {
    const issue = this.issues.get(number);
    if (issue === undefined) throw new Error(`#${number} inconnu`);
    return issue;
  }

  prDe(issue: number): PRFausse | undefined {
    return this.prs.findLast((pr) => pr.head === `cook/${issue}-github`);
  }

  // La PR qu'une station a ouverte pour le ticket, et les fichiers qu'elle change.
  livrer(issue: number, fichiers = ["a.ts"]): PRFausse {
    const head = `cook/${issue}-github`;
    const pr: PRFausse = { number: this.suivant++, head, sha: createHash("sha1").update(head).digest("hex"), base: "main", title: `#${issue}`, body: `Closes #${issue}`, state: "open", merged: false, merged_by: null, updated_at: this.instant(), fichiers: [...fichiers] };
    this.prs.push(pr);
    return pr;
  }

  // La CI de cette tête finit verte.
  ciVerte(sha: string): void {
    this.vertes.add(sha);
  }

  private bloquee(pr: PRFausse): boolean {
    return this.protection && !this.vertes.has(pr.sha);
  }

  // Ce que le chef ou une autre station ferait sur l'issue.
  commenterCommeLeDepot(numero: number, body: string): void {
    this.poster(numero, body);
  }

  readonly transport: Transport = async (args) => {
    // Rend la main avant de répondre, comme un vrai appel.
    await new Promise((suite) => setImmediate(suite));
    const { methode, chemin, champs, entetes } = lire(args);
    const reponse = this.repondre(methode, chemin, champs, entetes);
    this.appels.push({ methode, chemin, statut: reponse.statut });
    const lignes = [`HTTP/2.0 ${reponse.statut} ${reponse.statut === 304 ? "Not Modified" : "OK"}`, ...(reponse.etag ? [`Etag: ${reponse.etag}`] : [])];
    const stdout = `${lignes.join("\r\n")}\r\n\r\n${reponse.corps}`;
    return { erreur: reponse.statut >= 300 ? new Error(`HTTP ${reponse.statut}`) : null, stdout, stderr: "" };
  };

  private instant(): string {
    this.horloge += 1000;
    return new Date(this.horloge).toISOString();
  }

  private toucher(numero: number): void {
    const issue = this.issues.get(numero);
    if (issue) issue.updated_at = this.instant();
    const pr = this.prs.find((p) => p.number === numero);
    if (pr) pr.updated_at = this.instant();
  }

  private poster(numero: number, body: string): CommentaireFaux {
    const commentaire = { id: this.suivant++, body, author_association: "OWNER", user: { login: this.login }, created_at: this.instant() };
    this.commentaires.set(numero, [...(this.commentaires.get(numero) ?? []), commentaire]);
    this.toucher(numero);
    return commentaire;
  }

  private repondre(methode: string, chemin: string, champs: Array<[string, string]>, entetes: Map<string, string>): { statut: number; etag?: string; corps: string } {
    const prefixe = `repos/${this.depot}/`;
    if (!chemin.startsWith(prefixe)) return { statut: 404, corps: "{}" };
    const [route = "", requete = ""] = chemin.slice(prefixe.length).split("?");
    const params = new URLSearchParams(requete);
    const champ = (nom: string) => champs.find(([cle]) => cle === nom)?.[1] ?? "";
    const lu = (corps: unknown) => {
      const texte = typeof corps === "string" ? corps : JSON.stringify(corps);
      const etag = `"${createHash("sha1").update(texte).digest("hex")}"`;
      return entetes.get("if-none-match") === etag ? { statut: 304, etag, corps: "" } : { statut: 200, etag, corps: texte };
    };
    const segments = route.split("/");
    if (methode === "GET" && route === "issues") {
      const label = params.get("labels");
      const ouvertes = [...this.issues.values()].filter((issue) => issue.state === "open" && (label === null || issue.labels.includes(label)));
      return lu(ouvertes.map((issue) => this.issueBrute(issue)));
    }
    if (segments[0] === "commits" && segments[2] === "check-runs") return lu({ check_runs: [{ name: "tests", status: "completed", conclusion: "success", html_url: null }] });
    if (segments[0] === "commits" && segments[2] === "status") return lu({ statuses: [] });
    if (segments[0] === "issues" && segments.length >= 2) {
      const numero = Number(segments[1]);
      const sous = segments[2];
      if (sous === undefined && methode === "GET") {
        const issue = this.issues.get(numero);
        return issue ? lu(this.issueBrute(issue)) : { statut: 404, corps: "{}" };
      }
      if (sous === "comments" && methode === "GET") return lu(this.commentaires.get(numero) ?? []);
      if (sous === "comments" && methode === "POST") return { statut: 201, corps: JSON.stringify(this.poster(numero, champ("body"))) };
      if (sous === "events" && methode === "GET") return lu(this.evenements.get(numero) ?? []);
      if (sous === "labels" && methode === "POST") {
        const issue = this.issue(numero);
        issue.labels = [...new Set([...issue.labels, ...champs.filter(([cle]) => cle === "labels[]").map(([, valeur]) => valeur)])];
        this.toucher(numero);
        return { statut: 200, corps: JSON.stringify(issue.labels.map((name) => ({ name }))) };
      }
      if (sous === "labels" && methode === "DELETE") {
        const issue = this.issue(numero);
        const label = decodeURIComponent(segments[3] ?? "");
        if (!issue.labels.includes(label)) return { statut: 404, corps: "{}" };
        issue.labels = issue.labels.filter((autre) => autre !== label);
        this.evenements.set(numero, [...(this.evenements.get(numero) ?? []), { event: "unlabeled", label: { name: label }, created_at: this.instant() }]);
        this.toucher(numero);
        return { statut: 200, corps: "[]" };
      }
    }
    if (segments[0] === "issues" && segments.length === 2 && methode === "PATCH") {
      const issue = this.issues.get(Number(segments[1]));
      if (issue === undefined) return { statut: 404, corps: "{}" };
      if (champ("state") === "closed") issue.state = "closed";
      this.toucher(issue.number);
      return lu(this.issueBrute(issue));
    }
    if (route === "pulls" && methode === "POST") {
      const pr = this.livrer(Number(/^cook\/(\d+)-github$/.exec(champ("head"))?.[1]));
      Object.assign(pr, { head: champ("head"), base: champ("base"), title: champ("title"), body: champ("body") });
      return { statut: 201, corps: JSON.stringify({ number: pr.number, html_url: `https://github.com/${this.depot}/pull/${pr.number}` }) };
    }
    if (route === "pulls" && methode === "GET") {
      // Les PR d'une branche, ou les PR ouvertes.
      const tete = params.has("head") ? (params.get("head") ?? "").split(":")[1] : null;
      const lues = this.prs.filter((pr) => (tete === null ? params.get("state") !== "open" || pr.state === "open" : pr.head === tete));
      // Comme GitHub, la liste ne dit pas si la PR est mergeable : seule sa fiche le dit.
      return lu(lues.reverse().slice(0, Number(params.get("per_page") ?? 30)).map((pr) => ({ ...this.prBrute(pr), mergeable_state: undefined })));
    }
    if (segments[0] === "pulls" && segments.length >= 2) {
      const pr = this.prs.find((p) => p.number === Number(segments[1]));
      if (pr === undefined) return { statut: 404, corps: "{}" };
      if (segments[2] === undefined && methode === "GET") return lu(this.prBrute(pr));
      if (segments[2] === "files" && methode === "GET") return lu(pr.fichiers.map((filename) => ({ filename })));
      if (segments[2] === "merge" && methode === "PUT") {
        if (pr.state !== "open" || champ("sha") !== pr.sha) return { statut: 409, corps: JSON.stringify({ message: "Head branch was modified" }) };
        if (this.bloquee(pr)) return { statut: 405, corps: JSON.stringify({ message: 'Required status check "tests" is expected.' }) };
        Object.assign(pr, { state: "closed", merged: true, merged_by: this.login });
        this.toucher(pr.number);
        // `Closes #n` : GitHub ferme l'issue, et l'événement porte le commit du merge.
        const fermee = Number(/Closes #(\d+)/.exec(pr.body)?.[1]);
        const issue = this.issues.get(fermee);
        if (issue) {
          issue.state = "closed";
          this.evenements.set(fermee, [...(this.evenements.get(fermee) ?? []), { event: "closed", commit_id: pr.sha, created_at: this.instant() }]);
          this.toucher(fermee);
        }
        return { statut: 200, corps: JSON.stringify({ merged: true }) };
      }
    }
    throw new Error(`le faux GitHub ne sait pas répondre à ${methode} ${chemin}`);
  }

  private issueBrute(issue: IssueFausse) {
    return { ...issue, labels: issue.labels.map((name) => ({ name })), html_url: `https://github.com/${this.depot}/issues/${issue.number}`, author_association: "OWNER", user: { login: "chef" } };
  }

  private prBrute(pr: PRFausse) {
    return {
      number: pr.number,
      html_url: `https://github.com/${this.depot}/pull/${pr.number}`,
      state: pr.state,
      merged: pr.merged,
      merged_at: pr.merged ? pr.updated_at : null,
      mergeable_state: pr.state !== "open" || !this.bloquee(pr) ? "clean" : "blocked",
      base: { ref: pr.base },
      head: { ref: pr.head, sha: pr.sha },
      merged_by: pr.merged_by === null ? null : { login: pr.merged_by },
      updated_at: pr.updated_at,
    };
  }
}

// Les arguments de `gh api -i` : la méthode, les en-têtes, les champs, puis le chemin.
function lire(args: string[]): { methode: string; chemin: string; champs: Array<[string, string]>; entetes: Map<string, string> } {
  let methode: string | null = null;
  const champs: Array<[string, string]> = [];
  const entetes = new Map<string, string>();
  for (let i = 0; i < args.length - 1; i += 1) {
    const arg = args[i];
    const valeur = args[i + 1] ?? "";
    if (arg === "-X" || arg === "--method") methode = valeur.toUpperCase();
    else if (arg === "-H") {
      const separateur = valeur.indexOf(":");
      entetes.set(valeur.slice(0, separateur).trim().toLowerCase(), valeur.slice(separateur + 1).trim());
    } else if (arg === "-f" || arg === "-F") {
      const egal = valeur.indexOf("=");
      champs.push([valeur.slice(0, egal), valeur.slice(egal + 1)]);
    } else continue;
    i += 1;
  }
  return { methode: methode ?? (champs.length > 0 ? "POST" : "GET"), chemin: args.at(-1) ?? "", champs, entetes };
}
