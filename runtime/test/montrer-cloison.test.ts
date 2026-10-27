// `npm run cloison` : ce que le chef lit de la cloison de son projet sans
// ouvrir une configuration, et les sondes qu'il lance dedans.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { demarrer } from "../src/runtime.ts";
import { FAUX_BWRAP, FAUX_CLAUDE, horloge, lancer, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

const CLOISON = join(import.meta.dirname, "../src/montrer-cloison.ts");

function projet(t: TestContext) {
  const repertoire = repertoireTemporaire(t);
  const runtime = demarrer({ repertoireEtat: repertoire, projet: "brigade", intervalleVeilleMs: 5, maintenant: horloge() });
  t.after(() => runtime.arreter("test"));
  const noter = (fait: Fait, author = "runtime") => runtime.journal.ajouter({ project: "brigade", ticket: null, author, ...fait });
  const commande = async (args: string[] = [], env: Record<string, string> = {}) => {
    const enfant = lancer(t, CLOISON, args, { BRIGADE_STATE_DIR: repertoire, ...env });
    return { code: await enfant.fin, sortie: enfant.sortie() };
  };
  return { repertoire, noter, commande };
}

describe("la cloison vue par le chef", { concurrency: 8 }, () => {
  test("un journal d'avant la cloison le dit, au lieu de laisser croire qu'elle est ouverte", async (t) => {
    const { commande } = projet(t);
    const { code, sortie } = await commande();
    assert.equal(code, 0);
    assert.match(sortie, /this log says nothing about the partition — the runtime has not started since it was introduced/);
  });

  test("sans cloison ni porte, le chef lit que les projets se voient et que le réseau est ouvert", async (t) => {
    const { noter, commande } = projet(t);
    noter({ type: "isolation.configured", payload: { sandbox: null, proxy: null } });
    const { sortie } = await commande();
    assert.match(sortie, /^files +OPEN$/m);
    assert.match(sortie, /a cook reads everything the service account reads — the state, the clone, the worktrees and the secrets of the other projects included/);
    assert.match(sortie, /^network +OPEN$/m);
    assert.match(sortie, /a cook reaches everything the machine reaches/);
  });

  test("posée, elle dit ce qui est masqué, chaque hôte qui passe avec sa raison, et chaque refus avec son motif", async (t) => {
    const { noter, commande } = projet(t);
    noter({ type: "isolation.configured", payload: { sandbox: { bin: "/usr/bin/bwrap", hidden: ["/var/lib/brigade", "/etc/brigade"], credentials: "/home/brigade/.claude/.credentials.json" }, proxy: { port: 18443, enforced: true } } });
    noter({ type: "network.declared", payload: { base: "v2", hosts: ["registry.npmjs.org", "base.exemple.test:5432"], problems: ["ligne 3 de `.claude/brigade/reseau` (« * ») : ce n'est pas un hôte"] } });
    noter({ type: "network.refused", payload: { host: "pirate.exemple.test", port: 443, count: 3 } }, "porte");

    const { code, sortie } = await commande();
    assert.equal(code, 0);
    assert.match(sortie, /^files +PARTITIONED$/m);
    assert.match(sortie, /hidden: \/var\/lib\/brigade, \/etc\/brigade; machine read-only; Max credentials read-only \(\/home\/brigade\/\.claude\/\.credentials\.json\)/);
    assert.match(sortie, /^network +ALLOWLIST$/m);
    assert.match(sortie, /through the door 127\.0\.0\.1:18443 — a direct send is refused by the kernel: the unit filters/);
    assert.match(sortie, /anthropic\.com and its subdomains +Anthropic — the model/);
    assert.match(sortie, /github\.com and its subdomains +GitHub —/);
    assert.match(sortie, /registry\.npmjs\.org +declared by the repository \(`\.claude\/brigade\/reseau`\), on `v2`/);
    assert.match(sortie, /base\.exemple\.test, port 5432 +declared by the repository/);
    assert.match(sortie, /OPENS NOTHING — ligne 3/);
    assert.match(sortie, /pirate\.exemple\.test:443 +3 attempts  not on the allowlist/);
  });

  test("une porte que l'unité ne double pas d'un filtre se lit comme telle", async (t) => {
    const { noter, commande } = projet(t);
    noter({ type: "isolation.configured", payload: { sandbox: null, proxy: { port: 18443, enforced: false } } });
    const { sortie } = await commande();
    assert.match(sortie, /^network +ALLOWLIST NOT ENFORCED$/m);
    assert.match(sortie, /BUT a direct send goes out: the unit does not seem to filter anything \(IPAddressDeny\), and a process that ignores HTTPS_PROXY would get out freely/);
    assert.match(sortie, /latest refusals: none/);
  });

  test("éprouver lance de vraies sondes : une cloison qui ne masque rien est prise sur le fait", { skip: posixOnly("probes a partition made of the fake bwrap, which hides nothing, and expects `probe` to catch the visible state directory and writable Max credentials while launches, caches and the Max login hold; a partitioned launch is a bubblewrap command line for Linux, run by /bin/sh through `trap` and `env --default-signal`, and its probes check POSIX paths and permissions") }, async (t) => {
    const { repertoire, commande } = projet(t);
    const compte = join(repertoireTemporaire(t), "compte");
    mkdirSync(join(compte, ".claude"), { recursive: true });
    writeFileSync(join(compte, ".claude/.credentials.json"), "{}");
    const { code, sortie } = await commande(["probe", "2"], {
      BRIGADE_REPO_DIR: join(repertoire, "depot"),
      BRIGADE_SANDBOX_BIN: FAUX_BWRAP,
      BRIGADE_SANDBOX_HIDDEN: repertoire,
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      HOME: compte,
    });
    // La doublure ne cloisonne rien : les sondes le voient.
    assert.equal(code, 1);
    assert.match(sortie, /holds +un lancement part dans la cloison/);
    assert.match(sortie, new RegExp(`DOES NOT HOLD +${repertoire} est masqué — \\d+ entrées y sont visibles`));
    assert.match(sortie, /DOES NOT HOLD +les identifiants Max sont en lecture seule/);
    assert.match(sortie, /holds +les outils écrivent leur cache sous ~, au projet — ~\/\.cache, ~\/\.npm, ~\/\.local\/share, ~\/\.local\/state/);
    assert.match(sortie, /holds +`claude` y retrouve la connexion Max — connecté/);
    assert.match(sortie, /cost of a partitioned launch \(median of 2 launches of `true`\)/);
    assert.match(sortie, /the partition does not hold what it announces/);
  });

  test("éprouver sans cloison posée le dit, et une cloison mal posée est refusée avec son motif", async (t) => {
    const { repertoire, commande } = projet(t);
    const sans = await commande(["probe"], { BRIGADE_REPO_DIR: join(repertoire, "depot") });
    assert.equal(sans.code, 1);
    assert.match(sans.sortie, /nothing to probe — none \(BRIGADE_SANDBOX_BIN is not set\)/);

    const malPosee = await commande(["probe"], { BRIGADE_REPO_DIR: join(repertoire, "depot"), BRIGADE_SANDBOX_BIN: FAUX_BWRAP, HOME: "/home/brigade" });
    assert.equal(malPosee.code, 2);
    assert.match(malPosee.sortie, /the partition would hide nothing/);
  });

  test("une commande inconnue rend l'usage", async (t) => {
    const { commande } = projet(t);
    const { code, sortie } = await commande(["ouvrir", "exemple.test"]);
    assert.equal(code, 2);
    assert.match(sortie, /usage: BRIGADE_STATE_DIR=/);
  });
});
