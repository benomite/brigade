// La question qui t'attend, posée telle quelle (#681) : l'issue lue par le `gh` du poste, la
// question du manager prise mot pour mot, ses choix lus, et la réponse du chef postée sur l'issue —
// seulement s'il l'a choisie ou écrite, et seulement sur la question qu'il a lue. Contre un faux
// `gh` écrit par chaque test : ni réseau, ni GitHub.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { choixDe, type Commentaire, lireQuestion, MARQUEUR_MANAGER, MARQUEUR_QUESTION, questionDe, repondre } from "../src/question.ts";

const ISSUE = "https://github.com/benomite/brigade/issues/676";
const A = "2026-10-15T08:00:00Z";

// La question telle que le runtime l'écrit sur une épique (runtime/src/decoupage.ts, `asked`).
const QUESTION = [
  MARQUEUR_MANAGER,
  MARQUEUR_QUESTION,
  "**Manager — épique non découpée : une question.**",
  "",
  "Le popup remplace-t-il la fiche du ticket, ou s'ouvre-t-il par-dessus ? (a) il la remplace, (b) il s'ouvre par-dessus, ou (c) les deux selon la carte ?",
  "",
  "Réponds ici, ou édite l'épique : elle sera relue, et découpée si la réponse suffit.",
  "",
  "_Lu par le manager en `sonnet` / `medium` · 1 tour._",
].join("\n");
const TEXTE = QUESTION.split("\n").slice(2).join("\n");

const commentaire = (corps: string, champs: Partial<Commentaire> = {}): Commentaire => ({ auteur: "benomite", association: "OWNER", a: A, url: `${ISSUE}#issuecomment-1`, corps, ...champs });
// Un commentaire tel que `gh issue view --json comments` le rend.
const deGh = ({ auteur, association, a, url, corps }: Commentaire) => ({ author: { login: auteur }, authorAssociation: association, createdAt: a, url, body: corps });

describe("la question du manager, prise sur l'issue telle qu'elle est écrite", () => {
  test("c'est son dernier commentaire marqué question, sans ses marqueurs — rien d'autre n'en est retiré ni reformulé", () => {
    const question = questionDe([
      commentaire("une première remarque du chef", { url: `${ISSUE}#issuecomment-0` }),
      commentaire(`${MARQUEUR_MANAGER}\n**Manager — ticket mis sur le rail.**`, { url: `${ISSUE}#issuecomment-1` }),
      commentaire(QUESTION, { url: `${ISSUE}#issuecomment-2` }),
    ]);
    assert.equal(question?.url, `${ISSUE}#issuecomment-2`);
    assert.equal(question?.texte, TEXTE);
    assert.equal(question?.auteur, "benomite");
    assert.deepEqual(question?.depuis, []);
  });

  test("ce qui a été écrit sur l'issue depuis la question la suit : le chef voit qu'on y a déjà répondu", () => {
    const question = questionDe([commentaire(QUESTION), commentaire("b, sans hésiter", { auteur: "chef", a: "2026-10-15T09:00:00Z", url: `${ISSUE}#issuecomment-3` })]);
    assert.deepEqual(question?.depuis, [{ auteur: "chef", a: "2026-10-15T09:00:00Z", corps: "b, sans hésiter" }]);
  });

  test("sans question du manager — un autre commentaire, ou le marqueur recopié par quelqu'un qui n'a pas la main sur le dépôt —, il n'y en a pas", () => {
    assert.equal(questionDe([]), undefined);
    assert.equal(questionDe([commentaire(`${MARQUEUR_MANAGER}\n**Manager — pas un ticket exécutable : une question.**`)]), undefined);
    assert.equal(questionDe([commentaire(QUESTION, { association: "NONE" })]), undefined);
    assert.equal(questionDe([commentaire(QUESTION, { association: "CONTRIBUTOR" })]), undefined);
  });
});

