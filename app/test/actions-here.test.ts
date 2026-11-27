// Les gestes de la cuisine d'un projet qui cuit sur cet ordinateur (#1123) : arrêter et reprendre
// la cuisine, merger une livraison, vérifier l'installation. Ils
// partent au geste de la station de ce poste, ici.
//
// Chaque commande écrite dans le second est jouée pour de bon, par un `sh`, comme le `!` du second
// la jouerait : un faux `node` y joue le geste de la station — il note ce qu'il a reçu et tient
// l'état de la cuisine.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { confirmationOf } from "../src/confirmation.ts";
import { ACTION, launchThe, openStandby, type Kitchen, type Reading, type Locale } from "../src/box.ts";
import type { Project } from "../src/config.ts";
import { commandOfAction, writeAction } from "../src/actions.ts";
import { JUDGMENT, holdServices, type Guide } from "../src/service.ts";
import type { Terminal } from "../src/terminals.ts";
import { WITHOUT_POSIX } from "./helpers/posix.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false };

// Un poste d'essai : la station de cet ordinateur — son répertoire, un runtime dont le chemin a un
// blanc, comme celui de l'app installée —, son faux `node`.
function workstation(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "brigade-app-gestes-ici-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  const runtime = join(root, "Brigade App", "runtime");
  const station = join(root, "station");
  const node = join(root, "node");
  for (const folder of [bin, runtime, station]) mkdirSync(folder, { recursive: true });
  // La cuisine tourne tant que rien ne l'arrête ; ce qui est rendu à `installation --json`, et son code.
  writeFileSync(join(root, "cuisine"), "running\n");
  writeFileSync(join(root, "code"), "0\n");
  writeFileSync(join(root, "sortie"), "");
  // Le faux geste de station : un mot reçu par ligne, puis ce que le runtime ferait de la commande.
  writeFileSync(
    node,
    `#!/bin/sh
{ printf 'pwd=%s\\n' "$PWD"; printf 'station=%s\\n' "$BRIGADE_STATION_DIR"; for mot in "$@"; do printf 'arg=%s\\n' "$mot"; done; printf -- '--\\n'; } >> '${root}/node-lance'
shift 2
case "$*" in
  "guardrails stop") echo stopped > '${root}/cuisine'; echo "brigade : the kitchen is stopped" ;;
  "guardrails resume") echo running > '${root}/cuisine'; echo "brigade : the kitchen is resumed" ;;
  status) printf 'cuisine    %s\\n' "$(cat '${root}/cuisine')" ;;
  "${JUDGMENT}") cat '${root}/sortie'; exit "$(cat '${root}/code')" ;;
  *) echo "brigade : $*" ;;
esac
`,
  );
  chmodSync(node, 0o755);
  const locale: Locale = { node, runtime, racine: station, env: { PATH: `${bin}:${process.env.PATH ?? ""}` } };
  const readOne = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : "");
  // Ce qu'a reçu chaque geste lancé ici : son dossier, la station, et ses mots.
  const launched = () =>
    readOne("node-lance")
      .split("--\n")
      .filter(Boolean)
      .map((block) => {
        const lines = block.split("\n").filter(Boolean);
        return { pwd: lines[0]?.slice(4), station: lines[1]?.slice(8), args: lines.slice(2).map((line) => line.slice(4)) };
      });
  // Une commande écrite dans le second, jouée comme son `!` la jouerait : par un shell du poste.
  const play = (writtenOne: string) => {
    assert.ok(writtenOne.startsWith("!"), writtenOne);
    return execFileSync("/bin/sh", ["-c", writtenOne.slice(1)], { cwd: root, env: locale.env, encoding: "utf8" });
  };
  const reply = (output: string, code: number) => {
    writeFileSync(join(root, "sortie"), output);
    writeFileSync(join(root, "code"), `${code}\n`);
  };
  return { racine: root, locale, ici: { locale } as Kitchen, lu: readOne, lances: launched, jouer: play, repondre: reply };
}

// Le verdict d'une vérification qui a planté, tel que `installation --json` l'écrivait
// (`verdictDeLaPanne` de runtime/src/verdict.ts, supprimé avec l'ancien runtime, #4499).
const CRASHED_VERDICT = {
  verdict: "plantee",
  phrase: "la vérification n'a pas pu aller au bout : c'est un problème de brigade, pas de ton projet — une panne pas encore connue, tu n'as rien à faire",
  panne: { erreur: "the journal is unreadable", connue: null, acteur: "brigade", rienAFaire: true },
  manques: [],
  aSavoir: [],
  brut: "brigade : the journal is unreadable\n",
};

// Un projet que la station de cet ordinateur sert.
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };

// Un registre témoin : ce qui est envoyé dans le second.
function witness() {
  const writtenOnes: string[] = [];
  return { ecrits: writtenOnes, terminaux: { envoyer: async (_: Project, command: string) => (writtenOnes.push(command), SECOND) } };
}

// Le geste de la station, tel que le faux `node` l'a reçu : depuis le runtime, avec la station.
const received = (trial: ReturnType<typeof workstation>, ...suite: string[]) => ({ pwd: trial.locale.runtime, station: trial.locale.racine, args: [ACTION, "parade", ...suite] });

