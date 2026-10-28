// Le tableau de la cuisine vu de GitHub : l'issue « Kitchen board » du dépôt du
// projet, retrouvée par son label, créée, rouverte, épinglée, son corps
// réécrit. Par `gh api`, comme github.ts et le canal du gist
// (appairage/canal.ts) : chaque appel prend le sien au compteur du quota réel
// (limite-github.ts) avant de partir, sous l'usage de la cuisine — un quota bas
// le retient, la limite de GitHub atteinte le suspend. Seul le repérage du
// tableau (`auLabel`, `issue`) est un geste : il ouvre la lecture des gestes du
// chef, que rien ne retient. Rien ici ne poste de
// commentaire : éditer un corps ne notifie personne.
import { decouper } from "../../github.ts";
import { masquerIdentifiants } from "../../identifiants.ts";
import { LECTURE_DU_TABLEAU } from "../budget/cout.ts";
import { COMPTE_DE_LA_MACHINE, constaterLimite, limiteDuProcess, noterLesEntetes, prendreUnAppel, refusPourLimite, type Limite, type ReponseHttp, type Usage } from "../../limite-github.ts";
import { execFile } from "../../sans-invite.ts";

// Une issue telle que le tableau la lit.
export type IssueDuTableau = { numero: number; ouverte: boolean; titre: string; corps: string; labels: string[] };

export type ClientDuTableau = {
  // Les issues du dépôt qui portent ce label, ouvertes ou fermées, PR écartées.
  auLabel(label: string): Promise<IssueDuTableau[]>;
  // L'issue, ou null si elle n'est plus dans ce dépôt : supprimée, ou transférée ailleurs.
  issue(numero: number): Promise<IssueDuTableau | null>;
  // Crée l'issue ; rend son numéro.
  creer(issue: { titre: string; corps: string; labels: string[] }): Promise<number>;
  // Remplace le corps de l'issue, et rien d'autre.
  ecrireCorps(numero: number, corps: string): Promise<void>;
  rouvrir(numero: number): Promise<void>;
  // Épingle l'issue au dépôt, si elle ne l'est pas déjà : rend vrai si elle vient de l'être.
  epingler(numero: number): Promise<boolean>;
};

export type OptionsClient = {
  // `<owner>/<repo>`
  depot: string;
  // Le binaire `gh`. Surchargé par les tests, jamais sur la box.
  bin?: string;
  delaiMs?: number;
  // Le jeton du rôle qui agit, demandé à chaque appel ; absent, `gh` s'authentifie seul.
  jeton?: () => Promise<string>;
  // Le compte dont ce client dépense le quota : par défaut, celui de la machine.
  compte?: string;
  // Le projet à qui l'on compte ses appels (`status`) ; à défaut, son dépôt.
  projet?: string;
  limite?: Limite;
  maintenant?: () => number;
};

type IssueBrute = {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  state?: unknown;
  labels?: Array<string | { name?: string }>;
  pull_request?: unknown;
  repository_url?: unknown;
};

// Ce qu'une réponse GraphQL porte : ses données, ou ses erreurs.
type ReponseGraphQL<D> = { data?: D; errors?: Array<{ message?: string }> };

const LIRE_EPINGLE = "query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { issue(number: $number) { id isPinned } } }";
const EPINGLER = "mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { isPinned } } }";

// `gh api -i` lancé sous un appel déjà pris au compteur (`prendreUnAppel`) : sa
// réponse HTTP, quel que soit son statut — aussi pour le client des gestes
// (gestes/client.ts). Ses entêtes sont notées au compte, un 304 lui rend
// l'appel, la limite de GitHub atteinte est constatée. `args` part déjà masqué ;
// `entree`, masquée ici.
export function lancerGhApi(
  appel: number,
  args: string[],
  entree: unknown,
  { bin, env, limite, compte, delaiMs, maintenant }: { bin: string; env: NodeJS.ProcessEnv | undefined; limite: Limite; compte: string; delaiMs?: number; maintenant?: () => number },
): Promise<ReponseHttp> {
  return new Promise((resoudre, rejeter) => {
    const enfant = execFile(
      bin,
      ["api", "-i", ...(entree === undefined ? [] : ["--input", "-"]), ...args],
      { maxBuffer: 16 * 1024 * 1024, timeout: delaiMs ?? 30_000, env },
      (erreur, stdout, stderr) => {
        const reponse = decouper(stdout);
        if (reponse) noterLesEntetes(limite, compte, reponse.entetes);
        if (reponse?.statut === 304) limite.rendre(appel);
        if (reponse && refusPourLimite(reponse)) constaterLimite(limite, reponse, { gh: bin, env, maintenant }).then(rejeter, rejeter);
        else if (reponse) resoudre(reponse);
        else rejeter(new Error(`gh api ${args.at(-1)} : ${stderr.trim() || erreur?.message || "réponse illisible"}`));
      },
    );
    // Un `gh` absent ferme son entrée avant qu'on y écrive : l'erreur est celle de son lancement.
    enfant.stdin?.on("error", () => {});
    enfant.stdin?.end(entree === undefined ? "" : masquerIdentifiants(JSON.stringify(entree)).texte);
  });
}

