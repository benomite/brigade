// Le renvoi qui reprend la session du cook précédent : au lieu de repartir de
// zéro, le cook du renvoi reprend la conversation de celui dont la pass a
// refusé la livraison, et ne reçoit que ce qu'elle a trouvé. La pass, elle, ne
// change rien : mêmes gates, même relecture. Et quand la session ne se
// retrouve pas, le renvoi part d'un cook neuf, comme avant.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { posixOnly } from "./support/plateforme.ts";
import { argumentsClaude } from "../src/claude.ts";
import { decrireReleve, trancher } from "../src/mesures.ts";
import { mergedDeliveries } from "../src/projections/measures.ts";
import { dossierDuProjet, preparerReprise, sessionDuFlux } from "../src/reprise-de-session.ts";
import { chef, cuisine, issue, type Options } from "./aides/cuisine.ts";
import { jusqua, repertoireTemporaire } from "./outils.ts";

// Ces tests mènent la cuisine jusqu'au renvoi d'une livraison rouge et au cook
// qui le reprend — chaque `claude`, `gh` et gates une doublure en bash, que
// Windows lance par le bash de Git. Sur le job Windows, aucun n'atteignait ce
// qu'il attend dans les 60 s de `jusqua`.
const RENVOI_EN_CUISINE = posixOnly("drives the kitchen through a red delivery, its return and the cook that resumes it, where every claude, gh and gates call is a bash script run by Git Bash: on the Windows job none of these tests got its awaited fact within the 60 s of jusqua");

// Une cuisine avec sa pass, un ticket sur le rail, et des gates rouges : sa
// première livraison est renvoyée. Elles passent au vert dès le renvoi.
function renvoye(t: TestContext, options: Options = {}) {
  const lieu = cuisine(t, { pass: true, issues: [issue(17)], configClaude: true, suite: ["livre-en-session", "livre-en-session"], ...options });
  lieu.gates.regler("rouge");
  const { journal } = lieu;
  const compter = (type: string) => journal.duTicket(17).filter((e) => e.type === type).length;
  const jusquAu = async (type: string, combien = 1) => jusqua(() => compter(type) >= combien);
  const lances = () => journal.duTicket(17).filter((e) => e.type === "cook.launched").map((e) => e.payload as Record<string, unknown>);
  // La session qu'un cook a ouverte, telle que son flux brut la dit.
  const sessionDe = (lance: Record<string, unknown> | undefined) => sessionDuFlux(readFileSync(join(lieu.repertoire, String(lance?.stream)), "utf8"));
  // Ce que la pass a dit, dans l'ordre, sans le bruit des baux et des relevés.
  const histoire = () =>
    journal
      .duTicket(17)
      .map((e) => e.type)
      .filter((type) => /^(pass|grant|merge)\.|^ticket\.(served|released|86|left)$/.test(type));
  return { ...lieu, compter, jusquAu, lances, sessionDe, histoire };
}

const consigneDe = (args: string[] | undefined) => (args === undefined ? "" : (args[args.indexOf("-p") + 1] ?? ""));
const reprend = (args: string[] | undefined, session: string | null) => {
  const i = args?.indexOf("--resume") ?? -1;
  return i >= 0 && args?.[i + 1] === session && args?.[i + 2] === "--fork-session";
};
// Ce que la station imprime d'autre que le rouge de la première livraison.
const autreQueLeRouge = (ligne: string) => !/^brigade : pass rouge sur le ticket #17/.test(ligne);
// Le répertoire du projet d'un lancement — `cwd` tel que le faux `claude` le note, liens résolus.
const projet = (config: string, cwd: string) => dossierDuProjet(config, cwd) ?? "";

