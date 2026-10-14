// Ce qu'engage l'allumage du manager, dit au geste « allumer » : l'avertissement
// de docs/runtime.md, et deux nombres — les issues ouvertes, et celles qui
// portent `blocked-on-human`. Les nombres lus ici sont écrits par la commande du
// runtime elle-même (runtime/src/manager-cli.ts, `backlog`), jouée dans ce
// process sur un backlog connu, dicté par un faux `gh` : la forme que l'app lit
// est tenue contre celle que le runtime écrit. Elle arrive par un faux `ssh`,
// écrit par chaque test. Et le geste est confirmé : sa confirmation dit
// l'avertissement et ces nombres (confirmation.ts), et rien ne part avant son
// « oui » — qui n'attend rien de cette lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { principal } from "../../runtime/src/manager-cli.ts";
import { ALLUMAGE, AVERTISSEMENT, backlogDe, COMMANDE, compter, GESTE } from "../src/allumage.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { ecrireGeste, GESTES, SANS_OUI } from "../src/gestes.ts";
import { GESTES_DU_MANAGER } from "../src/manager.ts";
import { ouvrirTerminaux } from "../src/terminaux.ts";

const RACINE = join(import.meta.dirname, "../..");
const doc = readFileSync(join(RACINE, "docs/runtime.md"), "utf8");
const PARADE = { nom: "parade", dossier: "/projets/parade", box: { hote: "box" } };
const SERVI = { nom: "parade", box: { hote: "box" } };
const DEPOT = "benomite/parade";
const OPTIONS = "-o BatchMode=yes -o ConnectTimeout=10";

// Une issue ouverte, telle que l'API de GitHub la rend dans sa liste.
const issue = (number: number, labels: string[], pr = false) => ({
  number,
  title: `Issue ${number}`,
  state: "open",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-08T09:00:00Z",
  html_url: `https://github.com/${DEPOT}/issues/${number}`,
  labels: labels.map((name) => ({ name })),
  ...(pr ? { pull_request: {} } : {}),
});

// Le backlog connu : sept issues ouvertes, dont trois portent `blocked-on-human` — et une PR,
// que l'API rend parmi elles et qui n'en est pas une.
const CONNU = [
  issue(10, []),
  issue(11, ["blocked-on-human"]),
  issue(12, ["fire", "model:haiku", "effort:low"]),
  issue(13, ["epic", "blocked-on-human"]),
  issue(14, ["question"]),
  issue(15, ["blocked-on-human"], true),
  issue(16, ["prio:1", "blocked-on-human"]),
  issue(17, ["hors-cuisine"]),
];

function repertoire(t: TestContext): string {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-allumage-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  return racine;
}

// `manager backlog`, jouée comme le geste de la box la joue, sur ce backlog : un faux `gh` rend
// la liste des issues ouvertes telle que `gh api -i` la rend. Sa sortie, telle quelle.
async function runtime(t: TestContext, backlog: readonly object[]): Promise<string> {
  const racine = repertoire(t);
  const gh = join(racine, "gh");
  writeFileSync(join(racine, "corps"), JSON.stringify(backlog));
  writeFileSync(gh, `#!/bin/sh\nprintf 'HTTP/2.0 200\\r\\nContent-Type: application/json\\r\\n\\r\\n'\ncat '${racine}/corps'\n`);
  chmodSync(gh, 0o755);
  const lignes: string[] = [];
  await principal({ args: ["backlog"], env: { BRIGADE_GITHUB_REPO: DEPOT, BRIGADE_GH_BIN: gh }, dire: (ligne) => void lignes.push(ligne), redire: (ligne) => assert.fail(ligne) });
  return `${lignes.join("\n")}\n`;
}

