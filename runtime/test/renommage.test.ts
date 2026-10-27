// Le renommage du code joué dans la pause que le chef a acceptée
// (pause/renommage.ts) : l'outil part de la dernière tête de la base, son arbre
// passe les gates et la pass avant tout merge, et la pause est levée seule —
// mergé, ou échoué en disant pourquoi, sans rien merger. Les premiers tests
// lisent un journal que le test écrit ; les suivants font tourner une cuisine,
// avec sa pass, sur un faux dépôt, et un faux outil que le test écrit.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { attentesDuChef, REFUSER_LA_PAUSE } from "../src/attend.ts";
import type { Depot } from "../src/depot.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Fait } from "../src/evenements.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import type { Pass } from "../src/pass.ts";
import { demanderPause, echecDuRenommage, LIMITE_DU_RENOMMAGE_MS, mergeRetenu, pauseEnCours, renommageEcarte, repondre } from "../src/pause/pause.ts";
import { renommeur } from "../src/pause/renommage.ts";
import { lireRail } from "../src/projections/rail.ts";
import type { Runtime } from "../src/runtime.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { chef, cuisine } from "./aides/cuisine.ts";
import { BASE, JOUR_HORLOGE, jusqua, repertoireTemporaire } from "./outils.ts";
import { posixOnly } from "./support/plateforme.ts";

// Le bloc `awaiting` d'une sortie de `status`, bords compris.
const blocAttend = (lignes: string[]) => lignes.slice(lignes.findIndex((ligne) => ligne.startsWith("awaiting")), lignes.indexOf("end awaiting") + 1);

const PR = "https://github.com/o/r/pull/101";

describe("la pause du renommage, lue au journal", () => {
  // Un journal que le test écrit : une pause demandée et acceptée, puis la PR
  // que le renommage a remise à la pass, sous le numéro 101.
  function journalEcrit(t: TestContext) {
    const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: () => new Date(`${JOUR_HORLOGE}T10:00:00.000Z`) });
    t.after(() => journal.fermer());
    const noter = (fait: Fait) => journal.ajouter({ project: "brigade", ticket: null, author: "rename", ...fait });
    const { pause } = demanderPause(journal, "brigade", { ticket: null, minutes: 45, rail: lireRail(journal.base), auteur: "runtime" });
    repondre(journal, "brigade", "yes");
    const livrer = () => noter({ type: "rename.delivered", payload: { request: pause.request, run: "renommage-aa", pr: PR, number: 101, sha: "5a5a" } });
    const lever = (outcome: "merged" | "failed") =>
      noter({ type: "pause.released", payload: { request: pause.request, why: outcome === "merged" ? "the code rename is merged" : "the pass judged it red: red gates", outcome, ...(outcome === "failed" ? { cause: "gates" as const } : {}) } });
    return { journal, pause, livrer, lever };
  }

  test("pendant la pause, la PR que le renommage a remise à la pass est la seule qui se merge", (t) => {
    const { journal, livrer } = journalEcrit(t);
    livrer();

    assert.equal(pauseEnCours(journal.base)?.pr, 101);
    assert.equal(mergeRetenu(journal.base, 101), null);
    assert.notEqual(mergeRetenu(journal.base, 14), null);
    assert.equal(renommageEcarte(journal.base, 101), false);
  });

  test("levée sur un échec, la pause laisse la PR du renommage à jamais sans merge, et une carte qui dit pourquoi — que le « non » du chef ôte", (t) => {
    const { journal, pause, livrer, lever } = journalEcrit(t);
    livrer();
    lever("failed");

    assert.equal(pauseEnCours(journal.base), null);
    assert.equal(renommageEcarte(journal.base, 101), true);
    assert.equal(renommageEcarte(journal.base, 14), false);
    assert.deepEqual(echecDuRenommage(journal.base), { request: pause.request, at: `${JOUR_HORLOGE}T10:00:00.000Z`, why: "the pass judged it red: red gates", cause: "gates", pr: PR });
    const [carte, ...autres] = attentesDuChef(journal.base, lireRail(journal.base));
    assert.deepEqual(autres, []);
    assert.equal(carte?.quoi, "renommage");
    const bloc = blocAttend(decrireEtat(lireEtat(journal, new Date(`${JOUR_HORLOGE}T10:05:00.000Z`)), new Date(`${JOUR_HORLOGE}T10:05:00.000Z`)));
    assert.equal(
      bloc[1],
      `  rename  for 5 min  the code rename failed: the pass judged it red: red gates — nothing was merged, the kitchen went on by itself — its PR stays open, unmerged, to close: ${PR} — once read: \`${REFUSER_LA_PAUSE}\``,
    );
    sansMotFrancais(bloc);

    assert.equal(repondre(journal, "brigade", "no").suite, "otee");
    assert.equal(echecDuRenommage(journal.base), null);
    assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base)), []);
    // Ôtée, la carte ne revient pas, et un second « non » n'écrit rien.
    assert.equal(repondre(journal, "brigade", "no").suite, "rien");
    assert.equal(renommageEcarte(journal.base, 101), true);
  });

  test("mergé, le renommage ne laisse ni carte ni PR écartée", (t) => {
    const { journal, livrer, lever } = journalEcrit(t);
    livrer();
    lever("merged");

    assert.equal(renommageEcarte(journal.base, 101), false);
    assert.equal(echecDuRenommage(journal.base), null);
    assert.deepEqual(attentesDuChef(journal.base, lireRail(journal.base)), []);
  });
});

