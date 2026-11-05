// Un cook sans accès à GitHub (#2183) : dans le bac à sable d'une cuisine
// locale, son `gh` n'a aucun identifiant — le bac à sable refuse de lire
// `~/.config/gh` et le trousseau —, et `gh issue view` lui est refusé. La
// station du chemin GitHub seul lui remet donc son ticket dans sa consigne,
// pousse sa branche et ouvre sa PR pour lui, et rien de ce qui ferait parler
// son `gh` au nom du chef n'entre dans son environnement.
//
// Le cook est simulé (`Lancer`), GitHub aussi : un client en mémoire pour le
// tour, et, pour la PR, le vrai client sur un faux `gh` et de fausses Apps.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { test, type TestContext } from "node:test";
import { LECTURES_INTERDITES } from "../../src/bac-a-sable/configuration.ts";
import { borner, DERNIERS_COMMENTAIRES, environnementHorsGitHub, OCTETS_DU_CORPS, ticketJoint } from "../../src/bac-a-sable/hors-github.ts";
import type { BacASableLocal } from "../../src/bac-a-sable/local.ts";
import { stationDuDepot, type Lancer } from "../../src/brigade-github.ts";
import { corpsDePrise, corpsDeLacher } from "../../src/github-etat/prise.ts";
import type { Commentaire, GitHub } from "../../src/github.ts";
import { configIdentites, ouvrirGitHubs, ouvrirIdentites, VARIABLES_GITHUB } from "../../src/identites.ts";
import { fauxGitHubApps } from "../aides/faux-github-apps.ts";
import { DEPOT, fauxGh, issueGitHub } from "../outils.ts";

const HOME = "/Users/chef";
// Le bac à sable de la cuisine locale du Mac du chef.
const BAC: BacASableLocal = { version: "2.1.300", home: HOME, caches: [], hotes: () => [] };
// Ses worktrees, comme le Mac les voit : le bac à sable n'y prend que des
// chemins POSIX, et le cook simulé n'en ouvre aucun — sous Windows, ceux du
// répertoire temporaire ne seraient pas des chemins absolus du Mac.
const WORKTREES = `${HOME}/brigade-wt`;
// L'environnement du runtime sur ce Mac : les jetons du chef, et le
// répertoire de sa connexion `gh`.
const JETON_DU_CHEF = "gho_jetonDuChefQuiNeDoitPasSortir0001";
const ENV_DU_CHEF = { PATH: "/usr/bin:/bin", HOME, GH_TOKEN: JETON_DU_CHEF, GITHUB_TOKEN: JETON_DU_CHEF, GH_CONFIG_DIR: `${HOME}/.config/gh` };

const NUMERO = 2183;
const CORPS = "## Contexte\n\nLe cook ne lit pas son ticket : `gh issue view` lui est refusé dans le bac à sable.";
const FICHE = "<!-- brigade:fiche -->\n- attend : rien\n- zone : runtime/src/bac-a-sable/, runtime/test/bac-a-sable/";
const commentaire = (body: string, rang: number): Commentaire => ({ body, author: "benomite", association: "OWNER", createdAt: new Date(Date.UTC(2026, 10, 4, 10, rang)).toISOString() });
// La fiche, posée la première, puis des prises et des lâchers de station et
// plus de commentaires qu'il n'en est remis : le dernier est celui du chef.
const COMMENTAIRES: Commentaire[] = [
  FICHE,
  corpsDePrise("box/claude"),
  ...Array.from({ length: DERNIERS_COMMENTAIRES + 2 }, (_, rang) => `Remarque ${rang + 1} sur le ticket.`),
  corpsDeLacher("box/claude"),
  "Le dernier mot du chef : garde les règles du bac à sable telles quelles.",
].map(commentaire);

// Le flux d'un cook qui conclut.
const fluxQuiConclut = `${JSON.stringify({ type: "result", is_error: false, result: "done" })}\n`;

type Lance = { args: string[]; env: NodeJS.ProcessEnv };