describe("les gestes d'un projet qui cuit sur cet ordinateur partent ici", () => {
  test("arrêter la cuisine puis la reprendre : le geste de la station les joue ici, et le rail le dit à la lecture suivante", { skip: WITHOUT_POSIX }, async (t) => {
    const trial = workstation(t);
    const readings: Reading[] = [];
    let expected: (() => void) | undefined;
    const standby = openStandby({
      intervalleMs: 3_600_000,
      delaiMs: 60_000,
      cuisine: () => trial.ici,
      surLecture: (reading) => {
        readings.push(reading);
        expected?.();
      },
    });
    t.after(() => standby.fermer());
    // La lecture de cette demande-là : celle d'après le geste, pas une d'avant.
    const read = async (request: number) => {
      standby.regarder([PARADE], ["status"], request);
      for (;;) {
        const readEntry = readings.find((reading) => reading.demande === request);
        if (readEntry !== undefined) return "sorties" in readEntry ? readEntry.sorties.map(({ texte: text }) => text).join("") : assert.fail(readEntry.erreur);
        await new Promise<void>((resolve) => (expected = resolve));
      }
    };
    assert.equal(await read(1), "cuisine    running\n");

    const { ecrits: writtenOnes, terminaux: terminals } = witness();
    // Confirmé : sans le « oui », rien ne part.
    assert.match((writeAction(terminals, "stop", PARADE, undefined, trial.ici) as { refus: string }).refus, /^nothing was sent: this action waits for your “yes”/);
    assert.equal(writtenOnes.length, 0);

    assert.deepEqual(await writeAction(terminals, "stop", PARADE, true, trial.ici), SECOND);
    assert.equal(trial.jouer(writtenOnes[0] as string), "brigade : the kitchen is stopped\n");
    assert.equal(await read(2), "cuisine    stopped\n");

    assert.deepEqual(await writeAction(terminals, "reprendre", PARADE, true, trial.ici), SECOND);
    assert.equal(trial.jouer(writtenOnes[1] as string), "brigade : the kitchen is resumed\n");
    assert.equal(await read(3), "cuisine    running\n");

    assert.deepEqual(
      trial.lances().filter(({ args }) => args.at(-1) !== "status"),
      [received(trial, "guardrails", "stop"), received(trial, "guardrails", "resume")],
    );
  });

  test("un geste confirmé s'offre à confirmer pour un projet servi ici : arrêter, reprendre, allumer le projet", (t) => {
    const trial = workstation(t);
    for (const id of ["stop", "reprendre", "projet-allumer"]) {
      const offered = confirmationOf(id, PARADE, { sans: "pas lus" }, trial.ici);
      assert.ok(offered !== undefined && !("refus" in offered), `${id} : ${JSON.stringify(offered)}`);
      // Son « oui » est celui du geste qu'elle confirme : c'est lui que la vue renvoie.
      assert.deepEqual(offered.choix.map(({ id }) => id), [id]);
    }
    // Sans dire où la cuisine tourne, il n'y aurait rien à confirmer — ni à arrêter.
    assert.equal(confirmationOf("stop", PARADE, { sans: "pas lus" }, undefined), undefined);
  });

  test("vérifier l'installation : lancée ici, elle rend le verdict — et l'erreur — du geste de la station", { skip: WITHOUT_POSIX }, async (t) => {
    const trial = workstation(t);
    const checks = async () => {
      const guides: Guide[] = [];
      const services = holdServices({
        delaiMs: 60_000,
        lancer: (readOne, command) => launchThe({ delaiMs: 60_000 }, readOne, command),
        cuisine: () => trial.ici,
        session: () => SECOND,
        shell: () => SECOND,
        surGuide: (guide) => void guides.push(guide),
      });
      assert.equal(await services.verifier(PARADE), undefined);
      const { verification } = guides.at(-1) ?? assert.fail("aucune installation poussée");
      return verification ?? assert.fail("aucune vérification poussée");
    };

    // Un verdict : la vérification a planté — tel que l'ancien runtime l'écrivait (`verdictDeLaPanne`).
    trial.repondre(JSON.stringify(CRASHED_VERDICT), 1);
    const here = await checks();
    assert.equal(here.etat, "plantee");
    // La veille et la vérification lancent le geste par son chemin entier, comme `lancerIci`.
    assert.deepEqual(trial.lances(), [{ ...received(trial, "installation", "--json"), args: [join(trial.locale.runtime, ACTION), "parade", "installation", "--json"] }]);

    // Une erreur : le geste refuse de lancer le runtime (70) — dite en une ligne.
    trial.repondre("", 70);
    const refusal = await checks();
    assert.equal(refusal.etat, "sans-verdict");
    assert.deepEqual("echec" in refusal ? { ...refusal.echec, erreur: "" } : undefined, { erreur: "", atteinte: true, cas: "node-inapte" });
  });
});

describe("sans cuisine", () => {
  test("une cuisine qui n'est nulle part n'a rien à écrire", () => {
    assert.equal(commandOfAction("stop", PARADE, undefined), undefined);
  });
});
