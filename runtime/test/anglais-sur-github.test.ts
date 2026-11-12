// Ce que la cuisine poste sur GitHub est en anglais (#3033) : chaque auteur —
// le manager, le cook, la pass, le closer — rend ses gabarits de commentaire,
// et aucun ne porte de français : ni caractère accentué, ni aucun des mots
// français de docs/glossary.md. Les marques `<!-- brigade:… -->` sont des
// identifiants, que le glossaire laisse tels quels : elles ne comptent pas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { carteAbandon, carteBloque, carteMergeALaMain, carteQuestionProduit, corpsDeCarte } from "../src/github-seul/carte-todo/carte-todo.ts";
import { corpsDeLAttente, lesMotsDuCook } from "../src/attente-ticket/attente-ticket.ts";
import { apresLaMiseAJour, ticketDuFix } from "../src/mise-a-jour-branche/mise-a-jour-branche.ts";
import { corpsDeLaReponse } from "../src/desaccord-cook.ts";
import { corpsDeLacher, corpsDePrise } from "../src/github-etat/prise.ts";
import { corpsDeReclamation, corpsDeRendu } from "../src/station-contributrice/reclamation.ts";
import { direLevee, direMarque } from "../src/attente.ts";
import { corpsDeLaCarte, corpsDeLaReponseAuBlocage, sectionDeLaDecision } from "../src/blocage-au-manager.ts";
import { corpsDuTicket, ficheDuTicket } from "../src/decouper.ts";
import { rendreListe } from "../src/epique.ts";
import { fiche } from "../src/fiche.ts";
import { reparationDuGeste } from "../src/garde-todo/geste-git.ts";
import { corpsDePriseDuManager, corpsDeTravailFait } from "../src/github-etat/prise-du-manager.ts";
import { MARQUEUR_MANAGER } from "../src/juger.ts";
import { corpsDeVerdict } from "../src/github-etat/fusion.ts";
import { corpsDuSecondJugement } from "../src/second-juge.ts";
import { corpsDuRefus } from "../src/github-seul/second-juge/second-juge.ts";
import { corpsDuFix, titreDuFix } from "../src/remontee-a-la-cuisine.ts";
import { corpsDeRetourAvec, corpsDeSortieAvec } from "../src/abandon-en-chaine.ts";
import { corpsDeLaFermeture, titreDeLaFermeture } from "../src/closer-github-passe/closer-github-passe.ts";
import { mesurerRatio } from "../src/closing/ratio.ts";
import { corps as corpsDeLaPreparation, TITRE as TITRE_DE_LA_PREPARATION } from "../src/preparation-depot/ticket.ts";
import { direALArrivee } from "../src/projections/rail.ts";
import { corpsDeCeQuiEstFait, lignesDuBrief } from "../src/validation-design/brief.ts";
import { nomDuProjet } from "../src/geste.ts";
import { chef, cuisine, issue } from "./aides/cuisine.ts";
import { jusqua } from "./outils.ts";

