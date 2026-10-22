#!/usr/bin/env node
// Doublure de `gh` pour une station à qui l'app ajoute un projet, sans réseau :
// `gh repo clone <owner>/<repo> <dossier>` (ou son adresse HTTPS) clone
// l'origine nue `$FAUX_ORIGINES/<owner>/<repo>.git` ; `gh api user`, `gh auth
// token` et `gh api users/<owner>` disent le compte, le jeton et le
// propriétaire, comme après un clone en échec ; les issues du dépôt sont notées dans
// `$FAUX_GISTS/issues` ; tout le reste — les gists du compte —
// va à la doublure des gists (../appairage/faux-gh-gists.ts). Un clone est
// noté dans `$FAUX_GISTS/clones`, une ligne chacun ; `$FAUX_CLONE_ERREURS`
// posé, il échoue en l'écrivant sur sa sortie d'erreur, comme gh et git le
// diraient — réseau coupé, accès refusé. Demandé avec `--progress`, git écrit
// sa progression, comme sous le vrai gh — par son transport, qu'un clone
// local ne prend pas.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "repo" && args[1] === "clone") {
  // Le dépôt se nomme `<owner>/<repo>` ou par son adresse HTTPS : nommé par
  // elle, un dépôt absent échoue comme le vrai gh, git d'abord, gh ensuite.
  const [nomme = "", dossier = ""] = args.slice(2);
  const adresse = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(\.git)?$/.exec(nomme);
  const depot = adresse?.[1] ?? nomme;
  const origine = join(process.env.FAUX_ORIGINES ?? "", `${depot}.git`);
  appendFileSync(join(process.env.FAUX_GISTS ?? "", "clones"), `${depot} ${dossier}\n`);
  // Le dépôt tel que gh l'a reçu.
  appendFileSync(join(process.env.FAUX_GISTS ?? "", "clones-nommes"), `${nomme}\n`);
  if (process.env.FAUX_CLONE_ERREURS) {
    process.stderr.write(`${process.env.FAUX_CLONE_ERREURS}\n`);
    process.exit(1);
  }
  if (!existsSync(origine)) {
    if (adresse === null) process.stderr.write(`GraphQL: Could not resolve to a Repository with the name '${depot}'. (repository)\n`);
    else process.stderr.write(`remote: Repository not found.\nfatal: repository '${nomme}/' not found\nfailed to run git: exit status 128\n`);
    process.exit(1);
  }
  execFileSync("git", ["clone", ...(args.includes("--progress") ? ["--progress", "--no-local"] : ["-q"]), origine, dossier], { stdio: "inherit" });
} else if (args[0] === "api" && args[1] === "user") {
  // Le compte de la station : `$FAUX_COMPTE`, ou « brigade-box ».
  process.stdout.write(`${process.env.FAUX_COMPTE ?? "brigade-box"}\n`);
} else if (args[0] === "auth" && args[1] === "token") {
  // Son jeton : `$FAUX_JETON`, ou un jeton OAuth de gh.
  process.stdout.write(`${process.env.FAUX_JETON ?? "gho_faux"}\n`);
} else if (args[0] === "api" && /^users\/[^/]+$/.test(args[1] ?? "")) {
  // Un propriétaire existe s'il a un dossier dans `$FAUX_ORIGINES`.
  if (!existsSync(join(process.env.FAUX_ORIGINES ?? "", (args[1] ?? "").slice("users/".length)))) {
    process.stderr.write("gh: Not Found (HTTP 404)\n");
    process.exit(1);
  }
} else if (args[0] === "api" && args.some((arg) => /^repos\/[^/]+\/[^/]+\/issues(\?|$)/.test(arg))) {
  // Les issues du dépôt : aucune à lister ; une créée est notée dans
  // `$FAUX_GISTS/issues`, une ligne JSON chacune, et reçoit le numéro suivant.
  const champs = args.flatMap((arg, rang) => (args[rang - 1] === "-f" ? [arg] : []));
  const champ = (nom: string) => champs.flatMap((brut) => (brut.startsWith(`${nom}=`) ? [brut.slice(nom.length + 1)] : []));
  const repondre = (statut: number, corps: unknown) => process.stdout.write(`HTTP/2.0 ${statut}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(corps)}\n`);
  if (args.includes("POST")) {
    const notees = join(process.env.FAUX_GISTS ?? "", "issues");
    const numero = (existsSync(notees) ? readFileSync(notees, "utf8").split("\n").filter(Boolean).length : 0) + 1;
    appendFileSync(notees, `${JSON.stringify({ number: numero, title: champ("title")[0], body: champ("body")[0], labels: champ("labels[]") })}\n`);
    repondre(201, { number: numero });
  } else repondre(200, []);
} else {
  const rendu = spawnSync(process.execPath, [join(import.meta.dirname, "../appairage/faux-gh-gists.ts"), ...args], { stdio: "inherit" });
  process.exit(rendu.status ?? 1);
}
