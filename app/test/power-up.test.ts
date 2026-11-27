// Ce qu'engage l'allumage du manager, dit au geste « allumer » : l'avertissement
// de docs/runtime/, et deux nombres — les issues ouvertes, et celles qui
// sont parquées (#4260). Les nombres lus ici sont ceux qu'écrivait la commande de
// l'ancien runtime (runtime/src/manager-cli.ts, `backlog`, supprimé avec lui, #4499),
// jouée sur un backlog connu, dicté par un faux `gh`, et recopiés tels quels : la forme
// que l'app lit est celle que le runtime écrivait. Elle arrive par un faux `node` de
// la station de cet ordinateur, écrit par chaque test. Et le geste est confirmé : sa confirmation dit
// l'avertissement et ces nombres (confirmation.ts), et rien ne part avant son
// « oui » — qui n'attend rien de cette lecture.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { POWER_UP, WARNING, backlogOf, COMMAND, count, ACTION } from "../src/power-up.ts";
import { confirmationOf } from "../src/confirmation.ts";
import { writeAction, ACTIONS, WITHOUT_YES } from "../src/actions.ts";
import { ACTION as ACTION_OF_THE_STATION, type Kitchen, type Read } from "../src/box.ts";
import { openTerminals } from "../src/terminals.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const KITCHEN: Kitchen = { locale: { node: "node", runtime: "/runtime", racine: "/station", env: {} } };
const PARADE = { nom: "parade", dossier: "/projets/parade" };
const REPOSITORY = "benomite/parade";

// La sortie de `manager backlog` sur un backlog que dicte un faux `gh`, telle que l'ancien runtime l'écrivait.
const BACKLOG = {
  // Le backlog connu : sept issues ouvertes, dont trois parquées — et une PR, parquée, que l'API rend parmi elles
  // et qui n'en est pas une.
  KNOWN: "backlog               7 open issues, of which 3 are parked — read just now on GitHub (benomite/parade)\n",
  // Une seule issue, parquée.
  ONE: "backlog               1 open issue, of which 1 is parked — read just now on GitHub (benomite/parade)\n",
  // Aucune issue.
  NONE: "backlog               0 open issues, of which 0 are parked — read just now on GitHub (benomite/parade)\n",
};