describe("les choix qu'elle propose", () => {
  test("dans la phrase : (a), (b), (c) — chacun avec son texte, sans le « ou » qui le lie au suivant ni le point d'interrogation", () => {
    assert.deepEqual(choixDe(TEXTE), [
      { lettre: "a", texte: "il la remplace" },
      { lettre: "b", texte: "il s'ouvre par-dessus" },
      { lettre: "c", texte: "les deux selon la carte" },
    ]);
    assert.deepEqual(choixDe("On garde a) le rail seul ou b) le rail et la fiche ?"), [
      { lettre: "a", texte: "le rail seul" },
      { lettre: "b", texte: "le rail et la fiche" },
    ]);
  });

  test("en liste : a), (b), c., d : — avec ou sans puce, avec ou sans gras", () => {
    const texte = ["Lequel ?", "", "- **a)** découper en deux tickets", "- (b) un seul ticket, plus gros", "c. attendre #452", "d : fermer l'épique", "", "Une remarque après la liste."].join("\n");
    assert.deepEqual(choixDe(texte), [
      { lettre: "a", texte: "découper en deux tickets" },
      { lettre: "b", texte: "un seul ticket, plus gros" },
      { lettre: "c", texte: "attendre #452" },
      { lettre: "d", texte: "fermer l'épique" },
    ]);
    assert.deepEqual(choixDe("A) oui\nB) non"), [
      { lettre: "A", texte: "oui" },
      { lettre: "B", texte: "non" },
    ]);
  });

  test("sans choix lisibles — une question ouverte, une lettre seule, des lettres qui ne se suivent pas —, aucun : elle se répond par une phrase", () => {
    assert.deepEqual(choixDe("Quel périmètre pour le premier ticket ?"), []);
    assert.deepEqual(choixDe("Voir le point (a) de la spec : faut-il le garder ?"), []);
    assert.deepEqual(choixDe("(a) un, (c) trois"), []);
    assert.deepEqual(choixDe("(b) deux, (c) trois"), []);
    assert.deepEqual(choixDe("Un mot (a) collé"), []);
  });
});

// Un faux `gh` : un script sh, dans le répertoire du test. Il note ses arguments et ce qu'il lit
// sur son entrée ; `vue` est ce qu'il rend à `issue view`, `poste` ce qu'il rend à `issue comment`,
// et `corps` se joue avant de répondre — une panne s'y écrit.
function essai(t: TestContext, { vue, poste = `${ISSUE}#issuecomment-9`, corps = "" }: { vue: string; poste?: string; corps?: string }) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-app-question-"));
  const gh = join(racine, "gh");
  writeFileSync(join(racine, "vue"), vue);
  writeFileSync(
    gh,
    [
      "#!/bin/sh",
      `D='${racine}'`,
      'echo "$*" >> "$D/appels"',
      corps,
      'case "$2" in',
      '  view) cat "$D/vue" ;;',
      `  comment) cat > "$D/poste"; echo '${poste}' ;;`,
      "esac",
    ].join("\n"),
  );
  chmodSync(gh, 0o755);
  t.after(() => rmSync(racine, { recursive: true, force: true }));
  const lu = (nom: string) => (existsSync(join(racine, nom)) ? readFileSync(join(racine, nom), "utf8") : undefined);
  return { reglages: { gh, delaiMs: 60_000 }, racine, lu, appels: () => (lu("appels") ?? "").split("\n").filter(Boolean) };
}
const vueDe = (...commentaires: Commentaire[]) => JSON.stringify({ comments: commentaires.map(deGh) });
const maintenant = () => new Date("2026-10-15T10:00:00Z");

describe("l'issue lue par le `gh` du poste", () => {
  test("`gh issue view <adresse> --json comments` : la question, ses choix, l'heure de la lecture", async (t) => {
    const { reglages, appels } = essai(t, { vue: vueDe(commentaire(QUESTION)) });
    const lue = await lireQuestion(reglages, ISSUE, maintenant);
    assert.deepEqual(appels(), [`issue view ${ISSUE} --json comments`]);
    assert.equal(lue.a, "2026-10-15T10:00:00.000Z");
    assert.ok("question" in lue);
    assert.equal(lue.question.texte, TEXTE);
    assert.deepEqual(lue.question.choix.map(({ lettre }) => lettre), ["a", "b", "c"]);
  });

  test("une issue sans question du manager : lue, et rien à poser — l'entrée garde son geste", async (t) => {
    const { reglages } = essai(t, { vue: vueDe(commentaire("rien à voir")) });
    assert.deepEqual(await lireQuestion(reglages, ISSUE, maintenant), { a: "2026-10-15T10:00:00.000Z", aucune: true });
  });

  test("un `gh` en échec, absent, ou une sortie sans la forme : l'issue n'est pas lue, et l'app dit pourquoi — ce n'est pas « aucune question »", async (t) => {
    const enEchec = essai(t, { vue: "", corps: 'echo "gh: not logged in" >&2; exit 4' });
    const echoue = await lireQuestion(enEchec.reglages, ISSUE, maintenant);
    assert.ok("sans" in echoue);
    assert.match(echoue.sans, /issue view .*\ngh: not logged in\n→ exit code 4$/);

    const absent = await lireQuestion({ gh: join(enEchec.racine, "pas-de-gh"), delaiMs: 60_000 }, ISSUE, maintenant);
    assert.ok("sans" in absent);
    assert.match(absent.sans, /is not on this machine/);

    const informe = await lireQuestion(essai(t, { vue: "{}" }).reglages, ISSUE, maintenant);
    assert.ok("sans" in informe);
    assert.match(informe.sans, /no `comments` list/);
  });
});