describe("la reprise de session d'un renvoi", { concurrency: 6 }, () => {
  test("un renvoi reprend la session du cook dont la pass a refusé la livraison : il reçoit ce contexte et ce qu'elle a trouvé, sans repasser par la lecture du ticket", { skip: RENVOI_EN_CUISINE }, async (t) => {
    const { configClaude, gates, cooks, lances, sessionDe, jusquAu, journal } = renvoye(t);
    await jusquAu("pass.returned");
    gates.regler("vert");
    await jusquAu("pass.held");

    const [premier, renvoi] = cooks();
    const [lance, relance] = lances();
    const session = sessionDe(lance);
    assert.notEqual(session, null);
    // Le premier cook part de zéro, et lit son ticket.
    assert.equal(premier?.args.includes("--resume"), false);
    assert.match(consigneDe(premier?.args), /Lis le ticket en entier/);
    // Le cook du renvoi reprend sa session, bifurquée.
    assert.equal(reprend(renvoi?.args, session), true);
    assert.deepEqual(relance?.resumes, { run: lance?.run, session });
    // Sa consigne : le refus, ce que la pass a trouvé, et son nouveau worktree — ni le ticket à relire, ni le `CLAUDE.md`.
    const consigne = consigneDe(renvoi?.args);
    const findings = journal.duTicket(17).find((e) => e.type === "pass.returned")?.payload.findings as string[];
    assert.ok(findings.length > 0);
    for (const finding of findings) assert.ok(consigne.includes(finding), finding);
    assert.match(consigne, /refusé ta livraison : c'est le renvoi 1 sur 2/);
    assert.match(consigne, /Tu reprends ici ta propre session/);
    assert.ok(consigne.includes(`${String(relance?.worktree)}\``), consigne);
    assert.doesNotMatch(consigne, /Relis le ticket|Lis le ticket|gh issue view|lis son `CLAUDE\.md`/);
    // Le transcript est rendu au répertoire du projet du worktree neuf : c'est là que `claude` le cherche.
    assert.equal(existsSync(join(projet(String(configClaude), String(renvoi?.cwd)), `${session}.jsonl`)), true);
    // Celui du premier cook reste où il est.
    assert.equal(existsSync(join(projet(String(configClaude), String(premier?.cwd)), `${session}.jsonl`)), true);
  });

  test("un renvoi repris repasse exactement les gates et la relecture d'un renvoi reparti de zéro : rien n'est sauté, rien n'est assoupli", { skip: RENVOI_EN_CUISINE }, async (t) => {
    // Deux cuisines de front, mêmes gates, même reviewer : l'une retrouve la session du premier cook, l'autre non.
    const repris = renvoye(t);
    const neuf = renvoye(t, { configClaude: false });
    // Chacune passe au vert dès son propre renvoi : attendre l'une laisserait
    // l'autre renvoyée une seconde fois.
    await Promise.all(
      [repris, neuf].map(async (lieu) => {
        await lieu.jusquAu("pass.returned");
        chef(lieu.repertoire, "grant.activated");
        lieu.gates.regler("vert");
      }),
    );
    await Promise.all([repris.jusquAu("ticket.left"), neuf.jusquAu("ticket.left")]);

    assert.equal(reprend(repris.cooks()[1]?.args, repris.sessionDe(repris.lances()[0])), true);
    assert.equal(neuf.cooks()[1]?.args.includes("--resume"), false);
    // La même histoire de pass, jugement par jugement.
    assert.deepEqual(repris.histoire(), neuf.histoire());
    assert.deepEqual(repris.histoire().filter((type) => type === "pass.judged").length, 2);
    // Les gates jouées autant de fois, sur les mêmes lieux ; le reviewer, autant de fois.
    const lieux = (appels: string[]) => appels.map((appel) => appel.split("/worktrees/")[1]);
    assert.deepEqual(lieux(repris.gates.appels()), lieux(neuf.gates.appels()));
    assert.equal(repris.relectures().length, neuf.relectures().length);
    // Chaque verdict dit les mêmes gates, la même relecture, le même verdict.
    const verdicts = (lieu: typeof repris) =>
      lieu.journal
        .duTicket(17)
        .filter((e) => e.type === "pass.judged")
        .map((e) => {
          const { verdict, gates, ci, review } = e.payload as unknown as Record<string, Record<string, unknown>>;
          return { verdict, gates: gates?.outcome, failures: gates?.failures, ci: ci?.outcome, review: review?.outcome };
        });
    assert.deepEqual(verdicts(repris), verdicts(neuf));
    assert.deepEqual(
      verdicts(repris).map(({ verdict, gates }) => [verdict, gates]),
      [
        ["red", "red"],
        ["green", "green"],
      ],
    );
  });

  test("le transcript du cook précédent rangé avant le renvoi : le renvoi part d'un cook neuf, sans erreur, et livre", { skip: RENVOI_EN_CUISINE }, async (t) => {
    let config = "";
    const lieu = renvoye(t, {
      depot: (depot) => ({
        ...depot,
        // Le renvoi prépare son worktree : le nettoyage vient de ranger les transcripts.
        reprendre(run, branche) {
          rmSync(join(config, "projects"), { recursive: true, force: true });
          return depot.reprendre(run, branche);
        },
      }),
    });
    config = String(lieu.configClaude);
    const { gates, cooks, lances, jusquAu, avertissements, journal } = lieu;
    await jusquAu("pass.returned");
    gates.regler("vert");
    await jusquAu("pass.held");

    const renvoi = cooks()[1];
    assert.equal(renvoi?.args.includes("--resume"), false);
    assert.equal(lances()[1]?.resumes, undefined);
    // La consigne d'avant la reprise : relire le ticket et ce qui est commité.
    assert.match(consigneDe(renvoi?.args), /1\. Relis le ticket/);
    assert.deepEqual(journal.duTicket(17).filter((e) => e.type === "cook.exited").map((e) => e.payload.outcome), ["ok", "ok"]);
    assert.deepEqual(avertissements.filter(autreQueLeRouge), []);
  });

  test("sans répertoire de `claude` connu, ou sans session dans le flux du cook précédent, le renvoi part d'un cook neuf", { skip: RENVOI_EN_CUISINE }, async (t) => {
    const sansConfig = renvoye(t, { configClaude: false });
    const sansSession = renvoye(t, { suite: ["livre", "livre"] });
    await Promise.all(
      [sansConfig, sansSession].map(async (lieu) => {
        await lieu.jusquAu("pass.returned");
        lieu.gates.regler("vert");
      }),
    );
    await Promise.all([sansConfig.jusquAu("pass.held"), sansSession.jusquAu("pass.held")]);

    for (const lieu of [sansConfig, sansSession]) {
      assert.equal(lieu.cooks()[1]?.args.includes("--resume"), false);
      assert.match(consigneDe(lieu.cooks()[1]?.args), /1\. Relis le ticket/);
      assert.deepEqual(lieu.avertissements.filter(autreQueLeRouge), []);
    }
  });

  test("un cook de renvoi repris qui échoue sans rien livrer : le suivant part d'un cook neuf — la reprise elle-même a pu buter", { skip: RENVOI_EN_CUISINE }, async (t) => {
    const { gates, cooks, lances, sessionDe, jusquAu, journal } = renvoye(t, { suite: ["livre-en-session", "echec", "livre-en-session"] });
    await jusquAu("pass.returned");
    gates.regler("vert");
    await jusquAu("pass.held");

    assert.deepEqual(journal.duTicket(17).filter((e) => e.type === "cook.exited").map((e) => e.payload.outcome), ["ok", "failed", "ok"]);
    assert.equal(reprend(cooks()[1]?.args, sessionDe(lances()[0])), true);
    assert.equal(cooks()[2]?.args.includes("--resume"), false);
    assert.equal(lances()[2]?.resumes, undefined);
  });

  test("un renvoi repris livré une seconde fois en rouge : le second renvoi reprend la session bifurquée du premier", { skip: RENVOI_EN_CUISINE }, async (t) => {
    const { gates, cooks, lances, sessionDe, jusquAu } = renvoye(t, { suite: ["livre-en-session", "livre-en-session", "livre-en-session"] });
    await jusquAu("pass.returned", 2);
    gates.regler("vert");
    await jusquAu("pass.held");

    const [premier, second] = lances();
    assert.notEqual(sessionDe(second), sessionDe(premier));
    assert.equal(reprend(cooks()[2]?.args, sessionDe(second)), true);
    assert.match(consigneDe(cooks()[2]?.args), /c'est le renvoi 2 sur 2/);
  });

  test("sous cloison, la session se retrouve dans le `~/.claude` du projet", { skip: RENVOI_EN_CUISINE }, async (t) => {
    const { configClaude, repertoire, gates, cooks, lances, sessionDe, jusquAu } = renvoye(t, { cloison: true });
    assert.equal(configClaude, join(repertoire, "claude"));
    await jusquAu("pass.returned");
    gates.regler("vert");
    await jusquAu("pass.held");

    assert.equal(reprend(cooks()[1]?.args, sessionDe(lances()[0])), true);
  });

  test("au relevé des mesures, le ticket repris se distingue d'un ticket reparti de zéro, et ses perdus se comptent comme avant", { skip: RENVOI_EN_CUISINE }, async (t) => {
    const repris = renvoye(t, { suite: ["livre-en-session", "echec", "livre-en-session", "livre-en-session"] });
    await repris.jusquAu("pass.returned", 2);
    chef(repris.repertoire, "grant.activated");
    repris.gates.regler("vert");
    await repris.jusquAu("merge.done");

    const [livraison] = mergedDeliveries(repris.journal.base);
    // Le premier cook part de zéro ; le premier renvoi est repris, et échoue ; le suivant repart de zéro, livre ; le second renvoi reprend.
    assert.deepEqual(
      livraison?.cooks.map(({ delivered, resumed }) => [delivered, resumed ?? false]),
      [
        [true, false],
        [false, true],
        [true, false],
        [true, true],
      ],
    );
    const [paiement] = trancher(mergedDeliveries(repris.journal.base))[0]?.paiements ?? [];
    // Les tokens du lancement repris qui n'a rien livré sont perdus, comme ceux de tout autre.
    const tokens = (livraison?.cooks ?? []).map((cook) => cook.tokens ?? 0);
    assert.deepEqual(paiement, { ticket: 17, lancements: 4, inconnus: 0, repris: 2, tokens: { utiles: (tokens[0] ?? 0) + (tokens[2] ?? 0) + (tokens[3] ?? 0), perdus: tokens[1] } });
  });
});

describe("le relevé des lancements repris", () => {
  const cook = (tokens: number, delivered: boolean, resumed = false) => ({ calibration: "opus/high", turns: 5, durationMs: 1000, tokens, delivered, ...(resumed ? { resumed: true as const } : {}) });
  const livraison = (ticket: number, cooks: ReturnType<typeof cook>[]) => ({ ticket, at: "2026-10-08T10:00:00.000Z", measures: {}, state: {}, gatesS: null, cooks });
  const lancements = (lignes: string[]) => lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("launches")));

  test("la colonne des lancements dit combien ont été repris ; la légende le dit seulement quand il y en a", () => {
    const lignes = lancements(
      decrireReleve({ projet: "brigade", livraisons: [livraison(1, [cook(9000, true), cook(400, false, true), cook(1500, true)]), livraison(2, [cook(9000, true), cook(1500, true)])], seuils: null }),
    );
    assert.match(lignes[0] ?? "", /; resumed: the retries that continued the previous cook's session instead of starting from scratch$/);
    assert.match(lignes[2] ?? "", /^1-2\s+#1\s+3, of which 1 resumed\s+10,900\s+10,500\s+400 \(4%\)$/);
    // Reparti de zéro : rien de plus qu'avant.
    assert.match(lignes[3] ?? "", /^1-2\s+#2\s+2\s+10,500\s+10,500\s+0$/);

    const sansReprise = lancements(decrireReleve({ projet: "brigade", livraisons: [livraison(2, [cook(9000, true), cook(1500, true)])], seuils: null }));
    assert.doesNotMatch(sansReprise[0] ?? "", /resumed/);
  });
});

describe("retrouver la session du cook précédent", () => {
  const SESSION = "0a1b2c3d-0000-4000-8000-000000000001";
  function lieux(t: TestContext) {
    const racine = repertoireTemporaire(t);
    const claude = join(racine, "claude");
    const worktree = join(racine, "worktrees", "17-neuf");
    mkdirSync(worktree, { recursive: true });
    const flux = join(racine, "17-ancien.jsonl");
    return { racine, claude, worktree, flux };
  }

  test("la session se lit dans le flux, à la première ligne qui la porte sous la forme d'un identifiant ; rien d'autre ne passe", () => {
    assert.equal(sessionDuFlux(`pas du json\n{"type":"system","subtype":"init","session_id":"${SESSION}"}\n{"type":"result"}`), SESSION);
    assert.equal(sessionDuFlux('{"type":"system","session_id":"../../etc/passwd"}'), null);
    assert.equal(sessionDuFlux('{"type":"result"}'), null);
    assert.equal(sessionDuFlux(""), null);
  });

  test("le répertoire d'un projet porte le nom de son chemin, tout ce qui n'est ni lettre ni chiffre changé en tiret — et n'est pas deviné au-delà de 200 caractères", () => {
    assert.equal(dossierDuProjet("/c", "/var/lib/brigade/worktrees/17-ab_c.d"), join("/c", "projects", "-var-lib-brigade-worktrees-17-ab-c-d"));
    assert.equal(dossierDuProjet("/c", `/${"a".repeat(200)}`), null);
  });

  test("le transcript trouvé sous un autre projet est copié dans celui du worktree neuf", (t) => {
    const { claude, worktree, flux } = lieux(t);
    writeFileSync(flux, `{"type":"system","subtype":"init","session_id":"${SESSION}"}\n`);
    mkdirSync(join(claude, "projects", "-ancien-worktree"), { recursive: true });
    writeFileSync(join(claude, "projects", "-ancien-worktree", `${SESSION}.jsonl`), "la conversation\n");

    assert.deepEqual(preparerReprise({ claude, run: "17-ancien", flux, worktree }), { reprise: { run: "17-ancien", session: SESSION } });
    assert.equal(readFileSync(join(projet(claude, realpathSync(worktree)), `${SESSION}.jsonl`), "utf8"), "la conversation\n");
  });

  test("ce qui manque — répertoire de `claude`, flux, session, transcript — rend un repli motivé, et n'écrit rien", (t) => {
    const { claude, worktree, flux } = lieux(t);
    const repli = (sur: Partial<Parameters<typeof preparerReprise>[0]>) => {
      const rendu = preparerReprise({ claude, run: "17-ancien", flux, worktree, ...sur });
      return "repli" in rendu ? rendu.repli : null;
    };
    assert.match(repli({ claude: null }) ?? "", /répertoire de configuration de `claude` inconnu/);
    assert.match(repli({ flux: null }) ?? "", /aucun flux connu/);
    assert.match(repli({}) ?? "", /flux du cook 17-ancien illisible/);
    writeFileSync(flux, '{"type":"result"}\n');
    assert.match(repli({}) ?? "", /aucune session/);
    writeFileSync(flux, `{"session_id":"${SESSION}"}\n`);
    assert.match(repli({}) ?? "", /transcript de la session .* absent/);
    assert.equal(existsSync(join(claude, "projects")), false);
  });
});

test("`claude` reçoit la session à reprendre avant `--disallowedTools`, qui avale ce qui le suit", () => {
  const args = argumentsClaude("consigne", { model: "opus", effort: "high" }, "0a1b2c3d-0000-4000-8000-000000000001");
  const i = args.indexOf("--resume");
  assert.deepEqual(args.slice(i, i + 3), ["--resume", "0a1b2c3d-0000-4000-8000-000000000001", "--fork-session"]);
  assert.ok(i < args.indexOf("--disallowedTools"));
  assert.equal(argumentsClaude("consigne", { model: "opus", effort: "high" }).includes("--resume"), false);
});
