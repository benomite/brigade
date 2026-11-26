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
import { verdictDeLaPanne } from "../../runtime/src/verdict.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { ACTION, lancerLa, ouvrirStandby, type Kitchen, type Read, type Locale } from "../src/box.ts";
import type { Project } from "../src/config.ts";
import { commandDuAction, ecrireAction } from "../src/actions.ts";
import { JUGEMENT, holdServices, type Guide } from "../src/service.ts";
import type { Terminal } from "../src/terminaux.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false };

// Un poste d'essai : la station de cet ordinateur — son répertoire, un runtime dont le chemin a un
// blanc, comme celui de l'app installée —, son faux `node`.
function workstation(t: TestContext) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-gestes-ici-"));
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const bin = join(racine, "bin");
  const runtime = join(racine, "Brigade App", "runtime");
  const station = join(racine, "station");
  const node = join(racine, "node");
  for (const dossier of [bin, runtime, station]) mkdirSync(dossier, { recursive: true });
  // La cuisine tourne tant que rien ne l'arrête ; ce qui est rendu à `installation --json`, et son code.
  writeFileSync(join(racine, "cuisine"), "running\n");
  writeFileSync(join(racine, "code"), "0\n");
  writeFileSync(join(racine, "sortie"), "");
  // Le faux geste de station : un mot reçu par ligne, puis ce que le runtime ferait de la commande.
  writeFileSync(
    node,
    `#!/bin/sh
{ printf 'pwd=%s\\n' "$PWD"; printf 'station=%s\\n' "$BRIGADE_STATION_DIR"; for mot in "$@"; do printf 'arg=%s\\n' "$mot"; done; printf -- '--\\n'; } >> '${racine}/node-lance'
shift 2
case "$*" in
  "guardrails stop") echo stopped > '${racine}/kitchen'; echo "brigade : the kitchen is stopped" ;;
  "guardrails resume") echo running > '${racine}/kitchen'; echo "brigade : the kitchen is resumed" ;;
  status) printf 'cuisine    %s\\n' "$(cat '${racine}/kitchen')" ;;
  "${JUGEMENT}") cat '${racine}/sortie'; exit "$(cat '${racine}/code')" ;;
  *) echo "brigade : $*" ;;
esac
`,
  );
  chmodSync(node, 0o755);
  const locale: Locale = { node, runtime, racine: station, env: { PATH: `${bin}:${process.env.PATH ?? ""}` } };
  const lu = (name: string) => (existsSync(join(racine, name)) ? readFileSync(join(racine, name), "utf8") : "");
  // Ce qu'a reçu chaque geste lancé ici : son dossier, la station, et ses mots.
  const lances = () =>
    lu("node-lance")
      .split("--\n")
      .filter(Boolean)
      .map((bloc) => {
        const lines = bloc.split("\n").filter(Boolean);
        return { pwd: lines[0]?.slice(4), station: lines[1]?.slice(8), args: lines.slice(2).map((line) => line.slice(4)) };
      });
  // Une commande écrite dans le second, jouée comme son `!` la jouerait : par un shell du poste.
  const jouer = (ecrite: string) => {
    assert.ok(ecrite.startsWith("!"), ecrite);
    return execFileSync("/bin/sh", ["-c", ecrite.slice(1)], { cwd: racine, env: locale.env, encoding: "utf8" });
  };
  const repondre = (sortie: string, code: number) => {
    writeFileSync(join(racine, "sortie"), sortie);
    writeFileSync(join(racine, "code"), `${code}\n`);
  };
  return { racine, locale, ici: { locale } as Kitchen, lu, lances, jouer, repondre };
}

// Un projet que la station de cet ordinateur sert.
const PARADE: Project = { nom: "parade", dossier: "/tmp/parade" };

// Un registre témoin : ce qui est envoyé dans le second.
function temoin() {
  const ecrits: string[] = [];
  return { ecrits, terminaux: { envoyer: async (_: Project, command: string) => (ecrits.push(command), SECOND) } };
}

// Le geste de la station, tel que le faux `node` l'a reçu : depuis le runtime, avec la station.
const recu = (trial: ReturnType<typeof workstation>, ...suite: string[]) => ({ pwd: trial.locale.runtime, station: trial.locale.racine, args: [ACTION, "parade", ...suite] });