export function clientGitHubDuTableau(options: OptionsClient): ClientDuTableau {
  const { depot } = options;
  const bin = options.bin ?? "gh";
  const compte = options.compte ?? COMPTE_DE_LA_MACHINE;
  const [proprietaire = "", nom = ""] = depot.split("/");

  // Une réponse HTTP, quel que soit son statut — comme `appeler` de github.ts.
  // `entree` part sur l'entrée de `gh` (`--input -`) : un corps de 64 Ko ne
  // tient pas toujours sur une ligne de commande. Ce qui part est masqué.
  const appeler = async (brut: string[], entree?: unknown, usage: Usage = "cuisine"): Promise<ReponseHttp> => {
    const args = brut.map((arg) => masquerIdentifiants(arg).texte);
    const limite = options.limite ?? limiteDuProcess();
    let env: NodeJS.ProcessEnv | undefined;
    const environnement = async () => (env ??= options.jeton ? { ...process.env, GH_TOKEN: await options.jeton() } : undefined);
    const appel = await prendreUnAppel(limite, { usage, compte, etiquette: { projet: options.projet ?? (process.env.BRIGADE_PROJECT || depot), lecture: LECTURE_DU_TABLEAU }, gh: bin, env: environnement, maintenant: options.maintenant });
    await environnement();
    return lancerGhApi(appel, args, entree, { bin, env, limite, compte, delaiMs: options.delaiMs, maintenant: options.maintenant });
  };

  const exiger = (reponse: ReponseHttp, chemin: string, attendu = 200): ReponseHttp => {
    if (reponse.statut !== attendu) throw new Error(`gh api ${chemin} : HTTP ${reponse.statut}`);
    return reponse;
  };

  // Les lectures déjà faites, sous leur ETag : relues sous condition, elles ne
  // coûtent rien tant que rien n'a changé — GitHub répond 304, et ne compte pas
  // l'appel. Cache, pas état : le perdre coûte une lecture pleine.
  const lues = new Map<string, { etag: string; reponse: ReponseHttp }>();
  const lire = async (chemin: string, usage: Usage = "cuisine"): Promise<ReponseHttp> => {
    const gardee = lues.get(chemin);
    const reponse = await appeler([...(gardee === undefined ? [] : ["-H", `If-None-Match: ${gardee.etag}`]), chemin], undefined, usage);
    if (reponse.statut === 304 && gardee !== undefined) return gardee.reponse;
    const etag = reponse.entetes.get("etag");
    if (reponse.statut === 200 && etag) lues.set(chemin, { etag, reponse });
    else lues.delete(chemin);
    return reponse;
  };

  const lireIssue = (brute: IssueBrute): IssueDuTableau => ({
    numero: Number(brute.number),
    ouverte: brute.state === "open",
    titre: typeof brute.title === "string" ? brute.title : "",
    corps: typeof brute.body === "string" ? brute.body : "",
    labels: (brute.labels ?? []).map((label) => (typeof label === "string" ? label : (label.name ?? ""))),
  });
  // Une issue transférée se lit encore à son ancienne adresse : GitHub y renvoie,
  // et c'est son dépôt qui dit qu'elle n'est plus ici.
  const ici = (brute: IssueBrute) => typeof brute.repository_url !== "string" || brute.repository_url.toLowerCase().endsWith(`/repos/${depot.toLowerCase()}`);

  const graphql = async <D>(requete: string, variables: string[]): Promise<D> => {
    const reponse = exiger(await appeler(["-f", `query=${requete}`, ...variables, "graphql"]), "graphql");
    const lue = JSON.parse(reponse.corps) as ReponseGraphQL<D>;
    const [erreur] = lue.errors ?? [];
    if (erreur !== undefined || lue.data === undefined) throw new Error(`gh api graphql : ${erreur?.message ?? "réponse sans données"}`);
    return lue.data;
  };

  return {
    async auLabel(label) {
      // Un seul tableau par dépôt : une page suffit à le retrouver, même entouré d'anciens.
      const chemin = `repos/${depot}/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100`;
      const issues = JSON.parse(exiger(await lire(chemin, "geste"), chemin).corps) as IssueBrute[];
      return issues.filter((brute) => brute.pull_request === undefined).map(lireIssue);
    },
    async issue(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      const reponse = await lire(chemin, "geste");
      // 404 : supprimée ; 410 : supprimée, ou les issues du dépôt fermées ; 301 : transférée.
      if ([301, 404, 410].includes(reponse.statut)) return null;
      const brute = JSON.parse(exiger(reponse, chemin).corps) as IssueBrute;
      return brute.pull_request === undefined && ici(brute) ? lireIssue(brute) : null;
    },
    async creer({ titre, corps, labels }) {
      const chemin = `repos/${depot}/issues`;
      const reponse = exiger(await appeler(["-X", "POST", chemin], { title: titre, body: corps, labels }), chemin, 201);
      const numero = (JSON.parse(reponse.corps) as { number?: unknown }).number;
      if (!Number.isSafeInteger(numero)) throw new Error(`gh api ${chemin} : issue créée sans numéro`);
      return numero as number;
    },
    async ecrireCorps(numero, corps) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", chemin], { body: corps }), chemin);
    },
    async rouvrir(numero) {
      const chemin = `repos/${depot}/issues/${numero}`;
      exiger(await appeler(["-X", "PATCH", "-f", "state=open", chemin]), chemin);
    },
    async epingler(numero) {
      type Lue = { repository?: { issue?: { id?: string; isPinned?: boolean } | null } | null };
      const lue = await graphql<Lue>(LIRE_EPINGLE, ["-f", `owner=${proprietaire}`, "-f", `name=${nom}`, "-F", `number=${numero}`]);
      const issue = lue.repository?.issue;
      if (typeof issue?.id !== "string") throw new Error(`gh api graphql : l'issue #${numero} est introuvable dans ${depot}`);
      if (issue.isPinned === true) return false;
      await graphql(EPINGLER, ["-f", `id=${issue.id}`]);
      return true;
    },
  };
}