describe("la réponse du chef, postée sur l'issue", () => {
  const URL_QUESTION = `${ISSUE}#issuecomment-1`;

  test("un choix : la lettre et le texte que la question écrit partent par `gh issue comment … --body-file -` — le texte vient de l'issue, pas de la vue", async (t) => {
    const { reglages, appels, lu } = essai(t, { vue: vueDe(commentaire(QUESTION)) });
    const rendue = await repondre(reglages, ISSUE, { question: URL_QUESTION, choix: "b" });
    assert.deepEqual(rendue, { poste: true, corps: "b) il s'ouvre par-dessus", adresse: `${ISSUE}#issuecomment-9` });
    // Relue d'abord, puis écrite.
    assert.deepEqual(appels(), [`issue view ${ISSUE} --json comments`, `issue comment ${ISSUE} --body-file -`]);
    assert.equal(lu("poste"), "b) il s'ouvre par-dessus");
  });

  test("une phrase : telle que le chef l'a écrite, ses blancs de bord retirés", async (t) => {
    const { reglages, lu } = essai(t, { vue: vueDe(commentaire(QUESTION)) });
    const rendue = await repondre(reglages, ISSUE, { question: URL_QUESTION, texte: "  Par-dessus, et la fiche reste dessous.\nMerci.  " });
    assert.equal(rendue.poste, true);
    assert.equal(lu("poste"), "Par-dessus, et la fiche reste dessous.\nMerci.");
  });

  test("rien ne part sans réponse : ni phrase vide, ni choix que la question n'offre pas, ni réponse qui ne dit pas à quelle question elle répond", async (t) => {
    const { reglages, appels, lu } = essai(t, { vue: vueDe(commentaire(QUESTION)) });
    for (const envoyee of [undefined, {}, { question: URL_QUESTION }, { question: URL_QUESTION, texte: "   " }, { choix: "a" }, { question: URL_QUESTION, choix: "z" }]) {
      const rendue = await repondre(reglages, ISSUE, envoyee);
      assert.equal(rendue.poste, false, JSON.stringify(envoyee));
      assert.ok(!rendue.poste && rendue.refus.startsWith("nothing was posted"));
    }
    assert.ok(!appels().some((appel) => appel.startsWith("issue comment")));
    assert.equal(lu("poste"), undefined);
  });

  test("une question qui n'est plus celle que le chef a lue — le manager en a posé une autre — : rien ne part, et la nouvelle revient", async (t) => {
    const nouvelle = commentaire(QUESTION.replace("(c) les deux", "(c) aucun des deux"), { url: `${ISSUE}#issuecomment-5` });
    const { reglages, appels } = essai(t, { vue: vueDe(commentaire(QUESTION), nouvelle) });
    const rendue = await repondre(reglages, ISSUE, { question: URL_QUESTION, choix: "a" });
    assert.equal(rendue.poste, false);
    assert.ok(!rendue.poste && rendue.lue !== undefined && "question" in rendue.lue);
    assert.equal(!rendue.poste && rendue.lue !== undefined && "question" in rendue.lue ? rendue.lue.question.url : "", `${ISSUE}#issuecomment-5`);
    assert.ok(!appels().some((appel) => appel.startsWith("issue comment")));
  });

  test("un `gh` qui échoue à écrire : rien n'est dit posté, et ce qu'il a dit est rendu", async (t) => {
    const { reglages } = essai(t, { vue: vueDe(commentaire(QUESTION)), corps: '[ "$2" = comment ] && { echo "GraphQL: Could not resolve" >&2; exit 1; }' });
    const rendue = await repondre(reglages, ISSUE, { question: URL_QUESTION, choix: "a" });
    assert.equal(rendue.poste, false);
    assert.match(!rendue.poste ? rendue.refus : "", /issue comment .*--body-file -\nGraphQL: Could not resolve\n→ exit code 1$/);
  });
});