// Un faux `ssh` : un script sh, où `$D` est le répertoire du test. Il note ce qu'il reçoit.
function box(t: TestContext, corps: string) {
  const racine = repertoire(t);
  const ssh = join(racine, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nD='${racine}'\necho "$*" >>"$D/appels"\n${corps}\n`);
  chmodSync(ssh, 0o755);
  const appels = () => (existsSync(join(racine, "appels")) ? readFileSync(join(racine, "appels"), "utf8") : "");
  return { racine, reglages: { ssh, delaiMs: 60_000, connexionS: 10 }, appels };
}
// Ce que le faux ssh écrit, tel quel, sur sa sortie standard.
const dit = (texte: string) => `cat <<'FIN'\n${texte}FIN`;

describe("l'avertissement de l'allumage", () => {
  test("c'est celui de docs/runtime.md, « Le manager », mot pour mot — sans sa mise en gras", () => {
    const manager = doc.slice(doc.indexOf("\n## Le manager\n"), doc.indexOf("### Ce que le code tranche"));
    const aPlat = manager.replaceAll("**", "").replace(/\s+/g, " ");

    assert.ok(aPlat.includes(`⚠️ ${AVERTISSEMENT}`), `docs/runtime.md, « Le manager », ne porte plus cet avertissement : ${AVERTISSEMENT}`);
    assert.match(AVERTISSEMENT, /^Allumé, il juge tout le backlog ouvert, et ce qu'il juge exécutable part aussitôt en cuisine\./);
  });

  test("il se pose au geste « allumer » du socle, et à lui seul : éteindre n'engage rien, et ne se confirme pas", () => {
    assert.equal(GESTE, "manager-allumer");
    assert.equal(ALLUMAGE.geste, GESTE);
    assert.deepEqual(confirmationDe(GESTE, PARADE, { sans: "pas lus" }), {
      titre: "turn the manager on",
      prix: [AVERTISSEMENT],
      chiffrer: true,
      choix: [{ id: GESTE, libelle: "yes, turn the manager on", dit: "what it judges executable is taken up right away" }],
      renoncer: "no, leave it off",
    });
    assert.equal(confirmationDe("manager-eteindre", PARADE, { sans: "pas lus" }), undefined);
    assert.equal(GESTES.find(({ id }) => id === GESTE)?.commande, "manager allumer");
    assert.deepEqual(GESTES_DU_MANAGER.filter(({ id }) => id === ALLUMAGE.geste).map(({ libelle }) => libelle), ["on"]);
  });
});

describe("les deux nombres : `manager backlog`, lancée une fois sur la box du projet", () => {
  test("sur un backlog connu, ce sont les siens : sept issues ouvertes, dont trois `blocked-on-human` — la PR n'en est pas une", async (t) => {
    const sortie = await runtime(t, CONNU);
    const { reglages } = box(t, dit(sortie));

    const compte = await compter(reglages, SERVI);

    assert.deepEqual(backlogDe(sortie), { ouvertes: 7, retenues: 3 });
    assert.deepEqual({ ...compte, a: "" }, { projet: "parade", a: "", ouvertes: 7, retenues: 3, dit: "7 open issues on this project, of which 3 carry `blocked-on-human`" });
    assert.ok(!Number.isNaN(Date.parse(compte.a)));
  });

  test("une seule issue, aucune : les nombres sont lus quand même, et dits au singulier", async (t) => {
    const une = await runtime(t, [issue(11, ["blocked-on-human"])]);
    const aucune = await runtime(t, []);

    assert.deepEqual(backlogDe(une), { ouvertes: 1, retenues: 1 });
    assert.deepEqual(backlogDe(aucune), { ouvertes: 0, retenues: 0 });
    const compte = await compter(box(t, dit(une)).reglages, SERVI);
    assert.equal("dit" in compte && compte.dit, "1 open issue on this project, of which 1 carries `blocked-on-human`");
  });

  test("ce qui part est le geste de la box, comme la veille le lance — une commande que « Piloter » cite, et rien de plus", async (t) => {
    const { reglages, appels } = box(t, dit(await runtime(t, CONNU)));
    const piloter = doc.slice(doc.indexOf("### Piloter"), doc.indexOf("### Recette du chef"));

    await compter(reglages, { nom: "parade", box: { hote: "chef@box" } });

    assert.equal(COMMANDE, "manager backlog");
    assert.equal(appels(), `${OPTIONS} -- chef@box brigade parade manager backlog\n`);
    assert.ok(piloter.includes("`brigade <projet> manager [allumer \\| eteindre \\| rendre <n°> \\| backlog]`"), "docs/runtime.md, « Piloter », ne cite pas `manager backlog`");
    assert.ok(doc.includes("npm --prefix runtime run manager -- backlog"), "docs/runtime.md, « Le manager », ne cite pas `manager -- backlog`");
  });

  test("une sortie qui n'a pas la forme ne donne aucun nombre : ce n'est pas « aucune issue »", () => {
    assert.deepEqual(backlogDe(""), { informe: "it has no `backlog` line" });
    assert.deepEqual(backlogDe("manager               ÉTEINT — jamais allumé\n"), { informe: "it has no `backlog` line" });
    assert.deepEqual(backlogDe("backlog               beaucoup d'issues\n"), { informe: "its `backlog` line does not give the two numbers in the expected form: “backlog               beaucoup d'issues”" });
    assert.ok("informe" in backlogDe("backlog               2 issues ouvertes, dont 3 portent `blocked-on-human`\n"));
    assert.ok("informe" in backlogDe("backlog               2 issues ouvertes, dont 1 porte `blocked-on-human`\nbacklog               9 issues ouvertes, dont 1 porte `blocked-on-human`\n"));
    // Le mot au milieu d'une autre ligne n'est pas la ligne.
    assert.ok("informe" in backlogDe("  backlog               2 issues ouvertes, dont 1 porte `blocked-on-human`\n"));
  });

  test("la box répond autre chose que la ligne : les nombres ne sont pas lus, et ce qu'elle a rendu est gardé tel quel", async (t) => {
    const { reglages } = box(t, dit("Bienvenue sur la box.\n"));

    const compte = await compter(reglages, SERVI);

    assert.ok("sans" in compte);
    assert.equal(compte.sans, "the two numbers were not read in what the box returned: it has no `backlog` line. This is not “no issue”: look at the backlog yourself before saying yes");
    assert.equal(compte.obtenu, `$ ${reglages.ssh} ${OPTIONS} -- box brigade parade manager backlog\nBienvenue sur la box.\n`);
  });

  test("un runtime d'avant cette lecture la refuse (code 2) : l'app le dit, et dit quoi faire", async (t) => {
    const { reglages } = box(t, `echo "brigade : usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run manager -- [allumer | eteindre | rendre <n° d'issue>]" >&2\nexit 2`);

    const compte = await compter(reglages, SERVI);

    assert.ok("sans" in compte);
    assert.match(compte.sans, /^the two numbers were not read : the box's runtime refused `manager backlog` \(code 2\) — if it is older than this app, it does not know this reading yet: update brigade on the box\. This is not “no issue”/);
    assert.match(compte.obtenu, /brigade : usage : .*\n→ exit code 2$/s);
  });

  test("la box n'a pas lu GitHub (code 1) : aucun nombre, et ce que le runtime en dit est gardé", async (t) => {
    const { reglages } = box(t, `echo "brigade : le backlog de ${DEPOT} n'a pas été lu : gh api repos/${DEPOT}/issues : gh: connexion impossible — ce n'est pas « aucune issue »" >&2\nexit 1`);

    const compte = await compter(reglages, SERVI);

    assert.ok("sans" in compte);
    assert.match(compte.sans, /^the two numbers were not read : the box answered, but `manager backlog` did not read GitHub \(code 1\)/);
    assert.match(compte.obtenu, /gh: connexion impossible/);
  });

  for (const [code, titre] of [
    [255, "NOT REACHED"],
    [65, "REACHED, BUT UNKNOWN TO THE BOX"],
    [68, "REACHED, BUT WITHOUT THE RIGHT TO THE ACTION"],
    [3, "REACHED, BUT `manager backlog` DID NOT ANSWER"],
  ] as const) {
    test(`le geste, ou \`ssh\`, sort en ${code} : « ${titre} », et aucun nombre`, async (t) => {
      const { reglages } = box(t, `echo "refus ${code}" >&2\nexit ${code}`);

      const compte = await compter(reglages, SERVI);

      assert.ok("sans" in compte);
      assert.ok(compte.sans.startsWith(`the two numbers were not read : ${titre} — what the app got is below. This is not “no issue”`), compte.sans);
      assert.match(compte.obtenu, new RegExp(`refus ${code}\\n\\n→ exit code ${code}$`));
    });
  }

  test("un `ssh` qui ne se lance pas : aucun nombre, et la box n'est pas dite jointe", async (t) => {
    const { racine, reglages } = box(t, "");

    const compte = await compter({ ...reglages, ssh: join(racine, "absent") }, SERVI);

    assert.ok("sans" in compte);
    assert.match(compte.sans, /^the two numbers were not read : NOT REACHED — /);
  });
});

