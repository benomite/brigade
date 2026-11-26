// La passation d'une carte de TODO au second (#3133) : un premier message, sur une ligne et sans Entrée, qui porte le
// numéro de l'issue, la question de la carte — ou « no question found on #N » — et ce que l'issue dit : son titre et
// son dernier message utile. Une issue illisible n'empêche rien : le message le dit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import type { Discussion } from "../src/discussion.ts";
import { blocsEnTexte, LONGUEUR_DU_MESSAGE, noteDeLaPassation, passation, passerAuSecond } from "../src/passation-second.ts";
import { rendre } from "../src/markdown.ts";
import { discussionDe } from "./aides/fiches-dites.ts";

const RACINE = resolve(import.meta.dirname, "..", "..");
const PROJET = { nom: "parade", dossier: "/tmp/parade" };
const QUESTION = "Should the CSV export carry the run column?";
const ISSUE: Discussion = discussionDe({
  issue: {
    title: "Export the journal as CSV",
    state: "open",
    body: { author: "benomite", at: "2026-11-01T09:00:00Z", body: "The chef wants the **journal** exported as CSV." },
    comments: [
      { author: "brigade", at: "2026-11-02T09:00:00Z", body: "The cook stopped: the columns are not decided.\n\nThe run column doubles the size." },
      { author: "brigade", at: "2026-11-03T09:00:00Z", body: `<!-- brigade:todo kind=product-question -->\n${QUESTION}\n- [resume] Yes\n- [close] No` },
      { author: "brigade", at: "2026-11-04T09:00:00Z", body: "<!-- brigade:fiche -->" },
    ],
  },
});

const inscrit = () => {
  const ecrits: string[] = [];
  return { ecrits, inscrire: (message: string) => (ecrits.push(message), { ecrit: true }) };
};

describe("la passation d'une carte au second (#3133)", () => {
  test("une carte ordinaire : le numéro, la question, le titre de l'issue et son dernier commentaire utile — sur une ligne", () => {
    const message = passation(41, QUESTION, ISSUE);
    assert.match(message, /^\/brigade:ask 41 /);
    assert.match(message, /#41/);
    assert.ok(message.includes(`Its question: “${QUESTION}”`), message);
    assert.ok(message.includes("Its issue: “Export the journal as CSV”."), message);
    // Le dernier commentaire qui dit quelque chose d'autre que la question déjà passée ; la fiche, vide, ne compte pas.
    assert.ok(message.includes("Its last relevant comment (brigade, 2026-11-02 09:00 UTC): “The cook stopped: the columns are not decided. The run column doubles the size.”"), message);
    assert.doesNotMatch(message, /[\x00-\x1f\x7f]/, "une ligne, sans Entrée ni caractère de contrôle");
  });

  test("une carte sans question : « no question found on #N », et toujours le numéro et ce que l'issue dit", () => {
    const message = passation(44, null, ISSUE);
    assert.match(message, /^\/brigade:ask 44 /);
    assert.ok(message.includes("Its question: no question found on #44."), message);
    assert.ok(message.includes("Its issue: “Export the journal as CSV”."), message);
    // Sans question passée, le commentaire de la carte est le dernier qui dit quelque chose.
    assert.ok(message.includes(`Its last relevant comment (brigade, 2026-11-03 09:00 UTC): “${QUESTION} - [resume] Yes - [close] No”`), message);
    assert.equal(passation(44, "  \n ", ISSUE), message, "une question vide n'en est pas une");
    assert.doesNotMatch(message, /[\x00-\x1f\x7f]/);
  });

  test("une issue sans commentaire utile donne son corps ; fermée, elle le dit ; un message trop long est coupé", () => {
    const seule: Discussion = { titre: "Solo", ouverte: false, messages: [{ auteur: "benomite", at: "2026-11-01 09:00 UTC", blocs: rendre(`Body ${"x".repeat(3000)}`), corps: true }], liens: [] };
    const message = passation(7, QUESTION, seule);
    assert.ok(message.includes("Its issue: “Solo” (closed)."), message);
    assert.match(message, /Its description \(benomite, 2026-11-01 09:00 UTC\): “Body x+…”/);
    assert.ok(message.length < LONGUEUR_DU_MESSAGE + 400);
  });

  test("une issue illisible ne retient pas la passation : le message dit pourquoi, sans rien inventer", () => {
    const message = passation(41, QUESTION, { sans: "not read: gh is not logged in" });
    assert.ok(message.includes(`Its question: “${QUESTION}”`));
    assert.ok(message.includes("Its issue could not be read (not read: gh is not logged in): read it yourself."), message);
    assert.doesNotMatch(message, /Its issue: “/);
  });

  test("le geste : l'issue lue, la passation écrite dans le second ; une lecture qui lève est dite dans le message", async () => {
    const { ecrits, inscrire } = inscrit();
    const lus: number[] = [];
    assert.deepEqual(await passerAuSecond(inscrire, async (ticket) => (lus.push(ticket), ISSUE), PROJET, 41, QUESTION), { ecrit: true });
    assert.deepEqual(lus, [41]);
    assert.deepEqual(ecrits, [passation(41, QUESTION, ISSUE)]);
    await passerAuSecond(inscrire, () => Promise.reject(new Error("gh: command not found")), PROJET, 44, null);
    assert.ok(ecrits[1]?.includes("no question found on #44") && ecrits[1].includes("could not be read (not read: gh: command not found)"), ecrits[1] ?? "");
  });

  test("ni ticket, ni projet qui s'ouvre : rien n'est lu ni écrit, et pourquoi est dit", async () => {
    const { ecrits, inscrire } = inscrit();
    const lire = () => assert.fail("rien n'est lu");
    assert.deepEqual(await passerAuSecond(inscrire, lire, PROJET, "41", QUESTION), { refus: "nothing was written: the card names no ticket" });
    assert.deepEqual(await passerAuSecond(inscrire, lire, { ...PROJET, refus: "illisible" }, 41, QUESTION), { refus: "nothing was written: “parade” does not open — illisible" });
    assert.deepEqual(ecrits, []);
  });

  test("le texte d'un message rendu, sans sa mise en forme", () => {
    assert.equal(blocsEnTexte(rendre("# Title\n\n- **one**\n- `two`\n\n> [link](https://x.y)\n\n```\ncode\n```")), "Title - one - two link code");
    assert.match(noteDeLaPassation(), /without Enter/);
    assert.match(noteDeLaPassation(true), /dialogue/);
  });

  test("le canal du process principal lit l'issue de GitHub et écrit dans le second du projet, et le pont l'expose", () => {
    const main = readFileSync(join(RACINE, "app/src/main.ts"), "utf8");
    const canal = /ipcMain\.handle\("passerAuSecond"[\s\S]*?\n\}\);/.exec(main)?.[0] ?? assert.fail("pas de canal « passerAuSecond »");
    assert.match(canal, /discussionDeGitHub\(reglagesGh\(\), await depotDuProjet\(vise\), numero\)/);
    assert.match(canal, /passerAuSecond\(\(message\) => terminaux\.inscrire\(vise, message, noteDeLaPassation\), lire, vise, ticket, question\)/);
    assert.match(readFileSync(join(RACINE, "app/src/preload.cjs"), "utf8"), /passerAuSecond: \(projet, ticket, question\) => ipcRenderer\.invoke\("passerAuSecond", projet, ticket, question\)/);
  });
});
