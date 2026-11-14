// Ce qu'un cook peut faire par `gh` : le `gh` de la station agit en chef, et le
// cook ne doit l'employer que pour son ticket. Lire dans son dépôt passe ;
// écrire ne passe que sur son issue, sur la PR de sa branche, sur sa branche.
// Tout le reste est refusé, raison dite : un autre dépôt, l'administration et
// les réglages du dépôt, une suppression, l'issue, la PR ou la branche d'un
// autre ticket. Rien n'est demandé à GitHub : la décision se prend sur la
// commande seule.
//
// La PR du cook, la station l'ouvre : son numéro n'est pas connu d'avance. Une
// écriture sur une PR passe donc sans numéro — `gh` prend alors celle de la
// branche courante, celle du worktree — ou sous le nom de la branche du cook.

export type Ticket = { ticket: number; depot: string; branche: string };

const PREFIXE = "garde du cook — ";
const refus = (raison: string) => `${PREFIXE}${raison}`;

// Les sous-commandes de lecture, par commande ; ce qui n'y est pas écrit.
const LECTURES: Record<string, string[]> = {
  issue: ["view", "list", "status"],
  pr: ["view", "list", "status", "diff", "checks"],
  run: ["list", "view", "watch", "download"],
  workflow: ["list", "view"],
  release: ["list", "view", "download"],
  label: ["list"],
  cache: ["list"],
  ruleset: ["list", "view", "check"],
  repo: ["view"],
  auth: ["status"],
};
// Les écritures qu'un cook fait sur son issue ou sur sa PR.
const ECRITURES_DU_TICKET: Record<string, string[]> = {
  issue: ["comment", "edit", "close", "reopen"],
  pr: ["comment", "edit", "ready", "review", "close", "reopen", "create", "checkout", "update-branch"],
};
// Ce qui supprime, ou ce qui ne revient qu'à la station (seule la pass merge).
const SUPPRESSIONS: Record<string, string[]> = { issue: ["delete", "transfer"], pr: ["merge"] };
// Les commandes qui ne lisent ni n'écrivent rien sur GitHub.
const LOCALES = ["help", "version", "--version", "--help", "completion", "status", "search"];

// Les options de `gh` qui ne prennent pas de valeur : un mot qui suit une
// autre option est sa valeur, pas un argument.
const SANS_VALEUR = new Set([
  "-w", "--web", "-y", "--yes", "-d", "--draft", "--fill", "--fill-first", "--fill-verbose", "--approve", "--request-changes",
  "--edit-last", "--delete-last", "--create-if-none", "--auto", "--squash", "--rebase", "--merge", "--delete-branch", "--admin",
  "--disable-auto", "--force", "--detach", "--no-maintainer-edit", "--dry-run", "--paginate", "--slurp", "-i", "--include",
  "--silent", "--verbose", "--undo", "--remove-milestone", "--recover", "--comments", "--name-only", "--patch", "--color",
]);
// Selon la sous-commande, une même lettre ne prend pas de valeur.
const SANS_VALEUR_PAR_SOUS: Record<string, string[]> = { create: ["-f"], review: ["-a", "-r", "-c"], merge: ["-m", "-s", "-r", "-d"] };

type Lu = { positionnels: string[]; options: Map<string, string[]>; depots: string[] };

function lire(args: string[], sous: string | undefined): Lu {
  const positionnels: string[] = [];
  const options = new Map<string, string[]>();
  const depots: string[] = [];
  const noter = (nom: string, valeur: string) => {
    options.set(nom, [...(options.get(nom) ?? []), valeur]);
    if (nom === "-R" || nom === "--repo") depots.push(valeur);
  };
  const sansValeur = (nom: string) => SANS_VALEUR.has(nom) || (sous !== undefined && (SANS_VALEUR_PAR_SOUS[sous] ?? []).includes(nom));
  for (let i = 0; i < args.length; i += 1) {
    const mot = args[i] as string;
    if (mot === "--") {
      positionnels.push(...args.slice(i + 1));
      break;
    }
    const egal = /^(--[^=]+)=(.*)$/s.exec(mot);
    if (egal !== null) noter(egal[1] as string, egal[2] as string);
    else if (/^-R./.test(mot)) noter("-R", mot.slice(2));
    else if (mot.startsWith("-") && mot !== "-") {
      if (sansValeur(mot) || i + 1 >= args.length) noter(mot, "");
      else {
        noter(mot, args[i + 1] as string);
        i += 1;
      }
    } else positionnels.push(mot);
  }
  return { positionnels, options, depots };
}

