// #4047 : la commande `send-word` — l'état du ticket lu sur son issue, le mot
// posté et mis en file, et sa réponse en une ligne JSON.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Sortie, type Appel } from "../../src/appel.ts";
import { principal } from "../../src/mot-au-cook/commande.ts";
import { fileSurDisque } from "../../src/mot-au-cook/file.ts";
import { creerMotAuCook, type FileDesMots } from "../../src/mot-au-cook/mot-au-cook.ts";
import { appeler, DEPOT, fauxGh, issueGitHub } from "../outils.ts";

type OuvrirGitHub = NonNullable<Parameters<typeof principal>[1]>;

const racine = mkdtempSync(join(tmpdir(), "mot-au-cook-commande-"));
after(() => rmSync(racine, { recursive: true, force: true }));
let n = 0;

type Issue = { state: "open" | "closed"; labels: string[] } | null;
function jouer(args: string[], issue: Issue | Error, options: { commenter?: Error; etat?: boolean } = {}) {
  const repertoireEtat = join(racine, `etat-${(n += 1)}`);
  const sortie: string[] = [];
  const erreur: string[] = [];
  const commentaires: { numero: number; corps: string }[] = [];
  const depots: string[] = [];
  let ferme = false;
  const ouvrir: OuvrirGitHub = (depot) => {
    depots.push(depot);
    return {
      issue: async () => {
        if (issue instanceof Error) throw issue;
        return issue;
      },
      commenter: async (numero, corps) => {
        if (options.commenter) throw options.commenter;
        commentaires.push({ numero, corps });
      },
      fermer: () => void (ferme = true),
    };
  };
  const appel: Appel = { args, env: options.etat === false ? {} : { BRIGADE_STATE_DIR: repertoireEtat }, dire: (ligne) => sortie.push(ligne), redire: (ligne) => erreur.push(ligne) };
  const fin = (async () => {
    try {
      await principal(appel, ouvrir);
      return 0;
    } catch (e) {
      if (e instanceof Sortie) return e.code;
      throw e;
    }
  })();
  return { fin, sortie, erreur, commentaires, depots, ferme: () => ferme, file: () => fileSurDisque(repertoireEtat).prendre(7), repertoireEtat };
}

test("send-word on a taken ticket posts the word on its issue, queues it and answers ok on one JSON line", async () => {
  const jeu = jouer(["benomite/brigade#7", "use", "the", "small", "table"], { state: "open", labels: ["fire", "taken"] });
  assert.equal(await jeu.fin, 0);
  assert.deepEqual(jeu.sortie, ['{"ok":true}']);
  assert.deepEqual(jeu.depots, ["benomite/brigade"]);
  assert.equal(jeu.commentaires.length, 1);
  assert.equal(jeu.commentaires[0]?.numero, 7);
  assert.ok(jeu.commentaires[0]?.corps.startsWith("<!-- brigade:mot-au-cook -->"));
  assert.match(jeu.commentaires[0]?.corps ?? "", /> use the small table$/);
  assert.deepEqual(jeu.file(), ["use the small table"]);
  assert.equal(jeu.ferme(), true);
});

