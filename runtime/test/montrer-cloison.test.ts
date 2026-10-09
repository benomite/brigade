// `npm run cloison` : ce que le chef lit de la cloison de son projet sans
// ouvrir une configuration, et les sondes qu'il lance dedans.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { demarrer } from "../src/runtime.ts";
import { FAUX_BWRAP, FAUX_CLAUDE, horloge, lancer, repertoireTemporaire } from "./outils.ts";

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
    assert.match(sortie, /ce journal ne dit rien de la cloison — le runtime n'a pas démarré depuis qu'elle existe/);
  });

  test("sans cloison ni porte, le chef lit que les projets se voient et que le réseau est ouvert", async (t) => {
    const { noter, commande } = projet(t);
    noter({ type: "isolation.configured", payload: { sandbox: null, proxy: null } });
    const { sortie } = await commande();
    assert.match(sortie, /^fichiers +OUVERTS$/m);
    assert.match(sortie, /un cook lit tout ce que lit le compte du service — l'état, le clone, les worktrees et les secrets des autres projets compris/);
    assert.match(sortie, /^réseau +OUVERT$/m);
    assert.match(sortie, /un cook joint tout ce que joint la machine/);
  });

  test("posée, elle dit ce qui est masqué, chaque hôte qui passe avec sa raison, et chaque refus avec son motif", async (t) => {
    const { noter, commande } = projet(t);
    noter({ type: "isolation.configured", payload: { sandbox: { bin: "/usr/bin/bwrap", hidden: ["/var/lib/brigade", "/etc/brigade"], credentials: "/home/brigade/.claude/.credentials.json" }, proxy: { port: 18443, enforced: true } } });
    noter({ type: "network.declared", payload: { base: "v2", hosts: ["registry.npmjs.org", "base.exemple.test:5432"], problems: ["ligne 3 de `.claude/brigade/reseau` (« * ») : ce n'est pas un hôte"] } });
    noter({ type: "network.refused", payload: { host: "pirate.exemple.test", port: 443, count: 3 } }, "porte");

    const { code, sortie } = await commande();
    assert.equal(code, 0);
    assert.match(sortie, /^fichiers +CLOISONNÉS$/m);
    assert.match(sortie, /masqués : \/var\/lib\/brigade, \/etc\/brigade ; machine en lecture seule ; identifiants Max en lecture seule \(\/home\/brigade\/\.claude\/\.credentials\.json\)/);
    assert.match(sortie, /^réseau +LISTE BLANCHE$/m);
    assert.match(sortie, /par la porte 127\.0\.0\.1:18443 — un envoi direct est refusé par le noyau : l'unité filtre/);
    assert.match(sortie, /anthropic\.com et ses sous-domaines +Anthropic — le modèle/);
    assert.match(sortie, /github\.com et ses sous-domaines +GitHub —/);
    assert.match(sortie, /registry\.npmjs\.org +déclaré par le dépôt \(`\.claude\/brigade\/reseau`\), sur `v2`/);
    assert.match(sortie, /base\.exemple\.test, port 5432 +déclaré par le dépôt/);
    assert.match(sortie, /N'OUVRE RIEN — ligne 3/);
    assert.match(sortie, /pirate\.exemple\.test:443 +3 tentatives  absent de la liste blanche/);
  });

  test("une porte que l'unité ne double pas d'un filtre se lit comme telle", async (t) => {
    const { noter, commande } = projet(t);
    noter({ type: "isolation.configured", payload: { sandbox: null, proxy: { port: 18443, enforced: false } } });
    const { sortie } = await commande();
    assert.match(sortie, /^réseau +LISTE BLANCHE NON TENUE$/m);
    assert.match(sortie, /MAIS un envoi direct part : l'unité ne semble rien filtrer \(IPAddressDeny\), et un process qui ignore HTTPS_PROXY sortirait librement/);
    assert.match(sortie, /derniers refus : aucun/);
  });

  test("éprouver lance de vraies sondes : une cloison qui ne masque rien est prise sur le fait", async (t) => {
    const { repertoire, commande } = projet(t);
    const compte = join(repertoireTemporaire(t), "compte");
    mkdirSync(join(compte, ".claude"), { recursive: true });
    writeFileSync(join(compte, ".claude/.credentials.json"), "{}");
    const { code, sortie } = await commande(["eprouver", "2"], {
      BRIGADE_REPO_DIR: join(repertoire, "depot"),
      BRIGADE_SANDBOX_BIN: FAUX_BWRAP,
      BRIGADE_SANDBOX_HIDDEN: repertoire,
      BRIGADE_CLAUDE_BIN: FAUX_CLAUDE,
      HOME: compte,
    });
    // La doublure ne cloisonne rien : les sondes le voient.
    assert.equal(code, 1);
    assert.match(sortie, /tient +un lancement part dans la cloison/);
    assert.match(sortie, new RegExp(`NE TIENT PAS +${repertoire} est masqué — \\d+ entrées y sont visibles`));
    assert.match(sortie, /NE TIENT PAS +les identifiants Max sont en lecture seule/);
    assert.match(sortie, /tient +`claude` y retrouve la connexion Max — connecté/);
    assert.match(sortie, /coût d'un lancement cloisonné \(médiane de 2 lancements de `true`\)/);
    assert.match(sortie, /la cloison ne tient pas ce qu'elle annonce/);
  });

  test("éprouver sans cloison posée le dit, et une cloison mal posée est refusée avec son motif", async (t) => {
    const { repertoire, commande } = projet(t);
    const sans = await commande(["eprouver"], { BRIGADE_REPO_DIR: join(repertoire, "depot") });
    assert.equal(sans.code, 1);
    assert.match(sans.sortie, /rien à éprouver — aucune \(BRIGADE_SANDBOX_BIN n'est pas défini\)/);

    const malPosee = await commande(["eprouver"], { BRIGADE_REPO_DIR: join(repertoire, "depot"), BRIGADE_SANDBOX_BIN: FAUX_BWRAP, HOME: "/home/brigade" });
    assert.equal(malPosee.code, 2);
    assert.match(malPosee.sortie, /la cloison ne masquerait rien/);
  });

  test("une commande inconnue rend l'usage", async (t) => {
    const { commande } = projet(t);
    const { code, sortie } = await commande(["ouvrir", "exemple.test"]);
    assert.equal(code, 2);
    assert.match(sortie, /usage : BRIGADE_STATE_DIR=/);
  });
});