// Le faux outil de renommage : `renomme` écrit un fichier dans l'arbre, comme
// l'outil y renomme ; `echoue` sort en erreur en nommant ce qu'il n'a pas
// résolu ; `bloque` écrit son pid dans le fichier qu'on lui nomme, puis ne
// rend plus la main.
function fauxOutil(t: TestContext): string {
  const outil = join(repertoireTemporaire(t), "faux-renommage.sh");
  writeFileSync(
    outil,
    [
      "#!/usr/bin/env bash",
      'case "$1" in',
      "  renomme) echo renamed > renomme.txt ;;",
      '  echoue) echo "unresolved	runtime/src/rail.ts	prendre"; echo "1 unresolved identifier(s)"; exit 1 ;;',
      '  bloque) echo $$ > "$2"; exec sleep 600 ;;',
      "esac",
      "",
    ].join("\n"),
  );
  return outil;
}

const vivant = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// Une cuisine avec sa pass, sous grant sauf avis contraire, et le renommeur
// branché sur ses réveils. `conflit` : la fusion de toute livraison avec la
// base se refuse, quand le test le décide.
async function enPause(t: TestContext, { outil = ["renomme"], grant = true }: { outil?: string[]; grant?: boolean } = {}) {
  // Arrêté avant la cuisine : les crochets de fin se jouent dans l'ordre.
  let renommage: ReturnType<typeof renommeur> | undefined;
  t.after(() => renommage?.arreter());
  const tenu: { depot?: Depot } = {};
  const conflit = { actif: false };
  const lieu = cuisine(t, {
    pass: true,
    issues: [],
    depot: (vrai) => (tenu.depot = { ...vrai, fusionner: async (nom: string, base: string, sha: string) => (conflit.actif ? null : vrai.fusionner(nom, base, sha)) }),
  });
  if (grant) chef(lieu.repertoire, "grant.activated");
  const { depot } = tenu;
  assert.ok(depot, "la cuisine a un dépôt");
  const runtime = lieu.runtime as unknown as Runtime & Pick<Pass, "prendreHorsRail">;
  assert.equal(typeof runtime.prendreHorsRail, "function");
  renommage = renommeur(runtime, {
    depot,
    github: lieu.gh.github,
    base: BASE,
    // Par `bash` : le répertoire temporaire peut refuser d'exécuter.
    outil: { commande: "bash", args: [fauxOutil(t), ...outil] },
    maintenant: lieu.heure.maintenant,
    avertir: (message) => void lieu.avertissements.push(message),
  });
  const suivre = renommage;
  const desabonner = runtime.surReveil(() => suivre.passer());
  t.after(desabonner);

  // Ce qu'écrirait la commande du chef : une autre connexion, à l'heure de la cuisine.
  const ecrire = <T>(faire: (journal: Journal) => T): T => {
    const journal = ouvrirJournal(lieu.repertoire, { maintenant: lieu.heure.maintenant });
    try {
      return faire(journal);
    } finally {
      journal.fermer();
    }
  };
  const accepter = () =>
    ecrire((journal) => {
      demanderPause(journal, "brigade", { ticket: null, minutes: 45, rail: lireRail(journal.base), auteur: "runtime" });
      return repondre(journal, "brigade", "yes");
    });
  const faits = (type: string, ticket?: number) => (ticket === undefined ? lieu.journal.tout() : lieu.journal.duTicket(ticket)).filter((e) => e.type === type);
  const premier = (type: string, ticket?: number) => faits(type, ticket)[0];
  const levee = () => premier("pause.released")?.payload as { why: string; outcome?: string; cause?: string } | undefined;
  const numero = () => (premier("rename.delivered")?.payload as { number: number } | undefined)?.number;
  const statut = () => decrireEtat(lireEtat(lieu.journal, lieu.heure.maintenant()), lieu.heure.maintenant());
  return { ...lieu, conflit, accepter, faits, premier, levee, numero, statut };
}