describe("les gestes d'un projet qui cuit sur cet ordinateur partent ici", () => {
  test("arrêter la cuisine puis la reprendre : le geste de la station les joue ici, et le rail le dit à la lecture suivante", { skip: SANS_POSIX }, async (t) => {
    const trial = workstation(t);
    const lectures: Read[] = [];
    let attendue: (() => void) | undefined;
    const standby = ouvrirStandby({
      intervalleMs: 3_600_000,
      delaiMs: 60_000,
      cuisine: () => trial.ici,
      surLecture: (read) => {
        lectures.push(read);
        attendue?.();
      },
    });
    t.after(() => standby.fermer());
    // La lecture de cette demande-là : celle d'après le geste, pas une d'avant.
    const lire = async (request: number) => {
      standby.regarder([PARADE], ["status"], request);
      for (;;) {
        const lue = lectures.find((read) => read.demande === request);
        if (lue !== undefined) return "sorties" in lue ? lue.sorties.map(({ texte }) => texte).join("") : assert.fail(lue.erreur);
        await new Promise<void>((resoudre) => (attendue = resoudre));
      }
    };
    assert.equal(await lire(1), "cuisine    running\n");

    const { ecrits, terminaux } = temoin();
    // Confirmé : sans le « oui », rien ne part.
    assert.match((ecrireAction(terminaux, "stop", PARADE, undefined, trial.ici) as { refus: string }).refus, /^nothing was sent: this action waits for your “yes”/);
    assert.equal(ecrits.length, 0);

    assert.deepEqual(await ecrireAction(terminaux, "stop", PARADE, true, trial.ici), SECOND);
    assert.equal(trial.jouer(ecrits[0] as string), "brigade : the kitchen is stopped\n");
    assert.equal(await lire(2), "cuisine    stopped\n");

    assert.deepEqual(await ecrireAction(terminaux, "reprendre", PARADE, true, trial.ici), SECOND);
    assert.equal(trial.jouer(ecrits[1] as string), "brigade : the kitchen is resumed\n");
    assert.equal(await lire(3), "cuisine    running\n");

    assert.deepEqual(
      trial.lances().filter(({ args }) => args.at(-1) !== "status"),
      [recu(trial, "guardrails", "stop"), recu(trial, "guardrails", "resume")],
    );
  });

  test("un geste confirmé s'offre à confirmer pour un projet servi ici : arrêter, reprendre, allumer le projet", (t) => {
    const trial = workstation(t);
    for (const id of ["stop", "reprendre", "projet-allumer"]) {
      const offerte = confirmationDe(id, PARADE, { sans: "pas lus" }, trial.ici);
      assert.ok(offerte !== undefined && !("refus" in offerte), `${id} : ${JSON.stringify(offerte)}`);
      // Son « oui » est celui du geste qu'elle confirme : c'est lui que la vue renvoie.
      assert.deepEqual(offerte.choix.map(({ id }) => id), [id]);
    }
    // Sans dire où la cuisine tourne, il n'y aurait rien à confirmer — ni à arrêter.
    assert.equal(confirmationDe("stop", PARADE, { sans: "pas lus" }, undefined), undefined);
  });

  test("vérifier l'installation : lancée ici, elle rend le verdict — et l'erreur — du geste de la station", { skip: SANS_POSIX }, async (t) => {
    const trial = workstation(t);
    const verifie = async () => {
      const guides: Guide[] = [];
      const services = holdServices({
        delaiMs: 60_000,
        lancer: (lu, command) => lancerLa({ delaiMs: 60_000 }, lu, command),
        cuisine: () => trial.ici,
        session: () => SECOND,
        shell: () => SECOND,
        surGuide: (guide) => void guides.push(guide),
      });
      assert.equal(await services.verifier(PARADE), undefined);
      const { verification } = guides.at(-1) ?? assert.fail("aucune installation poussée");
      return verification ?? assert.fail("aucune vérification poussée");
    };

    // Un verdict : la vérification a planté.
    trial.repondre(JSON.stringify(verdictDeLaPanne(new Error("the journal is unreadable"))), 1);
    const ici = await verifie();
    assert.equal(ici.etat, "plantee");
    // La veille et la vérification lancent le geste par son chemin entier, comme `lancerIci`.
    assert.deepEqual(trial.lances(), [{ ...recu(trial, "installation", "--json"), args: [join(trial.locale.runtime, ACTION), "parade", "installation", "--json"] }]);

    // Une erreur : le geste refuse de lancer le runtime (70) — dite en une ligne.
    trial.repondre("", 70);
    const refusal = await verifie();
    assert.equal(refusal.etat, "sans-verdict");
    assert.deepEqual("echec" in refusal ? { ...refusal.echec, erreur: "" } : undefined, { erreur: "", atteinte: true, cas: "node-inapte" });
  });
});

describe("sans cuisine", () => {
  test("une cuisine qui n'est nulle part n'a rien à écrire", () => {
    assert.equal(commandDuAction("stop", PARADE, undefined), undefined);
  });
});