function directory(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-allumage-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// Un faux `node` de la station : un script sh, où `$D` est le répertoire du test. Il note ce qu'il reçoit.
function station(t: TestContext, body: string) {
  const root = directory(t);
  const node = join(root, "node");
  writeFileSync(node, `#!/bin/sh\nD='${root}'\necho "$*" >>"$D/appels"\n${body}\n`);
  chmodSync(node, 0o755);
  const calls = () => (existsSync(join(root, "appels")) ? readFileSync(join(root, "appels"), "utf8") : "");
  const kitchen: Kitchen = { locale: { node, runtime: root, racine: root, env: {} } };
  const readOne: Read = { nom: "parade", cuisine: kitchen };
  return { racine: root, reglages: { delaiMs: 60_000 }, cuisine: kitchen, lu: readOne, appels: calls };
}
// Ce que le faux node écrit, tel quel, sur sa sortie standard.
const said = (text: string) => `cat <<'FIN'\n${text}FIN`;

describe("l'avertissement de l'allumage", () => {
  test("il est dit en anglais, et reprend celui de docs/runtime/ : ce que l'allumage engage et le parking", () => {
    assert.equal(
      WARNING,
      "Once on, the manager judges the whole open backlog, whatever it judges executable goes to the kitchen right away, and green deliveries are merged. Before switching the project on, park whatever must not go: a parked issue is never judged, a parked epic is never split.",
    );
  });

  test("il se pose au geste « allumer » du socle, et à lui seul : éteindre n'engage rien, et ne se confirme pas", () => {
    assert.equal(ACTION, "projet-allumer");
    assert.equal(POWER_UP.geste, ACTION);
    assert.deepEqual(confirmationOf(ACTION, PARADE, { sans: "pas lus" }, KITCHEN), {
      titre: "switch the project on",
      prix: [WARNING],
      chiffrer: true,
      choix: [{ id: ACTION, libelle: "yes, switch the project on", dit: "what the manager judges executable is taken up right away, and green deliveries are merged" }],
      renoncer: "no, leave it off",
    });
    assert.equal(confirmationOf("projet-eteindre", PARADE, { sans: "pas lus" }, KITCHEN), undefined);
    assert.equal(ACTIONS.find(({ id }) => id === ACTION)?.commande, "switch on");
  });
});

describe("les deux nombres : `manager backlog`, lancée une fois par la station de ce poste", () => {
  test("sur un backlog connu, ce sont les siens : sept issues ouvertes, dont trois parquées — la PR n'en est pas une", { skip: WITHOUT_POSIX }, async (t) => {
    const output = BACKLOG.KNOWN;
    const { reglages: settings, lu: readOne } = station(t, said(output));

    const account = await count(settings, readOne);

    assert.deepEqual(backlogOf(output), { ouvertes: 7, retenues: 3 });
    assert.deepEqual({ ...account, a: "" }, { projet: "parade", a: "", ouvertes: 7, retenues: 3, dit: "it will judge 4 of the 7 open issues — 3 are parked" });
    assert.ok(!Number.isNaN(Date.parse(account.a)));
  });

  test("une seule issue, aucune : les nombres sont lus quand même, et la phrase dit qu'il ne jugera rien", { skip: WITHOUT_POSIX }, async (t) => {
    const one = BACKLOG.ONE;
    const no = BACKLOG.NONE;

    assert.deepEqual(backlogOf(one), { ouvertes: 1, retenues: 1 });
    assert.deepEqual(backlogOf(no), { ouvertes: 0, retenues: 0 });
    const unique = station(t, said(one));
    const account = await count(unique.reglages, unique.lu);
    assert.equal("dit" in account && account.dit, "it will judge no issue: the only open issue is parked");
    const none = station(t, said(no));
    const empty = await count(none.reglages, none.lu);
    assert.equal("dit" in empty && empty.dit, "it will judge no issue: none is open");
  });

  test("ce qui part est le geste de la station, comme la veille le lance, et rien de plus", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, lu: readOne, appels: calls, racine: root } = station(t, said(BACKLOG.KNOWN));

    await count(settings, readOne);

    assert.equal(COMMAND, "manager backlog");
    assert.equal(calls(), `${join(root, "src", "station", "geste.ts")} parade manager backlog\n`);
  });

  test("la ligne `backlog` d'avant #951, en français, se lit encore : les mêmes nombres", () => {
    assert.deepEqual(backlogOf("backlog               5 issues ouvertes, dont 2 portent `blocked-on-human` — lu à l'instant sur GitHub (parade/parade)\n"), { ouvertes: 5, retenues: 2 });
    assert.deepEqual(backlogOf("backlog               1 issue ouverte, dont 1 porte `blocked-on-human` — lu à l'instant sur GitHub (parade/parade)\n"), { ouvertes: 1, retenues: 1 });
    assert.deepEqual(backlogOf("backlog               1 open issue, of which 1 carries `blocked-on-human` — read just now on GitHub (parade/parade)\n"), { ouvertes: 1, retenues: 1 });
    // Les deux formes ne se mêlent pas.
    assert.ok("informe" in backlogOf("backlog               5 open issues, dont 2 portent `blocked-on-human`\n"));
  });

  test("une sortie qui n'a pas la forme ne donne aucun nombre : ce n'est pas « aucune issue »", () => {
    assert.deepEqual(backlogOf(""), { informe: "it has no `backlog` line" });
    assert.deepEqual(backlogOf("manager               ÉTEINT — jamais allumé\n"), { informe: "it has no `backlog` line" });
    assert.deepEqual(backlogOf("backlog               beaucoup d'issues\n"), { informe: "its `backlog` line does not give the two numbers in the expected form: “backlog               beaucoup d'issues”" });
    assert.ok("informe" in backlogOf("backlog               2 open issues, of which 3 carry `blocked-on-human`\n"));
    assert.ok("informe" in backlogOf("backlog               2 issues ouvertes, dont 1 porte `blocked-on-human`\nbacklog               9 issues ouvertes, dont 1 porte `blocked-on-human`\n"));
    // Le mot au milieu d'une autre ligne n'est pas la ligne.
    assert.ok("informe" in backlogOf("  backlog               2 issues ouvertes, dont 1 porte `blocked-on-human`\n"));
  });

  test("la station répond autre chose que la ligne : les nombres ne sont pas lus, et ce qu'elle a rendu est gardé tel quel", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, lu: readOne, racine: root } = station(t, said("Bienvenue sur la station.\n"));

    const account = await count(settings, readOne);

    assert.ok("sans" in account);
    assert.equal(account.sans, "the two numbers were not read in what the station returned: it has no `backlog` line. This is not “no issue”: look at the backlog yourself before saying yes");
    assert.equal(account.obtenu, `$ ${join(root, "node")} ${join(root, "src", "station", "geste.ts")} parade manager backlog\nBienvenue sur la station.\n`);
  });

  test("un runtime d'avant cette lecture la refuse (code 2) : l'app le dit, et dit quoi faire", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, lu: readOne } = station(t, `echo "brigade : usage : BRIGADE_STATE_DIR=<répertoire d'état> npm --prefix runtime run manager -- [allumer | eteindre | rendre <n° d'issue>]" >&2\nexit 2`);

    const account = await count(settings, readOne);

    assert.ok("sans" in account);
    assert.match(account.sans, /^the two numbers were not read: the station's runtime refused `manager backlog` \(code 2\) — if it is older than this app, it does not know this reading yet: update brigade on the station\. This is not “no issue”/);
    assert.match(account.obtenu, /brigade : usage : .*\n→ exit code 2$/s);
  });

  test("la box n'a pas lu GitHub (code 1) : aucun nombre, et ce que le runtime en dit est gardé", { skip: WITHOUT_POSIX }, async (t) => {
    const { reglages: settings, lu: readOne } = station(t, `echo "brigade : le backlog de ${REPOSITORY} n'a pas été lu : gh api repos/${REPOSITORY}/issues : gh: connexion impossible — ce n'est pas « aucune issue »" >&2\nexit 1`);

    const account = await count(settings, readOne);

    assert.ok("sans" in account);
    assert.match(account.sans, /^the two numbers were not read: the station answered, but `manager backlog` did not read GitHub \(code 1\)/);
    assert.match(account.obtenu, /gh: connexion impossible/);
  });

  for (const [code, title] of [
    [65, "REACHED, BUT UNKNOWN TO THE STATION"],
    [68, "REACHED, BUT WITHOUT THE RIGHT TO THE ACTION"],
    [3, "REACHED, BUT `manager backlog` DID NOT ANSWER"],
  ] as const) {
    test(`le geste sort en ${code} : « ${title} », et aucun nombre`, { skip: WITHOUT_POSIX }, async (t) => {
      const { reglages: settings, lu: readOne } = station(t, `echo "refus ${code}" >&2\nexit ${code}`);

      const account = await count(settings, readOne);

      assert.ok("sans" in account);
      assert.ok(account.sans.startsWith(`the two numbers were not read: ${title} — what the app got is below. This is not “no issue”`), account.sans);
      assert.match(account.obtenu, new RegExp(`refus ${code}\\n\\n→ exit code ${code}$`));
    });
  }

  test("un `node` qui ne se lance pas : aucun nombre, et la station n'est pas dite jointe", async (t) => {
    const { racine: root, reglages: settings, lu: readOne } = station(t, "");

    const account = await count(settings, { ...readOne, cuisine: { locale: { ...readOne.cuisine.locale, node: join(root, "absent") } } });

    assert.ok("sans" in account);
    assert.match(account.sans, /^the two numbers were not read: NOT REACHED — /);
  });
});