const memeDepot = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Le dépôt qu'une URL de GitHub nomme, null si ce n'en est pas une.
const depotDeLUrl = (mot: string): string | null => /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+\/[^/\s#?]+)/i.exec(mot)?.[1]?.replace(/\.git$/, "") ?? null;
// Le numéro qu'un sélecteur d'issue ou de PR nomme : `12`, `#12`, une URL.
const numero = (mot: string): number | null => {
  const m = /^#?(\d+)$/.exec(mot) ?? /github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)/i.exec(mot);
  return m === null ? null : Number(m[1]);
};

export function jugerGh(args: string[], env: Record<string, string | undefined>, ticket: Ticket): string | null {
  if (args[0] === "--version" || args[0] === "--help") return null;
  const lu = lire(args, lire(args, undefined).positionnels[1]);
  const [commande, sousCommande] = lu.positionnels;
  // Le dépôt visé : `-R`, `GH_REPO`, une URL en argument — pas celle qu'un
  // texte cite. Aucun autre que celui du ticket.
  const autres = [...lu.depots, ...(env.GH_REPO ? [env.GH_REPO] : []), ...lu.positionnels.flatMap((mot) => depotDeLUrl(mot) ?? [])].filter((depot) => !memeDepot(depot.replace(/^(?:https?:\/\/)?github\.com\//i, ""), ticket.depot));
  if (autres.length > 0) return refus(`\`gh\` vise ${autres[0]}, un autre dépôt que celui de ton ticket (${ticket.depot}) : un cook n'agit que sur son dépôt.`);
  if (commande === undefined || LOCALES.includes(commande)) return null;
  if (commande === "api") return jugerApi(lu.positionnels.slice(1), lu.options, ticket);
  if (commande === "repo" && sousCommande === "view") {
    const vise = lu.positionnels[2];
    return vise === undefined || memeDepot(vise, ticket.depot) ? null : refus(`\`gh repo view ${vise}\` vise un autre dépôt que celui de ton ticket (${ticket.depot}).`);
  }
  if (sousCommande !== undefined && (LECTURES[commande] ?? []).includes(sousCommande)) return null;
  const ecrit = `\`gh ${commande}${sousCommande === undefined ? "" : ` ${sousCommande}`}\``;
  if (sousCommande !== undefined && (SUPPRESSIONS[commande] ?? []).includes(sousCommande)) return refus(`${ecrit} supprime ou merge : ni l'un ni l'autre n'est au cook — seule la pass merge, et rien ne se supprime.`);
  if (sousCommande === undefined || !(ECRITURES_DU_TICKET[commande] ?? []).includes(sousCommande)) {
    return refus(`${ecrit} n'est pas ouvert à un cook : il ne lit que son dépôt, et n'écrit que sur son issue (#${ticket.ticket}) et sur la PR de sa branche (${ticket.branche}) — ni administration, ni réglages du dépôt, ni suppression.`);
  }
  // Ce que la commande vise : les arguments après la sous-commande.
  const vises = lu.positionnels.slice(2);
  if (commande === "issue") {
    const autre = vises.find((mot) => numero(mot) !== ticket.ticket);
    if (vises.length === 0) return refus(`${ecrit} sans numéro : nomme ton issue, #${ticket.ticket}.`);
    return autre === undefined ? null : refus(`${ecrit} ${autre} vise l'issue d'un autre ticket : un cook n'écrit que sur la sienne, #${ticket.ticket}.`);
  }
  const tetes = [...(lu.options.get("--head") ?? []), ...(lu.options.get("-H") ?? [])].map((tete) => tete.replace(/^[^:]+:/, ""));
  const autreTete = tetes.find((tete) => tete !== ticket.branche);
  if (autreTete !== undefined) return refus(`${ecrit} --head ${autreTete} vise la branche d'un autre ticket : un cook n'écrit que sur la sienne, ${ticket.branche}.`);
  const autre = vises.find((mot) => mot !== ticket.branche);
  if (autre === undefined) return null;
  if (numero(autre) !== null) return refus(`${ecrit} ${autre} : la garde ne sait pas, sans GitHub, si cette PR est la tienne. Lance-la sans numéro depuis ton worktree — \`gh\` prend la PR de ta branche, ${ticket.branche} —, ou nomme ta branche.`);
  return refus(`${ecrit} ${autre} vise la PR d'une autre branche : un cook n'écrit que sur la sienne, ${ticket.branche}.`);
}

// Les chemins de l'API qui administrent le dépôt ou portent ses secrets :
// refusés à la lecture comme à l'écriture.
const ADMINISTRATION = /^(?:hooks|keys|collaborators|invitations|transfer|teams|environments|pages|rulesets|autolinks|interaction-limits|properties|traffic|vulnerability-alerts|automated-security-fixes|private-vulnerability-reporting|tags\/protection|branches\/[^/]+\/protection|actions\/(?:secrets|variables|permissions|runners|oidc)|(?:dependabot|codespaces)\/secrets)(?:\/|$)/;
// Hors d'un dépôt : ce qui administre un compte, une organisation, une app.
const ADMINISTRATION_HORS_DEPOT = /^(?:admin|enterprises|orgs|app|apps|applications|authorizations|installation|teams|marketplace_listing|user\/)/;

function jugerApi(positionnels: string[], options: Map<string, string[]>, ticket: Ticket): string | null {
  const brut = positionnels[0];
  if (brut === undefined) return null;
  const champs = [...(options.get("-f") ?? []), ...(options.get("-F") ?? []), ...(options.get("--field") ?? []), ...(options.get("--raw-field") ?? [])];
  const explicite = [...(options.get("-X") ?? []), ...(options.get("--method") ?? [])].at(-1)?.toUpperCase();
  const methode = explicite ?? (champs.length > 0 || options.has("--input") ? "POST" : "GET");
  const [proprietaire, nom] = ticket.depot.split("/");
  const chemin = brut
    .replace(/^https?:\/\/api\.github\.com/i, "")
    .replace(/^\/+/, "")
    .replace(/[?#].*$/, "")
    .replaceAll("{owner}", proprietaire ?? "")
    .replaceAll("{repo}", nom ?? "");
  const appel = `\`gh api ${methode === "GET" ? "" : `-X ${methode} `}${brut}\``;
  if (chemin === "graphql") {
    const requete = champs.find((champ) => champ.startsWith("query="))?.slice("query=".length);
    if (requete === undefined || requete.startsWith("@")) return refus(`${appel} : la garde ne lit pas la requête GraphQL — passe-la en clair (\`-f query='…'\`), ou emploie \`gh issue\` / \`gh pr\`.`);
    return /\bmutation\b/.test(requete) ? refus(`${appel} : une mutation GraphQL n'est pas ouverte à un cook — emploie \`gh issue comment\`, \`gh pr comment\`… sur ton ticket.`) : null;
  }
  if (methode === "DELETE") return refus(`${appel} supprime : un cook ne supprime rien sur GitHub.`);
  const depot = /^repos\/([^/]+\/[^/]+)(?:\/(.*))?$/.exec(chemin);
  if (depot === null) {
    if (ADMINISTRATION_HORS_DEPOT.test(chemin) || methode !== "GET") return refus(`${appel} sort de ton dépôt (${ticket.depot}) : un cook n'y lit ni n'y écrit rien d'autre.`);
    return null;
  }
  if (!memeDepot(depot[1] as string, ticket.depot)) return refus(`${appel} vise ${depot[1]}, un autre dépôt que celui de ton ticket (${ticket.depot}).`);
  const reste = (depot[2] ?? "").replace(/\/+$/, "");
  if (ADMINISTRATION.test(reste)) return refus(`${appel} touche à l'administration ou aux réglages du dépôt : jamais au cook.`);
  if (methode === "GET") return null;
  if (reste === "") return refus(`${appel} change les réglages du dépôt : jamais au cook.`);
  const issue = /^issues\/(\d+)(?:\/|$)/.exec(reste);
  if (issue !== null) return Number(issue[1]) === ticket.ticket ? null : refus(`${appel} écrit sur #${issue[1]}, l'issue d'un autre ticket : un cook n'écrit que sur la sienne, #${ticket.ticket}.`);
  const reference = /^git\/refs\/heads\/(.+)$/.exec(reste);
  const creee = reste === "git/refs" ? champs.find((champ) => champ.startsWith("ref="))?.slice("ref=refs/heads/".length) : undefined;
  const branche = reference?.[1] ?? creee;
  if (branche !== undefined) return branche === ticket.branche ? null : refus(`${appel} écrit sur la branche ${branche}, celle d'un autre ticket : un cook n'écrit que sur la sienne, ${ticket.branche}.`);
  if (reste === "pulls") {
    const tete = champs.find((champ) => champ.startsWith("head="))?.slice("head=".length).replace(/^[^:]+:/, "");
    return tete === ticket.branche ? null : refus(`${appel} ouvre une PR d'une autre branche que la tienne (${ticket.branche}).`);
  }
  return refus(`${appel} écrit hors de ton ticket : un cook n'écrit que sur son issue (#${ticket.ticket}) — sa PR, par \`gh pr …\` sans numéro depuis son worktree.`);
}
