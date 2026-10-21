// Les gestes de la cuisine d'un projet qui cuit sur cet ordinateur (#1123) : arrêter et reprendre
// la cuisine, accorder et révoquer un grant, merger une livraison, vérifier l'installation. Ils
// partent au geste de la station de ce poste, ici, sans `ssh` — avec le même effet et le même
// retour que sur une box. Les mêmes gestes sur un projet servi par une box partent toujours par `ssh`.
//
// Chaque commande écrite dans le second est jouée pour de bon, par un `sh`, comme le `!` du second
// la jouerait : un faux `node` y joue le geste de la station — il note ce qu'il a reçu et tient
// l'état de la cuisine —, et un faux `ssh`, en tête du PATH, laisse sa marque s'il est lancé.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { verdictDeLaPanne } from "../../runtime/src/verdict.ts";
import { commandeDAttente, ecrireAttente } from "../src/attente.ts";
import { confirmationDe } from "../src/confirmation.ts";
import { GESTE, lancerLa, ouvrirVeille, type Cuisine, type Lecture, type Locale } from "../src/box.ts";
import type { Projet } from "../src/config.ts";
import { jouerGesteDeFiche } from "../src/gestes-fiche.ts";
import { commandeDuGeste, ecrireGeste } from "../src/gestes.ts";
import { JUGEMENT, tenirServices, type Guide } from "../src/service.ts";
import type { Terminal } from "../src/terminaux.ts";
import { SANS_POSIX } from "./aides/posix.ts";

const SECOND: Terminal = { id: 1, projet: "parade", genre: "second", titre: "Second", note: "", arrete: false };

// Un poste d'essai : la station de cet ordinateur — son répertoire, un runtime dont le chemin a un
// blanc, comme celui de l'app installée —, son faux `node`, et le faux `ssh` qui laisse sa marque.
function poste(t: TestContext) {
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
  "guardrails stop") echo stopped > '${racine}/cuisine'; echo "brigade : the kitchen is stopped" ;;
  "guardrails resume") echo running > '${racine}/cuisine'; echo "brigade : the kitchen is resumed" ;;
  status) printf 'cuisine    %s\\n' "$(cat '${racine}/cuisine')" ;;
  "${JUGEMENT}") cat '${racine}/sortie'; exit "$(cat '${racine}/code')" ;;
  *) echo "brigade : $*" ;;