describe("le renommage dans la pause", { concurrency: 4 }, () => {
  test("sur le « oui », l'outil part de la dernière tête de la base ; son arbre passe les gates et la pass avant le merge, mergé dans la même pause, qui est levée ensuite", async (t) => {
    const lieu = await enPause(t);
    const { accepter, faits, premier, levee, numero, gh, gates, relectures } = lieu;
    accepter();

    await jusqua(() => levee() !== undefined);
    assert.equal(levee()?.outcome, "merged", JSON.stringify(levee()));
    const pr = numero();
    assert.ok(pr !== undefined, "le renommage a remis sa PR à la pass");

    // Parti de la tête que le rapatriement vient de voir.
    const parti = premier("rename.started")?.payload as { base: string; deadline: string; branch: string };
    assert.equal(parti.base, "base-0");
    // Jugé avant tout merge : les gates, la relecture, puis l'usage du grant et le merge.
    const seq = (type: string, ticket?: number) => premier(type, ticket)?.seq ?? Infinity;
    const juge = faits("pass.judged", pr).at(-1);
    assert.equal((juge?.payload as { verdict: string }).verdict, "green");
    assert.equal((juge?.payload as { gates: { outcome: string } }).gates.outcome, "green");
    assert.ok(seq("rename.started") < seq("pass.entered", pr));
    assert.ok(seq("pass.entered", pr) < (juge?.seq ?? Infinity));
    assert.ok((juge?.seq ?? Infinity) < seq("grant.used", pr));
    assert.ok(seq("grant.used", pr) < seq("merge.done", pr));
    assert.ok(seq("merge.done", pr) < seq("pause.released"));
    assert.ok(gates.appels().length >= 1, "les gates ont été jouées");
    assert.ok(relectures().length >= 1, "le reviewer a relu");
    assert.deepEqual(gh.merges.map(([numeroMerge]) => numeroMerge), [pr]);
    assert.equal(gh.prs[0]?.base, BASE);
    assert.match(gh.prs[0]?.titre ?? "", /^Renommage du code/);
    assert.match(levee()?.why ?? "", /^the code rename is merged: https:\/\/github\.com\/.*\/pull\/\d+$/);

    // La pause levée, rien n'attend le chef.
    assert.equal(pauseEnCours(lieu.journal.base), null);
    assert.deepEqual(attentesDuChef(lieu.journal.base, lireRail(lieu.journal.base)), []);
    assert.doesNotMatch(lieu.statut().join("\n"), /paused for the code rename/);
  });

  test("gates rouges : rien n'est mergé, la pause est levée sans geste du chef, et la carte de la file dit pourquoi", async (t) => {
    const lieu = await enPause(t);
    const { accepter, faits, levee, numero, gh, gates } = lieu;
    gates.regler("rouge");
    accepter();

    await jusqua(() => levee() !== undefined);
    assert.equal(levee()?.outcome, "failed", JSON.stringify(levee()));
    assert.equal(levee()?.cause, "gates");
    assert.match(levee()?.why ?? "", /^the pass judged it red: red gates — `FAIL {2}tests du projet en échec`: https:\/\/github\.com\/.*\/pull\/\d+$/);
    const pr = numero();
    assert.ok(pr !== undefined);
    assert.deepEqual(gh.merges, []);
    assert.equal(faits("grant.used", pr).length, 0);
    assert.equal(pauseEnCours(lieu.journal.base), null);
    const bloc = blocAttend(lieu.statut());
    assert.match(bloc[1] ?? "", /^ {2}rename {2}for .* {2}the code rename failed: the pass judged it red: red gates — .* — nothing was merged, the kitchen went on by itself — its PR stays open, unmerged, to close: https:/);
  });

  test("conflit avec la base : rien n'est mergé, la pause est levée, et la carte dit le conflit", async (t) => {
    const lieu = await enPause(t);
    const { accepter, levee, gh, conflit } = lieu;
    conflit.actif = true;
    accepter();

    await jusqua(() => levee() !== undefined);
    assert.equal(levee()?.outcome, "failed", JSON.stringify(levee()));
    assert.equal(levee()?.cause, "conflict");
    assert.match(levee()?.why ?? "", new RegExp(`^the pass judged it red: the renamed branch no longer merges into \`${BASE}\` \\(conflict\\)`));
    assert.deepEqual(gh.merges, []);
    assert.equal(pauseEnCours(lieu.journal.base), null);
    assert.equal(attentesDuChef(lieu.journal.base, lireRail(lieu.journal.base))[0]?.quoi, "renommage");
  });

  test("au-delà de sa limite, comptée sur l'horloge de la cuisine depuis le « oui », le renommage est abandonné : l'outil arrêté, rien de livré ni de mergé, la pause levée avant l'heure", { skip: posixOnly("runs a rename tool that writes `$$` to a file and sleeps, expects that pid alive until the kitchen's clock passes the rename limit, then dead and the pause released as a timeout; under Git Bash `$$` is an MSYS pid, not the Windows pid Node probes, so the tool reads as not running") }, async (t) => {
    const temoin = join(repertoireTemporaire(t), "pid");
    const lieu = await enPause(t, { outil: ["bloque", temoin] });
    const { accepter, premier, levee, gh, heure } = lieu;
    accepter();

    await jusqua(() => existsSync(temoin) && readFileSync(temoin, "utf8").trim() !== "");
    const pid = Number(readFileSync(temoin, "utf8").trim());
    assert.ok(vivant(pid), "l'outil tourne");
    // Tant que l'horloge n'a pas passé la limite, l'outil tourne.
    assert.equal(levee(), undefined);

    heure.avancer(LIMITE_DU_RENOMMAGE_MS);
    await jusqua(() => levee() !== undefined);
    assert.equal(levee()?.outcome, "failed", JSON.stringify(levee()));
    assert.equal(levee()?.cause, "timeout");
    assert.match(levee()?.why ?? "", new RegExp(`^the rename ran past the pause's limit of ${LIMITE_DU_RENOMMAGE_MS / 60_000} min from the chef's « yes »`));
    await jusqua(() => !vivant(pid));
    assert.equal(premier("rename.delivered"), undefined);
    assert.deepEqual(gh.prs, []);
    assert.deepEqual(gh.merges, []);
    // Levée moins d'une heure après le « oui ».
    const oui = Date.parse(premier("pause.agreed")?.at ?? "");
    const fin = Date.parse(premier("pause.released")?.at ?? "");
    assert.ok(fin - oui < 3_600_000, `${fin - oui} ms`);
    assert.ok(fin - oui >= LIMITE_DU_RENOMMAGE_MS);
    assert.equal(attentesDuChef(lieu.journal.base, lireRail(lieu.journal.base))[0]?.quoi, "renommage");
  });

  test("l'outil en échec : rien n'est poussé ni mergé, la pause est levée, et la carte nomme ce qu'il a dit", async (t) => {
    const lieu = await enPause(t, { outil: ["echoue"] });
    const { accepter, premier, levee, gh } = lieu;
    accepter();

    await jusqua(() => levee() !== undefined);
    assert.equal(levee()?.outcome, "failed", JSON.stringify(levee()));
    assert.equal(levee()?.cause, "tool");
    assert.match(levee()?.why ?? "", /^the rename tool failed \(`.*faux-renommage\.sh echoue`, exit code 1\): `1 unresolved identifier\(s\)` — the tree was left as it was$/);
    assert.notEqual(premier("rename.started"), undefined);
    assert.equal(premier("rename.delivered"), undefined);
    assert.deepEqual(gh.prs, []);
    assert.deepEqual(gh.merges, []);
  });

  test("sans grant `merge`, la pass ne mergerait pas le renommage : rien ne part, et la pause est levée en le disant", async (t) => {
    const lieu = await enPause(t, { grant: false });
    const { accepter, premier, levee, gh } = lieu;
    accepter();

    await jusqua(() => levee() !== undefined);
    assert.equal(levee()?.cause, "grant");
    assert.match(levee()?.why ?? "", /^the `merge` grant is not active/);
    assert.equal(premier("rename.started"), undefined);
    assert.deepEqual(gh.prs, []);
  });
});