// Une station du chemin GitHub seul, sur le Mac du chef, avec un ticket à
// prendre. `github` remplace ce que le client en mémoire fait du ticket et de
// la PR.
function cuisine(t: TestContext, github: Partial<Pick<GitHub, "issue" | "commentaires" | "ouvrirPR">> = {}) {
  const repertoire = mkdtempSync(join(tmpdir(), "brigade-hors-github-"));
  t.after(() => rmSync(repertoire, { recursive: true, force: true }));
  const lances: Lance[] = [];
  const fait: string[] = [];
  const lancer: Lancer = ({ args, env, flux }) => {
    lances.push({ args, env });
    writeFileSync(flux, fluxQuiConclut);
    return { fin: Promise.resolve({ code: 0, signal: null, turns: 1, tokens: 1, durationMs: 1, arret: null, erreur: null }) };
  };
  const client: Partial<GitHub> = {
    tickets: async () => ({ inchange: false, issues: [{ ...issueGitHub(NUMERO), number: NUMERO, title: "Let sandboxed cooks read their ticket", labels: ["fire", "model:opus", "effort:high"], state: "open", createdAt: "", updatedAt: "", url: "" }], confirmer: () => {} }) as never,
    prDeBranche: async () => null,
    ci: async () => [{ name: "tests", conclusion: "success", outcome: "green", url: null }] as never,
    issue: async (numero) => ({ number: numero, title: "Let sandboxed cooks read their ticket", labels: [], state: "open", createdAt: "", updatedAt: "", url: "", body: CORPS }),
    commentaires: async () => COMMENTAIRES,
    commenter: async (numero, corps) => void fait.push(`commenter #${numero} ${corps}`),
    labelliser: async (numero, labels) => void fait.push(`labelliser #${numero} ${labels.join(",")}`),
    delabelliser: async (numero, label) => void fait.push(`delabelliser #${numero} ${label}`),
    ouvrirPR: async (pr) => {
      fait.push(`ouvrirPR ${pr.branche}`);
      return "https://github.com/acme/brigade/pull/1";
    },
    mettreAJour: async () => {},
    merger: async () => ({ merged: true }) as never,
    retraitsDeLabels: async () => [],
    prsOuvertes: async () => [],
    ...github,
  };
  const station = stationDuDepot({
    nom: "macbook/claude",
    places: 1,
    base: "main",
    depotGitHub: DEPOT,
    github: client as GitHub,
    depot: {
      preparer: async (run) => ({ worktree: posix.join(WORKTREES, run), branche: `cook/${run}` }),
      reprendre: async (run) => posix.join(WORKTREES, run),
      connait: () => false,
      retirer: () => {},
      ranger: async () => null,
      pousser: (branche) => void fait.push(`pousser ${branche}`),
      commits: () => 1,
      changes: () => [],
      diff: () => "",
      tete: () => "a".repeat(40),
    },
    prise: () => ({ prendre: async () => ({ prise: true }), lacher: async () => true }),
    claude: "claude",
    env: ENV_DU_CHEF,
    cloison: null,
    bacASable: BAC,
    plafonds: { durationMs: 60_000, tokens: 1_000, idleMs: 60_000 },
    graceMs: 1,
    reviewer: { model: "sonnet", effort: "medium" },
    flux: repertoire,
    lancer,
    avertir: (texte) => assert.fail(texte),
  });
  assert.ok(!("refus" in station), "refus" in station ? station.refus : "");
  const servir = async () => {
    if ("refus" in station) return;
    await station.tour();
    await station.calme();
  };
  return { servir, lances, fait };
}

const consigneDe = (lance: Lance) => lance.args[lance.args.indexOf("-p") + 1] ?? "";
const reglagesDe = (lance: Lance) => JSON.parse(lance.args[lance.args.indexOf("--settings") + 1] ?? "{}");

test("in the sandbox, without the chef's gh config, the cook's prompt carries its ticket: body, zone and last comments", async (t) => {
  const { servir, lances } = await cuisine(t);
  await servir();

  assert.equal(lances.length, 1);
  const [cook] = lances;
  assert.ok(cook);
  // Le bac à sable est posé, et ses lectures interdites aussi : `gh` n'y
  // trouverait pas la connexion du chef.
  const reglages = reglagesDe(cook);
  assert.ok(reglages.sandbox.filesystem.denyRead.includes(`${HOME}/.config/gh`));
  assert.ok(reglages.sandbox.filesystem.denyRead.includes(`${HOME}/Library/Keychains`));
  assert.ok(reglages.permissions.deny.includes(`Read(/${HOME}/.config/gh)`));
  assert.equal(cook.env.GH_CONFIG_DIR, undefined);

  const texte = consigneDe(cook);
  assert.ok(texte.includes(CORPS), texte);
  assert.ok(texte.includes("**Zone** (fiche du ticket) : runtime/src/bac-a-sable/, runtime/test/bac-a-sable/"), texte);
  assert.ok(texte.includes(FICHE), "la fiche est remise, même plus ancienne que les derniers commentaires");
  assert.ok(texte.includes("Le dernier mot du chef : garde les règles du bac à sable telles quelles."), texte);
  assert.ok(texte.includes(`Remarque ${DERNIERS_COMMENTAIRES + 2} sur le ticket.`), texte);
  // Les marques de prise ne sont pas pour le cook, et les plus vieux
  // commentaires ne sont pas remis.
  assert.ok(!texte.includes("brigade:prise") && !texte.includes("brigade:lache"), texte);
  assert.ok(!texte.includes("Remarque 1 sur le ticket."), texte);
  // Il n'est plus envoyé vers `gh`, et sait pourquoi.
  assert.ok(!texte.includes(`gh issue view ${NUMERO} --repo`), texte);
  assert.match(texte, /1\. Lis le ticket en entier : ci-dessus, entre `<ticket>` et `<\/ticket>`/);
  assert.ok(texte.indexOf("</ticket>") < texte.indexOf("1. Lis le ticket en entier"));
});