const GLOSSAIRE = readFileSync(join(import.meta.dirname, "..", "..", "docs", "glossary.md"), "utf8");
// Des mots anglais que la colonne française du glossaire cite en passant
// (« the first line, projet until the runtime writes it in English »).
const ANGLAIS_DANS_LA_COLONNE = new Set(["english", "first", "line", "until", "writes", "durations", "label", "max"]);
const mots = (texte: string) => texte.replace(/`/g, " ").toLowerCase().split(/[^\p{L}]+/u).filter((mot) => mot.length >= 2);

// Les mots de la colonne française du glossaire qui ne sont pas aussi dans sa
// colonne anglaise (`pass`, `rail`, `status` restent).
const MOTS_FRANCAIS = (() => {
  const francais = new Set<string>();
  const anglais = new Set<string>();
  for (const ligne of GLOSSAIRE.split("\n")) {
    if (!ligne.startsWith("|") || /^\|\s*-/.test(ligne) || /^\|\s*French\s*\|/.test(ligne)) continue;
    const [, fr = "", en = ""] = ligne.split("|");
    for (const mot of mots(fr)) francais.add(mot);
    for (const mot of mots(en)) anglais.add(mot);
  }
  return new Set([...francais].filter((mot) => !anglais.has(mot) && !ANGLAIS_DANS_LA_COLONNE.has(mot)));
})();

const ACCENTS = /[àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ]/u;

// Le français que le texte porte, hors de ses marques et des chemins qu'il
// cite (`runtime/test/disjoncteur.test.ts`) : ses accents et ses mots du glossaire.
function francaisDans(texte: string): string[] {
  const lu = texte.replace(/<!--[\s\S]*?-->/g, " ").replace(/[\w.-]+(?:\/[\w.-]+)+/g, " ");
  return [...new Set([...(lu.match(new RegExp(ACCENTS, "gu")) ?? []), ...mots(lu).filter((mot) => MOTS_FRANCAIS.has(mot))])];
}

function enAnglais(textes: string[]) {
  assert.ok(textes.length > 0, "no template was rendered");
  for (const texte of textes) assert.deepEqual(francaisDans(texte), [], texte);
}

test("the check sees French: an accent, or a French word of the glossary", () => {
  assert.ok(MOTS_FRANCAIS.has("cuisine") && MOTS_FRANCAIS.has("attend") && MOTS_FRANCAIS.has("fiche"));
  assert.ok(!MOTS_FRANCAIS.has("pass") && !MOTS_FRANCAIS.has("rail") && !MOTS_FRANCAIS.has("ticket"));
  assert.deepEqual(francaisDans("**Manager — ticket incomplet : il attend une décision de produit.**"), ["é", "attend", "une", "de"]);
  assert.deepEqual(francaisDans("<!-- brigade:reponse-au-blocage n=1 -->\nThe ticket waits."), []);
  assert.deepEqual(francaisDans("A test in runtime/test/disjoncteur.test.ts plays it."), []);
});

describe("in English on GitHub", { concurrency: 8 }, () => {
  test("the manager: its comments on a ticket it fires, an incomplete ticket it completes or asks about, a held ticket, an epic it cannot split, a ticket it sets aside", async (t) => {
    const scenarios: Array<{ suite: string[]; ticket: number; labels: string[]; dits: number }> = [
      { suite: ["juge-ticket"], ticket: 30, labels: [], dits: 1 },
      { suite: ["juge-incomplet", "complete-question"], ticket: 40, labels: [], dits: 2 },
      { suite: ["juge-incomplet", "complete-criteres"], ticket: 41, labels: [], dits: 2 },
      { suite: ["requalifie-carte"], ticket: 45, labels: ["blocked-on-human"], dits: 1 },
      { suite: ["requalifie-reprise", "juge-ticket"], ticket: 46, labels: ["blocked-on-human"], dits: 2 },
      { suite: ["decoupe-question"], ticket: 50, labels: ["epic"], dits: 1 },
      { suite: [], ticket: 60, labels: ["fire", "question"], dits: 1 },
    ];
    const dits = await Promise.all(
      scenarios.map(async ({ suite, ticket, labels, dits: attendus }) => {
        const c = cuisine(t, { manager: { suite }, issues: [issue(ticket, labels)] });
        chef(c.repertoire, "manager.enabled");
        // Le service pose toujours `BRIGADE_PROJECT` : le geste y nomme le projet, jamais `<projet>`.
        const du = () => c.gh.commentaires.filter(([n, corps]) => n === ticket && corps.includes(MARQUEUR_MANAGER)).map(([, corps]) => corps.replaceAll(nomDuProjet(), "shop"));
        await jusqua(() => du().length >= attendus);
        return du();
      }),
    );
    enAnglais(dits.flat());
  });

  test("the manager: the body and the card of a ticket it splits, the epic's list, the git-gesture fix ticket, its answer to a cook's block", () => {
    const prevu = { title: "The rail shows the count", context: "", criteria: ["`run rail` shows the count"], waitsFor: [1], zone: ["runtime/src/rail.ts"], requires: ["browser"], model: "sonnet", effort: "medium", calibration: "One module.", cook: "design" as const };
    const reponse = { issue: "technique" as const, reponse: "Use scripts/capture-ecran/.", decision: "The cook uses it." };
    const fix = reparationDuGeste("merge", { enonce: "Merge PR #12?" }, 12);
    enAnglais([
      corpsDuTicket(29, 2, prevu),
      ficheDuTicket(prevu, (rang) => 100 + rang),
      ficheDuTicket({ waitsFor: [], zone: [] }, (rang) => rang),
      rendreListe(29, [
        { ticket: 101, title: "A", state: "served", served: true },
        { ticket: 102, title: "B", state: "open", served: false },
      ]),
      fix.titre,
      fix.corps,
      corpsDeLaReponseAuBlocage({ station: "box", n: 1, questionEn: "Which tool?", avis: reponse, ecrite: false }),
      corpsDeLaReponseAuBlocage({ station: "box", n: 3, questionEn: null, avis: reponse, ecrite: true }),
      sectionDeLaDecision("Which tool?", reponse),
      corpsDeLaCarte({ station: "box", questionEn: "Which layout?", avis: { issue: "produit", question: "Which layout?" } }),
      corpsDeLaCarte({ station: "box", questionEn: null, avis: { issue: "geste", geste: "Run `gh auth refresh`" } }),
      corpsDePriseDuManager("box", "rail", "abcd1234"),
      corpsDeTravailFait("box", "rail", "abcd1234"),
    ]);
  });

  test("a split ticket's card, written in English, still reads: awaiting, zone and requires", () => {
    const lue = fiche([ficheDuTicket({ waitsFor: [1, 2], zone: ["runtime/src", "runtime/test"], requires: ["browser"] }, (rang) => 3000 + rang)]);
    assert.deepEqual(lue, { waitsFor: [3001, 3002], zone: ["runtime/src", "runtime/test"], requires: ["browser"], problems: [] });
    assert.deepEqual(fiche([ficheDuTicket({ waitsFor: [], zone: [] }, (rang) => rang)]), { waitsFor: [], zone: [], problems: [] });
  });

  test("the cook: the station's comments on its ticket — taken, released, blocked, awaiting a ticket, its reply to the review, its TODO cards", () => {
    enAnglais([
      corpsDePrise("box"),
      corpsDeLacher("box"),
      corpsDeReclamation("box", "octocat"),
      corpsDeRendu("box", "octocat"),
      corpsDeLAttente({ station: "box", attendus: [12], question: "This builds on #12, not yet merged." }),
      corpsDeLaReponse("0123456789abcdef", "The remark is wrong: the case is handled in rail.ts."),
      corpsDeCarte(carteBloque(12, "it needs an access token")),
      corpsDeCarte(carteMergeALaMain(12, "#13", "the PR touches the workflows")),
      corpsDeCarte(carteQuestionProduit(12, "Which layout?")),
      corpsDeCarte(carteAbandon(12, "its delivery stays red")),
      // Le service pose toujours `BRIGADE_PROJECT` : le geste y nomme le projet, jamais `<projet>`.
      direMarque(12, { what: "the vendor's API key", who: "Alice", since: "2026-11-09T10:00:00.000Z", followUp: "2026-11-10T10:00:00.000Z", onArrival: direALArrivee("open") }, false).replaceAll(nomDuProjet(), "shop"),
      direMarque(12, { what: "the vendor's API key", who: "Alice", since: "2026-11-09T10:00:00.000Z", followUp: "2026-11-10T10:00:00.000Z", onArrival: direALArrivee(null) }, true).replaceAll(nomDuProjet(), "shop"),
      direLevee(null, { what: "the key", who: "Alice" }),
    ]);
  });

  test("the cook: its French words, which no manager translates on the station's paths — awaiting a ticket, a branch brought up to date, its fix ticket —, are not quoted; English ones are", async () => {
    const question = "Ce ticket bâtit sur le travail de #12, pas encore mergé : il me faut aussi les commits de `origin/main`.";
    const commentes: string[] = [];
    const github = { commenter: async (_n: number, corps: string) => void commentes.push(corps), creerIssue: async () => 13 };
    const miseAJour = { etat: "echec" as const, etape: "merge" as const, detail: "CONFLICT", fichiers: ["a.ts"] };
    await apresLaMiseAJour(github, { station: "box", ticket: 12, base: "main", branche: "cook/12-github", question, miseAJour: { etat: "fusionnee" } });
    await apresLaMiseAJour(github, { station: "box", ticket: 12, base: "main", branche: "cook/12-github", question, miseAJour });
    const fix = ticketDuFix({ ticket: 12, base: "main", branche: "cook/12-github", miseAJour, question });
    const postes = [corpsDeLAttente({ station: "box", attendus: [12], question }), ...commentes, fix.titre, fix.corps];
    assert.equal(postes.length, 5);
    enAnglais(postes);
    for (const corps of [...postes.slice(0, 3), fix.corps]) assert.match(corps, /The cook's words are not quoted: it wrote them in French\./);
    assert.deepEqual(lesMotsDuCook("This builds on #12, not yet merged."), ["The cook's words:", "", "> This builds on #12, not yet merged."]);
    assert.deepEqual(lesMotsDuCook("Je ne peux pas commencer avant #12."), ["The cook's words are not quoted: it wrote them in French."]);
  });

  test("the pass: its verdicts, the second judge, the fix ticket it opens, a ticket dropped with another and its return", () => {
    const fix = { ticket: 12, titre: "The rail", reason: "red-after-returns", cause: "tests", why: "The tests stay red.", findings: ["- **Blocking**: the case is not handled."], pr: "#13", branch: "cook/12-github" };
    enAnglais([
      corpsDeVerdict("box", "0123456789abcdef", { verdict: "approve", motif: "" }),
      corpsDeVerdict("box", "0123456789abcdef", { verdict: "request-changes", motif: "- **Blocking**: the empty case is not handled." }),
      corpsDuSecondJugement("box", "0123456789abcdef", { verdict: "request-changes", motif: "The tests were weakened." }),
      corpsDuRefus(["runtime/test/rail.test.ts"]),
      titreDuFix(fix),
      corpsDuFix(fix),
      corpsDeSortieAvec({ root: 12, cause: "tests", reason: "the reason is on its issue" }),
      corpsDeRetourAvec(12),
    ]);
  });

  test("the closer: the closing pass's issue", () => {
    enAnglais([
      titreDeLaFermeture("main"),
      corpsDeLaFermeture({ base: "main", sha: "0123456", merges: 20, pente: mesurerRatio([{ ajoute: 30, retire: 10 }]), proposes: [{ id: "M1", quoi: "export `x` of `a.ts:1` — referenced nowhere", lieux: [], fichiers: [], cle: "", empreinte: "" }], ecartes: 2, zone: ["runtime/src/a.ts"], retraits: 200 }),
    ]);
  });

  test("the station: the repository-preparation ticket it opens on its own", () => {
    enAnglais([
      TITRE_DE_LA_PREPARATION,
      corpsDeLaPreparation({ projet: "shop", depot: "acme/shop", base: "main", presents: { ".claude/brigade/gates.sh": true } }),
    ]);
  });
});

test("the design card's brief: the cook's summary posted on its PR, and the brief the card carries, with or without a summary (#3330)", () => {
  enAnglais([corpsDeCeQuiEstFait(["The TODO column takes the full width"]), lignesDuBrief("Show the count on the rail", ["The rail shows the count"]).join("\n"), lignesDuBrief("Show the count on the rail", null).join("\n")]);
});