describe("le geste « allumer », avec son avertissement", () => {
  test("sans son « oui », rien ne part ni ne s'écrit ; avec, il passe par le second — et n'attend rien de la station pour partir", async (t) => {
    // Une station qui ne répondrait jamais : le geste ne la joint pas, c'est la lecture des nombres qui le fait, à côté.
    const { appels: calls, cuisine: kitchen } = station(t, "exit 255");
    const writtenOnes: string[][] = [];
    const terminals = openTerminals({
      claude: "claude",
      shell: "/bin/zsh",
      ouvrirPty() {
        const receivedOnes: string[] = [];
        writtenOnes.push(receivedOnes);
        return { ecrire: (data) => void receivedOnes.push(data), redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminals.espace(PARADE);

    assert.deepEqual(writeAction(terminals, POWER_UP.geste, PARADE, undefined, kitchen), { refus: WITHOUT_YES });
    assert.deepEqual(writtenOnes, [[]]);

    // Avec son « oui » : le second vient de démarrer, il n'est pas dit libre — rien n'est écrit, et aucun shell ne s'ouvre.
    const rendered = await writeAction(terminals, POWER_UP.geste, PARADE, true, kitchen);
    assert.ok(rendered !== undefined && "refus" in rendered);
    const action = ACTION_OF_THE_STATION.replace(/[\\/.]/g, "\\$&");
    assert.match(rendered.refus, new RegExp(`the command did not go, and nothing is written: \`!\\(cd '.*' && BRIGADE_STATION_DIR='.*' '.*' ${action} parade switch on\\)\`$`));
    assert.deepEqual(writtenOnes, [[]]);
    assert.equal(calls(), "");
  });

  test("ce que l'app en dit avant les nombres ne pose pas de question : la confirmation dit, le « oui » décide", () => {
    for (const text of [WARNING, POWER_UP.enCours, POWER_UP.parti]) assert.doesNotMatch(text, /\?|confirm/i, text);
    assert.match(POWER_UP.parti, /before saying yes$/);
  });
});