test("in the sandbox, the cook's environment carries no GitHub credential, and the station pushes its branch and opens its PR under the cook App's identity", async (t) => {
  // De vraies identités, sur de fausses Apps et un faux `gh` : la PR part par
  // le client que la cuisine donne à la station GitHub seul (`githubs.pass`).
  const apps = await fauxGitHubApps(t);
  const config = configIdentites({ BRIGADE_GITHUB_APPS_DIR: apps.repertoire, BRIGADE_GITHUB_API_URL: apps.url });
  assert.ok(config);
  const identites = ouvrirIdentites({ ...config, depot: DEPOT });
  t.after(() => identites.fermer());
  const gh = fauxGh(t);
  gh.repondre(`repos/${DEPOT}/pulls`, { statut: 201, corps: { html_url: `https://github.com/${DEPOT}/pull/40` } });
  const githubs = ouvrirGitHubs({ depot: DEPOT, bin: gh.bin, identites });
  t.after(() => githubs.fermer());
  const { servir, lances, fait } = cuisine(t, { ouvrirPR: githubs.pass.ouvrirPR });
  await servir();

  const [cook] = lances;
  assert.ok(cook);
  for (const nom of [...VARIABLES_GITHUB, "GH_CONFIG_DIR"]) assert.equal(cook.env[nom], undefined, nom);
  // Aucun jeton — ni celui du chef, ni celui d'une App — dans son
  // environnement ni dans ses arguments.
  const tout = JSON.stringify({ env: cook.env, args: cook.args });
  assert.ok(!tout.includes(JETON_DU_CHEF));
  assert.ok(!/gh[opsu]_/.test(tout), "aucun jeton GitHub ne passe au cook");

  // La station pousse sa branche, puis ouvre sa PR — sous l'identité cook.
  assert.deepEqual(fait.slice(0, 1), [`pousser cook/${NUMERO}-github`]);
  assert.ok(fait.includes(`labelliser #${NUMERO} in-pass`), fait.join("\n"));
  const pulls = gh.appels().findIndex((args) => args.some((arg) => arg.endsWith(`repos/${DEPOT}/pulls`)));
  assert.notEqual(pulls, -1, JSON.stringify(gh.appels()));
  assert.match(gh.jetons()[pulls] ?? "", /^ghs_cook_/);
});

test("the forbidden reads still hold the chef's gh config and keychain, and the cook's environment loses every chef credential", () => {
  assert.ok(LECTURES_INTERDITES.includes(".config/gh"));
  assert.ok(LECTURES_INTERDITES.includes("Library/Keychains"));

  const dans = environnementHorsGitHub({ ...ENV_DU_CHEF, GH_ENTERPRISE_TOKEN: "x", GITHUB_ENTERPRISE_TOKEN: "y" }, { bacASable: true });
  assert.deepEqual(dans, { PATH: "/usr/bin:/bin", HOME });
  // Hors du bac à sable, le répertoire vide d'une identité par rôle reste :
  // sans lui, `gh` trouverait la connexion du compte du runtime.
  const hors = environnementHorsGitHub({ ...ENV_DU_CHEF, GH_CONFIG_DIR: "/etat/gh-sans-compte" }, { bacASable: false });
  assert.deepEqual(hors, { PATH: "/usr/bin:/bin", HOME, GH_CONFIG_DIR: "/etat/gh-sans-compte" });
});

test("a ticket GitHub will not give launches no cook: the station says why on the issue and releases it", async (t) => {
  // Ses commentaires, que seule la remise du ticket au cook lit : le tour lit
  // déjà le corps de l'issue, pour sa zone, avant de prendre le ticket.
  const { servir, lances, fait } = cuisine(t, {
    commentaires: async () => {
      throw new Error("HTTP 502");
    },
  });
  await servir();

  assert.equal(lances.length, 0);
  assert.ok(fait.some((ligne) => ligne.startsWith(`commenter #${NUMERO} `) && ligne.includes("Station `macbook/claude`: the cook stopped without a delivery — its ticket could not be read on GitHub: HTTP 502")), fait.join("\n"));
});

test("the ticket handed in the prompt is bounded: a long body and long comments are cut, and say so", () => {
  const long = "é".repeat(OCTETS_DU_CORPS);
  const texte = ticketJoint({ number: 1, title: "t", body: long, commentaires: [] });
  assert.ok(Buffer.byteLength(texte, "utf8") < OCTETS_DU_CORPS + 500);
  assert.match(texte, /\[… coupé : \d+ octets de plus sur l'issue\]/);
  assert.match(texte, /\*\*Zone\*\* \(fiche du ticket\) : aucune fiche/);
  assert.match(texte, /\*\*Commentaires\*\* : aucun/);
  // Un caractère n'est jamais coupé en deux.
  assert.ok(!borner("aé", 2).includes("�"));
  assert.equal(borner("court", 100), "court");
});