esac
`,
  );
  // Le faux `ssh` : sa marque, et la même réponse qu'une box à `installation --json`.
  const ssh = join(bin, "ssh");
  writeFileSync(ssh, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${racine}/ssh-lance'\ncase "$*" in *" ${JUGEMENT}") cat '${racine}/sortie'; exit "$(cat '${racine}/code')" ;; esac\n`);
  chmodSync(node, 0o755);
  chmodSync(ssh, 0o755);
  const locale: Locale = { node, runtime, racine: station, env: { PATH: `${bin}:${process.env.PATH ?? ""}` } };
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : "");
  // Ce qu'a reçu chaque geste lancé ici : son dossier, la station, et ses mots.
  const lances = () =>
    lu("node-lance")
      .split("--\n")
      .filter(Boolean)
      .map((bloc) => {
        const lignes = bloc.split("\n").filter(Boolean);
        return { pwd: lignes[0]?.slice(4), station: lignes[1]?.slice(8), args: lignes.slice(2).map((ligne) => ligne.slice(4)) };
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
  return { racine, ssh, locale, ici: { locale } as Cuisine, lu, lances, jouer, repondre };
}

// Un projet sans `hote`, que la station de cet ordinateur sert — et un qui en garde un.
const PARADE: Projet = { nom: "parade", dossier: "/tmp/parade" };
const AVEC_HOTE: Projet = { ...PARADE, box: { hote: "box" } };

// Un registre témoin : ce qui est envoyé dans le second.
function temoin() {
  const ecrits: string[] = [];
  return { ecrits, terminaux: { envoyer: async (_: Projet, commande: string) => (ecrits.push(commande), SECOND) } };
}

// Le geste de la station, tel que le faux `node` l'a reçu : depuis le runtime, avec la station.
const recu = (essai: ReturnType<typeof poste>, ...suite: string[]) => ({ pwd: essai.locale.runtime, station: essai.locale.racine, args: [GESTE, "parade", ...suite] });

describe("les gestes d'un projet qui cuit sur cet ordinateur partent ici, sans ssh", () => {
  test("arrêter la cuisine puis la reprendre : le geste de la station les joue ici, et le rail le dit à la lecture suivante", { skip: SANS_POSIX }, async (t) => {
    const essai = poste(t);
    const lectures: Lecture[] = [];
    let attendue: (() => void) | undefined;
    const veille = ouvrirVeille({
      ssh: essai.ssh,
      intervalleMs: 3_600_000,
      delaiMs: 60_000,
      connexionS: 10,
      cuisine: () => essai.ici,
      surLecture: (lecture) => {
        lectures.push(lecture);
        attendue?.();
      },
    });
    t.after(() => veille.fermer());
    // La lecture de cette demande-là : celle d'après le geste, pas une d'avant.
    const lire = async (demande: number) => {
      veille.regarder([PARADE], ["status"], demande);
      for (;;) {
        const lue = lectures.find((lecture) => lecture.demande === demande);
        if (lue !== undefined) return "sorties" in lue ? lue.sorties.map(({ texte }) => texte).join("") : assert.fail(lue.erreur);
        await new Promise<void>((resoudre) => (attendue = resoudre));
      }
    };
    assert.equal(await lire(1), "cuisine    running\n");

    const { ecrits, terminaux } = temoin();
    // Confirmé : sans le « oui », rien ne part — ici comme sur une box.
    assert.match((ecrireGeste(terminaux, "stop", PARADE, undefined, undefined, essai.ici) as { refus: string }).refus, /^nothing was sent: this action waits for your “yes”/);
    assert.equal(ecrits.length, 0);

    assert.deepEqual(await ecrireGeste(terminaux, "stop", PARADE, undefined, true, essai.ici), SECOND);
    assert.equal(essai.jouer(ecrits[0] as string), "brigade : the kitchen is stopped\n");
    assert.equal(await lire(2), "cuisine    stopped\n");

    assert.deepEqual(await ecrireGeste(terminaux, "reprendre", PARADE, undefined, true, essai.ici), SECOND);
    assert.equal(essai.jouer(ecrits[1] as string), "brigade : the kitchen is resumed\n");
    assert.equal(await lire(3), "cuisine    running\n");

    assert.deepEqual(
      essai.lances().filter(({ args }) => args.at(-1) !== "status"),
      [recu(essai, "guardrails", "stop"), recu(essai, "guardrails", "resume")],
    );
    assert.equal(essai.lu("ssh-lance"), "", "aucun `ssh` n'a été lancé");
  });

  test("un geste confirmé s'offre à confirmer pour un projet sans « hote » servi ici : arrêter, reprendre, accorder et révoquer `merge`, allumer le manager", (t) => {
    const essai = poste(t);
    for (const [id, grant] of [["stop"], ["reprendre"], ["grant-activer", "merge"], ["grant-revoquer", "merge"], ["manager-allumer"]] as const) {
      const offerte = confirmationDe(id, PARADE, { sans: "pas lus" }, grant, essai.ici);
      assert.ok(offerte !== undefined && !("refus" in offerte), `${id} : ${JSON.stringify(offerte)}`);
      // Son « oui » est celui du geste qu'elle confirme : c'est lui que la vue renvoie.
      assert.deepEqual(offerte.choix.map(({ id }) => id), [id]);
    }
    // Sans dire où la cuisine tourne, un projet sans « hote » n'aurait rien à confirmer — ni à arrêter.
    assert.equal(confirmationDe("stop", PARADE, { sans: "pas lus" }), undefined);
  });

  test("accorder, révoquer le grant `merge` et merger une livraison : ici aussi, et un projet qui garde son « hote » n'y va pas", { skip: SANS_POSIX }, async (t) => {
    const essai = poste(t);
    const { ecrits, terminaux } = temoin();
    for (const projet of [PARADE, AVEC_HOTE]) {
      await ecrireGeste(terminaux, "grant-activer", projet, "merge", true, essai.ici);
      await ecrireGeste(terminaux, "grant-revoquer", projet, "merge", true, essai.ici);
      await jouerGesteDeFiche(terminaux, projet, "merger", 42, undefined, undefined, essai.ici);
    }
    for (const ecrite of ecrits) {
      assert.doesNotMatch(ecrite, /\bssh\b/);
      essai.jouer(ecrite);
    }
    const attendus = [recu(essai, "grant", "enable", "merge"), recu(essai, "grant", "revoke", "merge"), recu(essai, "rail", "merge", "42")];
    assert.deepEqual(essai.lances(), [...attendus, ...attendus]);
    assert.equal(essai.lu("ssh-lance"), "", "aucun `ssh` n'a été lancé");
  });

  test("ce que le chef tape passe un seul shell, ici : chaque mot arrive entier, et rien n'en est exécuté", { skip: SANS_POSIX }, async (t) => {
    const essai = poste(t);
    const { ecrits, terminaux } = temoin();
    const quoi = "the client's go — $(touch pris) `touch pris`";
    const qui = "Ana & Bo; touch pris";
    const ecrit = await ecrireAttente(terminaux, "attente-poser", PARADE, 7, { quoi, qui, relance: "2099-01-02" }, new Date(2026, 9, 20), essai.ici);
    assert.deepEqual(ecrit, SECOND);
    essai.jouer(ecrits[0] as string);
    assert.deepEqual(essai.lances(), [recu(essai, "waiting", "set", "7", "--what", quoi, "--from", qui, "--remind", "2099-01-02")]);
    assert.equal(existsSync(join(essai.racine, "pris")), false, "rien de ce que le chef a tapé n'a été exécuté");
    assert.equal(essai.lu("ssh-lance"), "");
  });

  test("vérifier l'installation : lancée ici, elle rend le même verdict — et la même erreur — que sur une box", { skip: SANS_POSIX }, async (t) => {
    const essai = poste(t);
    // Un service par lieu, branché comme dans le process principal : sur la box par `ssh`, ou ici.
    const verifie = async (cuisine: Cuisine, projet: Projet) => {
      const guides: Guide[] = [];
      const services = tenirServices({
        delaiMs: 60_000,
        lancer: (lu, commande) => lancerLa({ ssh: essai.ssh, delaiMs: 60_000, connexionS: 10 }, lu, commande),
        cuisine: () => cuisine,
        session: () => SECOND,
        shell: () => SECOND,
        surGuide: (guide) => void guides.push(guide),
      });
      assert.equal(await services.verifier(projet), undefined);
      const { verification } = guides.at(-1) ?? assert.fail("aucune installation poussée");
      return verification ?? assert.fail("aucune vérification poussée");
    };
    // Ce qui est dit, sans la ligne lancée — celle de `ssh`, ou celle du geste d'ici — ni l'heure.
    const sans = (vue: object) => {
      const { detail: _detail, echec: _echec, a: _a, ...reste } = vue as Record<string, unknown>;
      return reste;
    };

    // Un verdict : la vérification a planté, la même phrase des deux côtés.
    essai.repondre(JSON.stringify(verdictDeLaPanne(new Error("the journal is unreadable"))), 1);
    const ici = await verifie(essai.ici, PARADE);
    assert.equal(ici.etat, "plantee");
    assert.equal(essai.lu("ssh-lance"), "", "aucun `ssh` n'a été lancé ici");
    // La veille et la vérification lancent le geste par son chemin entier, comme `lancerIci`.
    assert.deepEqual(essai.lances(), [{ ...recu(essai, "installation", "--json"), args: [join(essai.locale.runtime, GESTE), "parade", "installation", "--json"] }]);
    const surLaBox = await verifie({ hote: "box" }, AVEC_HOTE);
    assert.match(essai.lu("ssh-lance"), /-- box brigade parade installation --json\n$/);
    assert.deepEqual(sans(ici), sans(surLaBox));

    // Une erreur : le geste refuse de lancer le runtime (70) — dite pareil, en une ligne.
    essai.repondre("", 70);
    const refusIci = await verifie(essai.ici, PARADE);
    const refusSurLaBox = await verifie({ hote: "box" }, AVEC_HOTE);
    assert.equal(refusIci.etat, "sans-verdict");
    assert.equal(refusIci.titre, refusSurLaBox.titre);
    assert.deepEqual("echec" in refusIci ? { ...refusIci.echec, erreur: "" } : undefined, { erreur: "", atteinte: true, cas: "node-inapte" });
    assert.equal(essai.lu("ssh-lance").split("\n").filter(Boolean).length, 2, "seules les vérifications de la box sont passées par `ssh`");
  });
});

describe("les mêmes gestes, sur un projet servi par une box, partent toujours par ssh", () => {
  test("la forme de poste ne change pas : `ssh <hote> brigade <nom> <commande>`, jouée par le `ssh` du poste", { skip: SANS_POSIX }, async (t) => {
    const essai = poste(t);
    const { ecrits, terminaux } = temoin();
    const box: Cuisine = { hote: "box" };
    await ecrireGeste(terminaux, "stop", AVEC_HOTE, undefined, true, box);
    await ecrireGeste(terminaux, "grant-activer", AVEC_HOTE, "merge", true);
    await jouerGesteDeFiche(terminaux, AVEC_HOTE, "merger", 42, undefined);
    assert.deepEqual(ecrits, ["!ssh box brigade parade guardrails stop", "!ssh box brigade parade grant enable merge", "!ssh box brigade parade rail merge 42"]);
    for (const ecrite of ecrits) essai.jouer(ecrite);
    assert.equal(essai.lu("ssh-lance"), "box brigade parade guardrails stop\nbox brigade parade grant enable merge\nbox brigade parade rail merge 42\n");
    assert.deepEqual(essai.lances(), []);
  });

  test("une cuisine qui n'est nulle part n'a rien à écrire, ici comme ailleurs", () => {
    assert.equal(commandeDuGeste("stop", PARADE), undefined);
    assert.equal(commandeDAttente("attente-reprendre", PARADE, 7), undefined);
  });
});
