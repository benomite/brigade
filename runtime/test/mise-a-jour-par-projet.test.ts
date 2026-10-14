// La mise à jour se fait projet par projet : la box porte plusieurs projets,
// chacun son runtime, son répertoire d'état, ses versions posées — et un seul
// clone de brigade, qui suit une seule origine. Quand la branche avance, chaque
// projet essaie la nouvelle version pour lui-même : un projet qui travaille ne
// retient pas celle d'un autre, et un essai raté sur l'un n'empêche pas les
// autres de passer.
//
// Une box sans root ni systemd, comme dans `mise-a-jour-seule.test.ts` : une
// origine nue, le clone qui la suit, les versions posées à côté de lui projet
// par projet, et de vrais `git` pour les comparaisons. Chaque projet a sa
// doublure de `sudo`, et la bascule, c'est le test qui la joue, projet par
// projet : il arrête le runtime du projet et le relance sur la version qu'elle
// mettrait en service, sur le même répertoire d'état.
import assert from "node:assert/strict";
import { mkdirSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import type { Journal } from "../src/journal.ts";
import { brancherMiseEnService } from "../src/mettre-en-service.ts";
import { cooksEnVol } from "../src/projections/garde-fous.ts";
import { dejaRatee, miseEnServiceRetient, REESSAI_DU_CLONE_MS } from "../src/projections/mise-en-service.ts";
import { versionComparee } from "../src/projections/version.ts";
import { demarrer, type Runtime } from "../src/runtime.ts";
import { brancherVersion } from "../src/version.ts";
import { montre } from "./aides/cuisine.ts";
import { fauxSudo } from "./aides/faux-sudo.ts";
import { aArreter, BASE, ENV_GIT, git, jusqua, repertoireTemporaire } from "./outils.ts";

// Ce que la bascule note quand la version ne démarre pas pour un projet.
const MOTIF = "le runtime est sorti en code 1, et systemd ne le relance pas (`failed`)";

const sha = (commit: string) => `\`${commit.slice(0, 7)}\``;
const echappe = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hhmm = (instant: number) => new Date(instant).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const types = (journal: Journal, prefixe: string) => journal.tout().flatMap(({ type }) => (type.startsWith(prefixe) ? [type] : []));
const battements = (journal: Journal) => journal.base.lire<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'runtime.ticked'")[0]?.n ?? 0;
// Laisse passer des ticks du runtime : à chacun, il regarde s'il a une version
// à essayer. Un fait — des battements écrits —, pas une durée.
async function ticks(journal: Journal, combien = 3): Promise<void> {
  const avant = battements(journal);
  await jusqua(() => battements(journal) >= avant + combien);
}

// La box et son clone, commun à tous ses projets.
function box(t: TestContext) {
  const racine = realpathSync(repertoireTemporaire(t));
  const [origine, travail, clone] = [join(racine, "origine.git"), join(racine, "travail"), join(racine, "brigade")];
  git(racine, "init", "-q", "--bare", `--initial-branch=${BASE}`, origine);
  git(racine, "init", "-q", `--initial-branch=${BASE}`, travail);
  let rang = 0;
  // Une livraison sur la branche de l'origine, qui change le runtime. Rend son commit.
  const livrer = (): string => {
    mkdirSync(join(travail, "runtime/src"), { recursive: true });
    writeFileSync(join(travail, "runtime/src/main.ts"), `// livraison ${++rang}\n`);
    git(travail, "add", ".");
    git(travail, "commit", "-q", "-m", `livraison ${rang}`);
    git(travail, "push", "-q", origine, BASE);
    return git(travail, "rev-parse", "HEAD");
  };
  const premiere = livrer();
  git(racine, "clone", "-q", "--branch", BASE, origine, clone);
  const heure = montre();

  // Un projet de la box : son répertoire d'état, ses versions, sa doublure de
  // `sudo` et son runtime — qui compare ce qu'il sert à l'origine, et tient
  // sa mise en service.
  const projet = (nom: string) => {
    const etat = join(racine, `etat-${nom}`);
    const versions = join(`${clone}-versions`, nom);
    const sudo = fauxSudo(t, "attend");
    let runtime: Runtime | null = null;
    const arreter = () => {
      runtime?.arreter("SIGTERM");
      runtime = null;
    };
    aArreter(t, () => {
      arreter();
      sudo.finir();
    });
    const journal = (): Journal => {
      if (runtime === null) throw new Error(`aucun runtime en marche pour ${nom}`);
      return runtime.journal;
    };
    return {
      nom,
      sudo,
      journal,
      arreter,
      demarrerSur(commit: string) {
        const sources = join(versions, commit, "runtime/src");
        mkdirSync(sources, { recursive: true });
        const socle = demarrer({ repertoireEtat: etat, projet: nom, intervalleVeilleMs: 5, intervalleTickMs: 20, maintenant: heure.maintenant });
        const compare = brancherVersion(socle, { repertoireEtat: etat, env: ENV_GIT, sources, cadenceMs: 100 });
        runtime = brancherMiseEnService(compare, { repertoireEtat: etat, env: sudo.env, sources, attenteAuDemarrageMs: 0, maintenant: heure.maintenant });
      },
      comparee: () => versionComparee(journal().base)?.comparaison ?? null,
      // Les versions que ses gestes de box ont visées, dans l'ordre.
      visees: () => journal().tout().flatMap(({ type, payload }) => (type === "deploy.launched" ? [(payload as { target?: string | null }).target ?? null] : [])),
      conclusions: () => journal().tout().flatMap(({ type, payload }) => (type === "deploy.concluded" ? [payload] : [])),
      // Ce que la bascule de ce projet note à côté de ses versions.
      compteRendu(enService: string, refus?: { refusee: string; motif: string }) {
        const lignes = [`clone=${clone}`, `en-service=${enService}`, ...(refus ? [`refusee=${refus.refusee}`, `motif=${refus.motif}`] : [])];
        writeFileSync(join(versions, "bascule"), `${lignes.join("\n")}\n`);
        utimesSync(join(versions, "bascule"), heure.maintenant(), heure.maintenant());
      },
      // La ligne `version` du bloc `attend` de sa file.
      ligneVersion: () => decrireEtat(lireEtat(journal(), heure.maintenant()), heure.maintenant()).find((ligne) => ligne.startsWith("  version  ")) ?? null,
    };
  };
  return { clone, premiere, livrer, heure, projet };
}

// La bascule d'un projet, jouée par le test : le runtime du projet arrêté, puis
// relancé sur la version qu'elle met en service — elle seule, celle des autres
// projets n'est pas touchée.
function basculer(projet: ReturnType<ReturnType<typeof box>["projet"]>, enService: string, refus?: { refusee: string; motif: string }) {
  projet.arreter();
  projet.compteRendu(enService, refus);
  projet.demarrerSur(enService);
  projet.sudo.liberer();
}

test("deux projets sur la box, l'un avec un cook en vol, l'autre au repos : le second passe à la nouvelle version sans attendre le premier, qui n'est ni interrompu ni retenu", async (t) => {
  const { premiere, livrer, heure, projet } = box(t);
  const [occupe, repos] = [projet("occupe"), projet("repos")];
  occupe.demarrerSur(premiere);
  repos.demarrerSur(premiere);
  await jusqua(() => occupe.comparee()?.outcome === "current" && repos.comparee()?.outcome === "current");

  // Le projet occupé a un cook en vol ; l'autre n'en a aucun.
  occupe.journal().ajouter({ project: "occupe", ticket: 12, author: "runtime", type: "cook.launched", payload: { run: "12-aaaa", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/12-aaaa.jsonl", station: "box/claude" } });
  const journalOccupe = occupe.journal();
  assert.equal(cooksEnVol(journalOccupe.base).length, 1);
  assert.equal(cooksEnVol(repos.journal().base).length, 0);

  // La branche avance : le projet au repos lance son geste, pour lui seul.
  const nouvelle = livrer();
  await jusqua(() => repos.sudo.lancements().length === 1);
  assert.deepEqual(repos.sudo.lancements()[0]?.args, ["-n", "--", "/usr/local/bin/brigade-mise-en-service", "repos"]);

  // Sa bascule passe : il est en service sur la nouvelle version.
  heure.avancer(30_000);
  basculer(repos, nouvelle);
  assert.deepEqual(repos.conclusions(), [{ outcome: "served", served: nouvelle }]);
  await jusqua(() => repos.comparee()?.outcome === "current");

  // Le projet occupé n'a pas été touché : le même runtime tourne, son cook est
  // toujours en vol, rien ne retient sa cuisine — et il essaie la version pour
  // lui-même, sans que son cook l'en empêche ni que l'autre projet l'ait attendu.
  assert.equal(occupe.journal(), journalOccupe);
  await ticks(journalOccupe);
  assert.deepEqual(types(journalOccupe, "runtime.started"), ["runtime.started"]);
  assert.deepEqual(
    cooksEnVol(journalOccupe.base).map(({ run }) => run),
    ["12-aaaa"],
  );
  assert.deepEqual(types(journalOccupe, "cook."), ["cook.launched"]);
  assert.equal(miseEnServiceRetient(journalOccupe.base), false);
  await jusqua(() => occupe.sudo.lancements().length === 1);
  assert.deepEqual(occupe.sudo.lancements()[0]?.args, ["-n", "--", "/usr/local/bin/brigade-mise-en-service", "occupe"]);
  assert.deepEqual(occupe.visees(), [nouvelle]);
  assert.equal(miseEnServiceRetient(journalOccupe.base), false);
  // Aucun des deux n'a lancé le geste de l'autre.
  assert.equal(repos.sudo.lancements().length, 1);
  assert.equal(
    occupe.sudo.lancements().every(({ args }) => args.at(-1) === "occupe"),
    true,
  );
});

test("un essai raté sur un projet n'empêche pas la mise à jour des autres : la version qui ne démarre pas pour l'un passe pour l'autre, et la suivante est essayée par les deux", async (t) => {
  const { premiere, livrer, heure, projet } = box(t);
  const [rate, passe] = [projet("rate"), projet("passe")];
  rate.demarrerSur(premiere);
  passe.demarrerSur(premiere);
  await jusqua(() => rate.comparee()?.outcome === "current" && passe.comparee()?.outcome === "current");

  const version = livrer();
  await jusqua(() => rate.sudo.lancements().length === 1 && passe.sudo.lancements().length === 1);

  // Pour l'un, la version ne démarre pas : sa bascule remet l'ancienne.
  heure.avancer(40_000);
  basculer(rate, premiere, { refusee: version, motif: MOTIF });
  assert.equal(rate.conclusions().at(-1)?.outcome, "returned");
  await jusqua(() => rate.comparee()?.outcome === "waiting");

  // Pour l'autre, elle démarre : son échec ne le retient pas.
  basculer(passe, version);
  assert.deepEqual(passe.conclusions(), [{ outcome: "served", served: version }]);
  await jusqua(() => passe.comparee()?.outcome === "current");
  assert.equal(dejaRatee(passe.journal().base, version), false);

  // Le projet raté ne réessaie pas la version qui a raté pour lui, et le dit ;
  // l'autre n'a plus rien à essayer.
  await ticks(rate.journal(), 10);
  assert.equal(rate.sudo.lancements().length, 1);
  assert.match(rate.ligneVersion() ?? "", new RegExp(`essai de ${sha(version)} raté à .* : ${echappe(MOTIF)} — ${sha(premiere)} reste en service$`));
  assert.equal(passe.sudo.lancements().length, 1);

  // Une version corrigée arrive : chacun l'essaie pour lui-même.
  rate.sudo.retenir();
  passe.sudo.retenir();
  const corrigee = livrer();
  await jusqua(() => rate.sudo.lancements().length === 2 && passe.sudo.lancements().length === 2);
  assert.deepEqual(rate.visees(), [version, corrigee]);
  assert.deepEqual(passe.visees(), [version, corrigee]);
});

test("le clone est commun à la box : un geste qui le trouve tenu par celui d'un autre projet rend 69 sans avoir rien essayé — la version n'a pas raté, elle est réessayée seule, et l'attente double si le clone l'empêche encore", async (t) => {
  const { premiere, livrer, heure, projet } = box(t);
  const [empeche, autre] = [projet("empeche"), projet("autre")];
  empeche.demarrerSur(premiere);
  autre.demarrerSur(premiere);
  await jusqua(() => empeche.comparee()?.outcome === "current" && autre.comparee()?.outcome === "current");

  // Le geste de l'autre projet met le clone à jour à cet instant : celui-ci
  // n'a pas pu le faire, et n'a rien basculé.
  const lignes = [
    "error: cannot lock ref 'refs/remotes/origin/v2': is at 0000000 but expected 1111111",
    "brigade-mise-en-service : le clone (/opt/brigade) n'a pas pu être mis à jour depuis son origine (`git pull --ff-only` rend 1, ses mots sont au-dessus) — rien n'a été basculé, la version en service de « empeche » n'a pas bougé",
  ];
  empeche.sudo.dire(69, lignes);
  const version = livrer();
  await jusqua(() => types(empeche.journal(), "deploy.exited").length === 1);
  await jusqua(() => autre.sudo.lancements().length === 1);
  const empecheLe = heure.maintenant().getTime();

  // La version n'a pas raté : la file dit l'empêchement, et quand elle se refait.
  assert.equal(dejaRatee(empeche.journal().base, version), false);
  assert.match(
    empeche.ligneVersion() ?? "",
    new RegExp(`^  version  depuis .+?  ${echappe(`essai de ${sha(version)} raté à ${hhmm(empecheLe)} : le geste de box a rendu 69 (le clone de brigade n'a pas pu être mis à jour) — « ${lignes[1]} » — ${sha(premiere)} reste en service ; la version n'y est pour rien — le clone est celui de toute la box —, elle est réessayée seule à ${hhmm(empecheLe + REESSAI_DU_CLONE_MS)}`)}$`),
  );
  // Pas avant son heure.
  heure.avancer(REESSAI_DU_CLONE_MS - 1_000);
  await ticks(empeche.journal(), 10);
  assert.equal(empeche.sudo.lancements().length, 1);

  // L'autre projet passe pendant ce temps : il ne l'attend pas.
  basculer(autre, version);
  assert.deepEqual(autre.conclusions(), [{ outcome: "served", served: version }]);

  // Son heure venue, la même version est réessayée — empêchée encore, l'attente double.
  heure.avancer(1_000);
  await jusqua(() => empeche.sudo.lancements().length === 2);
  await jusqua(() => types(empeche.journal(), "deploy.exited").length === 2);
  const encoreLe = heure.maintenant().getTime();
  assert.match(empeche.ligneVersion() ?? "", new RegExp(`réessayée seule à ${hhmm(encoreLe + 2 * REESSAI_DU_CLONE_MS)}$`));
  heure.avancer(REESSAI_DU_CLONE_MS);
  await ticks(empeche.journal(), 10);
  assert.equal(empeche.sudo.lancements().length, 2);

  // Le clone libre, l'essai passe.
  empeche.sudo.regler("attend");
  heure.avancer(REESSAI_DU_CLONE_MS);
  await jusqua(() => empeche.sudo.lancements().length === 3);
  assert.deepEqual(empeche.visees(), [version, version, version]);
  basculer(empeche, version);
  assert.deepEqual(empeche.conclusions(), [{ outcome: "served", served: version }]);
  await jusqua(() => empeche.comparee()?.outcome === "current");
});