test("send-word on a ticket that is not taken answers ok false with its reason, posts and queues nothing", async () => {
  const cas: [Issue, RegExp][] = [
    [{ state: "open", labels: ["in-pass"] }, /^#7 is in pass: no cook is cooking it/],
    [{ state: "closed", labels: [] }, /^#7 is closed \(served or dropped\)/],
    [null, /^#7 is unknown/],
    [{ state: "open", labels: ["parked"] }, /^#7 is parked: it waits for someone/],
    [{ state: "open", labels: ["fire"] }, /^#7 is not taken/],
    [{ state: "open", labels: ["taken", "in-pass"] }, /^#7 is in pass/],
    [{ state: "open", labels: ["taken", "parked"] }, /^#7 is parked/],
    [{ state: "closed", labels: ["taken"] }, /^#7 is closed/],
  ];
  for (const [issue, raison] of cas) {
    const jeu = jouer(["benomite/brigade#7", "hello"], issue);
    assert.equal(await jeu.fin, 1);
    assert.equal(jeu.sortie.length, 1);
    const reponse = JSON.parse(jeu.sortie[0] ?? "");
    assert.equal(reponse.ok, false);
    assert.match(reponse.reason, raison);
    assert.equal(jeu.commentaires.length, 0);
    assert.equal(existsSync(join(jeu.repertoireEtat, "mots-au-cook")), false);
    assert.equal(jeu.ferme(), true);
  }
});

test("an issue that cannot be read, or a comment that cannot be posted, answers ok false on one line and queues nothing", async () => {
  const illisible = jouer(["benomite/brigade#7", "hello"], new Error("HTTP 502\nbad gateway"));
  assert.equal(await illisible.fin, 1);
  assert.deepEqual(JSON.parse(illisible.sortie[0] ?? ""), { ok: false, reason: "the state of #7 could not be read: HTTP 502 bad gateway" });
  const refuse = jouer(["benomite/brigade#7", "hello"], { state: "open", labels: ["taken"] }, { commenter: new Error("HTTP 403") });
  assert.equal(await refuse.fin, 1);
  assert.deepEqual(JSON.parse(refuse.sortie[0] ?? ""), { ok: false, reason: "the word could not be posted on #7, nothing is queued: HTTP 403" });
  assert.deepEqual(refuse.file(), []);
});

test("send-word without its state directory, its ticket or its word is refused with its usage", async () => {
  for (const [args, etat] of [[["benomite/brigade#7", "hello"], false], [[], true], [["7", "hello"], true], [["benomite/brigade#7"], true]] as const) {
    const jeu = jouer([...args], { state: "open", labels: ["taken"] }, { etat });
    assert.equal(await jeu.fin, 2);
    assert.match(jeu.erreur.join("\n"), /usage: BRIGADE_STATE_DIR=<state directory> npm --prefix runtime run send-word/);
    assert.equal(jeu.commentaires.length, 0);
    assert.deepEqual(jeu.depots, []);
    assert.equal(/the ticket is named/.test(jeu.erreur.join("\n")), args.length > 0 && etat, "a ticket badly named is told how to name it");
  }
});

test("a word that is empty, more than one line, or for no ticket number is refused before anything is read", async () => {
  const lus: number[] = [];
  const mot = creerMotAuCook({ etat: (ticket) => (lus.push(ticket), "taken"), commenter: async () => assert.fail("posted"), livrer: () => {} });
  assert.deepEqual(await mot.envoyer({ ticket: 7, text: "  " }), { ok: false, reason: "the word is empty: write one line of text" });
  assert.deepEqual(await mot.envoyer({ ticket: 7, text: "one\ntwo" }), { ok: false, reason: "the word is one line of text: it has a line break" });
  assert.deepEqual(await mot.envoyer({ ticket: 0, text: "hello" }), { ok: false, reason: "the ticket is a number, from 1: “0”" });
  assert.deepEqual(await mot.envoyer({ ticket: 1.5, text: "hello" }), { ok: false, reason: "the ticket is a number, from 1: “1.5”" });
  assert.deepEqual(lus, []);
});

test("a word posted that cannot be queued says so on one line", async () => {
  const casse: FileDesMots = { ajouter: () => { throw new Error("disk full"); }, prendre: () => [] };
  const mot = creerMotAuCook({ etat: () => "taken", commenter: async () => {}, livrer: () => {}, file: casse });
  assert.deepEqual(await mot.envoyer({ ticket: 7, text: "hello" }), { ok: false, reason: "the word is posted on #7 but could not be queued for its cook: disk full" });
});

test("send-word talks to GitHub through the gh the station names in BRIGADE_GH_BIN", async (t) => {
  const gh = fauxGh(t);
  gh.issues([issueGitHub(7, { labels: ["fire", "taken"] })]);
  gh.repondre(`repos/${DEPOT}/issues/7/comments`, { statut: 201, corps: {} });
  const repertoireEtat = join(racine, `etat-${(n += 1)}`);
  const jeu = appeler(principal, [`${DEPOT}#7`, "use", "the", "small", "table"], { BRIGADE_STATE_DIR: repertoireEtat, BRIGADE_GH_BIN: gh.bin });
  assert.equal(await jeu.fin, 0, jeu.sortie());
  assert.equal(jeu.sortie(), '{"ok":true}\n');
  assert.ok(gh.appels().some((args) => args.includes(`repos/${DEPOT}/issues/7/comments`)), JSON.stringify(gh.appels()));
  assert.deepEqual(fileSurDisque(repertoireEtat).prendre(7), ["use the small table"]);
});