describe("le geste « allumer », avec son avertissement", () => {
  test("sans son « oui », rien ne part ni ne s'écrit ; avec, il passe par le second — et n'attend rien de la box pour partir", async (t) => {
    // Une box qui ne répondrait jamais : le geste ne la joint pas, c'est la lecture des nombres qui le fait, à côté.
    const { appels } = box(t, "exit 255");
    const ecrits: string[][] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty() {
        const recus: string[] = [];
        ecrits.push(recus);
        return { ecrire: (donnees) => void recus.push(donnees), redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminaux.espace(PARADE);

    assert.deepEqual(ecrireGeste(terminaux, ALLUMAGE.geste, PARADE), { refus: SANS_OUI });
    assert.deepEqual(ecrits, [[]]);

    // Avec son « oui » : le second vient de démarrer, il n'est pas dit libre — rien n'est écrit, et aucun shell ne s'ouvre.
    const rendu = await ecrireGeste(terminaux, ALLUMAGE.geste, PARADE, undefined, true);
    assert.ok(rendu !== undefined && "refus" in rendu);
    assert.match(rendu.refus, /the command did not go, and nothing is written: `!ssh box brigade parade manager allumer`$/);
    assert.deepEqual(ecrits, [[]]);
    assert.equal(appels(), "");
  });

  test("ce que l'app en dit avant les nombres ne pose pas de question : la confirmation dit, le « oui » décide", () => {
    for (const texte of [AVERTISSEMENT, ALLUMAGE.enCours, ALLUMAGE.parti]) assert.doesNotMatch(texte, /\?|confirm/i, texte);
    assert.match(ALLUMAGE.parti, /before saying yes$/);
  });
});
