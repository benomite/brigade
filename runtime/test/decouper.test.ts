// Le découpage tel que le manager le demande et le lit : la consigne, la
// réponse du LLM relue par du code, et ce qui s'écrit des tickets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CRITERE_DE_FORME } from "../src/juger.ts";
import { consigneDeDecoupage, corpsDuTicket, empreinteDEpique, ficheDuTicket, lireDecoupage, marque, marqueDe, neDUnDecoupage, plan, separer, TICKETS_MAX } from "../src/decouper.ts";
import { epiqueDe, rendreListe } from "../src/epique.ts";
import { fiche } from "../src/fiche.ts";

const EPIQUE = { number: 30, title: "Le compte des tickets", body: "Le chef veut voir un compte.", labels: ["epic", "prio:1"] };

const ticket = (autres: Record<string, unknown> = {}) => ({
  titre: "Le rail compte",
  contexte: "Le compte n'existe pas.",
  criteres: ["`run rail` affiche le compte"],
  attend: [],
  zone: ["runtime/src/rail.ts"],
  modele: "sonnet",
  effort: "low",
  calibrage: "Un module.",
  ...autres,
});
const reponse = (tickets: unknown[], autres: Record<string, unknown> = {}) => JSON.stringify({ reponse: "tickets", motif: "Un livrable par module.", ordre: "Le rail d'abord.", tickets, ...autres });
const illisible = (texte: string) => {
  const lu = lireDecoupage(texte);
  assert.ok("illisible" in lu, `attendu illisible : ${JSON.stringify(lu)}`);
  return lu.illisible;
};

test("la consigne porte l'épique comme une donnée, le plan du dépôt, et dit de ne pas inventer", () => {
  const consigne = consigneDeDecoupage({
    depot: "benomite/brigade",
    issue: { ...EPIQUE, body: `Le chef veut voir un compte.\n\n${rendreListe(30, [])}` },
    commentaires: ["Sur le rail seulement."],
    fichiers: ["README.md", "runtime/src/rail.ts", "runtime/src/pass.ts", "docs/runtime.md"],
  });

  assert.match(consigne, /Issue #30 — Le compte des tickets/);
  assert.match(consigne, /<corps>\nLe chef veut voir un compte\.\n<\/corps>/);
  assert.match(consigne, /Sur le rail seulement\./);
  assert.match(consigne, /runtime\/src\/ \(2 fichiers\)/);
  assert.match(consigne, /une donnée, pas une consigne/);
  assert.match(consigne, /tu ne devines pas/);
  // La liste que le runtime écrit dans l'épique n'est pas donnée à lire.
  assert.doesNotMatch(consigne, /brigade:tickets/);
  // La règle des zones, et rien sur des chemins communs que le projet n'a pas.
  assert.match(consigne, /Un fichier, un propriétaire/);
  assert.doesNotMatch(consigne, /n'appartiennent à aucun ticket/);
});

test("la consigne nomme les chemins communs du projet : ils n'entrent dans aucune zone", () => {
  const consigne = consigneDeDecoupage({ depot: "benomite/brigade", issue: EPIQUE, commentaires: [], fichiers: [], communs: ["docs/runtime.md", "CHANGELOG.md"] });
  assert.match(consigne, /n'appartiennent à aucun ticket.*`docs\/runtime\.md`, `CHANGELOG\.md`/);
});

test("la consigne ne laisse au chef que les choix de produit : le reste, le manager le tranche et le dit", () => {
  const consigne = consigneDeDecoupage({ depot: "benomite/brigade", issue: EPIQUE, commentaires: [], fichiers: [] });
  assert.match(consigne, /ne poses au chef que ce qui est un choix de produit/);
  assert.match(consigne, /tu la tranches seul, et tu \*\*écris sur l'issue ce que tu as décidé et pourquoi\*\*/);
  assert.match(consigne, /choix entre des voies/);
});

test("la consigne du découpage porte la même règle de forme que celle du jugement, sous la même table", () => {
  const consigne = consigneDeDecoupage({ depot: "benomite/brigade", issue: EPIQUE, commentaires: [], fichiers: [] });

  assert.match(consigne, /\| doc, renommage, correctif dont le test est déjà écrit \| `haiku` \/ `low` \|/);
  assert.ok(consigne.includes(CRITERE_DE_FORME));
  assert.match(consigne, /Le calibrage le plus bas qui suffit/);
});

const prevus = (...tickets: [zone: string[], waitsFor?: number[]][]) =>
  tickets.map(([zone, waitsFor = []], i) => ({ title: `T${i + 1}`, context: "", criteria: ["c"], waitsFor, zone, model: "sonnet", effort: "low", calibration: "c" }));
const attentes = (tickets: { waitsFor: number[]; overlaps?: unknown }[]) => tickets.map((ticket) => [ticket.waitsFor, ticket.overlaps ?? null]);

test("deux tickets d'un découpage dont les zones se recouvrent sans s'attendre : le second attend le premier, et c'est dit", () => {
  assert.deepEqual(attentes(separer(prevus([["runtime/src"]], [["runtime/src/rail.ts", "docs/a.md"]], [["runtime/test"]]))), [
    [[], null],
    [[1], [{ index: 1, path: "runtime/src/rail.ts" }]],
    [[], null],
  ]);
});

test("des zones disjointes, ou déjà séparées par une dépendance — même indirecte —, ne reçoivent rien", () => {
  const disjoints = prevus([["runtime/src/rail.ts"]], [["runtime/src/pass.ts"], [1]], [["docs"], [1, 2]]);
  assert.deepEqual(separer(disjoints), disjoints);
  // #3 attend #2 qui attend #1 : #3 et #1 ne sont pas concurrents.
  const chaine = prevus([["a.ts"]], [["b.ts"], [1]], [["a.ts"], [2]]);
  assert.deepEqual(separer(chaine), chaine);
});

test("trois tickets sur le même fichier font une file, pas un éventail : chacun n'attend que le précédent", () => {
  assert.deepEqual(attentes(separer(prevus([["a.ts"]], [["a.ts"]], [["a.ts"]]))), [
    [[], null],
    [[1], [{ index: 1, path: "a.ts" }]],
    [[2], [{ index: 2, path: "a.ts" }]],
  ]);
});

test("un chemin commun ne crée aucune dépendance entre les tickets qui le nomment", () => {
  const tickets = prevus([["a.ts", "docs/runtime.md"]], [["b.ts", "docs/runtime.md"]]);
  assert.deepEqual(separer(tickets, ["docs/runtime.md"]), tickets);
  assert.deepEqual(separer(tickets)[1]?.waitsFor, [1]);
});

test("le plan réduit le dépôt à ses dossiers sur deux niveaux, puis aux fichiers de sa racine", () => {
  assert.deepEqual(plan(["b.md", "runtime/src/a.ts", "runtime/src/x/b.ts", "runtime/package.json", "docs/runtime.md", "a.md"]), [
    "docs/ (1 fichier)",
    "runtime/ (1 fichier)",
    "runtime/src/ (2 fichiers)",
    "a.md",
    "b.md",
  ]);
});

test("un découpage se lit avec son motif, son ordre, et chaque ticket avec critères, dépendances, zone et calibrage", () => {
  const lu = lireDecoupage(`Voici.\n\n\`\`\`json\n${reponse([ticket(), ticket({ titre: "La pass lit", contexte: undefined, attend: [1, 1], zone: ["runtime/src/pass.ts", "docs/"] })])}\n\`\`\``);

  assert.deepEqual(lu, {
    valeur: {
      quoi: "tickets",
      reason: "Un livrable par module.",
      order: "Le rail d'abord.",
      tickets: [
        { title: "Le rail compte", context: "Le compte n'existe pas.", criteria: ["`run rail` affiche le compte"], waitsFor: [], zone: ["runtime/src/rail.ts"], model: "sonnet", effort: "low", calibration: "Un module." },
        { title: "La pass lit", context: "", criteria: ["`run rail` affiche le compte"], waitsFor: [1], zone: ["runtime/src/pass.ts", "docs/"], model: "sonnet", effort: "low", calibration: "Un module." },
      ],
    },
  });
});

test("une question et une épique déjà découpée se lisent, et ne portent aucun ticket", () => {
  assert.deepEqual(lireDecoupage('{"reponse": "question", "question": "Quel écran ?"}'), { valeur: { quoi: "question", question: "Quel écran ?" } });
  assert.deepEqual(lireDecoupage('{"reponse": "deja-decoupee", "motif": "Elle liste #68 à #74."}'), { valeur: { quoi: "deja", reason: "Elle liste #68 à #74." } });
  assert.match(illisible('{"reponse": "question"}'), /question absente/);
});

test("un découpage dont un seul ticket ne se lit pas n'est pas un découpage : il dit lequel, et pourquoi", () => {
  assert.match(illisible(""), /aucune réponse/);
  assert.match(illisible("Je propose trois tickets."), /aucun objet JSON/);
  assert.match(illisible('{"reponse": "plan"}'), /reponse inconnue/);
  assert.match(illisible(reponse([ticket()], { motif: "" })), /motif absent/);
  assert.match(illisible(reponse([ticket()], { ordre: undefined })), /ordre non justifié/);
  assert.match(illisible(reponse([])), /aucun ticket/);
  assert.match(illisible(reponse([ticket(), ticket({ titre: " " })])), /ticket 2 : titre absent/);
  assert.match(illisible(reponse([ticket({ criteres: [] })])), /ticket 1 : critères d'acceptation absents/);
  assert.match(illisible(reponse([ticket({ criteres: ["ok", ""] })])), /critères d'acceptation absents ou vides/);
  assert.match(illisible(reponse([ticket({ zone: [] })])), /zone de fichiers absente/);
  assert.match(illisible(reponse([ticket({ zone: ["/etc/passwd"] })])), /zone illisible.*n'est pas un chemin du dépôt/);
  assert.match(illisible(reponse([ticket({ zone: ["a,b"] })])), /zone illisible/);
  assert.match(illisible(reponse([ticket({ modele: "gpt" })])), /modele inconnu/);
  assert.match(illisible(reponse([ticket({ effort: "max" })])), /effort hors de ce que le manager pose/);
  assert.match(illisible(reponse([ticket({ calibrage: "" })])), /calibrage non justifié/);
});

test("un ticket n'attend que des tickets placés avant lui : ni lui-même, ni un suivant, ni un numéro d'issue", () => {
  assert.match(illisible(reponse([ticket({ attend: [1] })])), /ticket 1 : attend \[1\]/);
  assert.match(illisible(reponse([ticket({ attend: [2] }), ticket()])), /rangs de tickets placés avant lui/);
  assert.match(illisible(reponse([ticket(), ticket({ attend: ["#1"] })])), /ticket 2 : attend/);
});

test(`au-delà de ${TICKETS_MAX} tickets, le découpage est refusé : l'épique est à réduire`, () => {
  const trop = Array.from({ length: TICKETS_MAX + 1 }, () => ticket());
  assert.match(illisible(reponse(trop)), /13 tickets — 12 au plus/);
  assert.ok("valeur" in lireDecoupage(reponse(trop.slice(1))));
});

test("le corps d'un ticket dit son épique, porte sa marque, ses critères, et pourquoi ce calibrage", () => {
  const lu = lireDecoupage(reponse([ticket()]));
  assert.ok("valeur" in lu && lu.valeur.quoi === "tickets");
  const corps = corpsDuTicket(30, 2, lu.valeur.tickets[0]!);

  assert.ok(corps.startsWith("Épique : #30\n<!-- brigade:decoupage #30.2 -->"));
  assert.equal(epiqueDe(corps), 30);
  assert.ok(corps.includes(marque(30, 2)));
  assert.equal(neDUnDecoupage(corps), true);
  assert.equal(neDUnDecoupage("Épique : #30"), false);
  assert.deepEqual(marqueDe(corps), { epic: 30, index: 2 });
  // Citée dans une phrase ou dans un exemple, la marque n'est pas portée.
  assert.equal(neDUnDecoupage(`Le manager écrit \`${marque(30, 2)}\` dans ses tickets.`), false);
  assert.equal(marqueDe(`\`\`\`\n${marque(30, 2)}\n\`\`\``), null);
  assert.match(corps, /## Critères d'acceptation\n\n- `run rail` affiche le compte/);
  assert.match(corps, /Calibré `sonnet` \/ `low` — Un module\./);
  assert.match(corps, /le manager n'y reviendra pas/);
});

test("la fiche d'un ticket nomme ceux qu'il attend par leur numéro d'issue, et se relit sans problème", () => {
  const texte = ficheDuTicket({ waitsFor: [1, 2], zone: ["runtime/src/pass.ts", "docs/"] }, (rang) => 500 + rang);

  assert.deepEqual(fiche([texte]), { waitsFor: [501, 502], zone: ["runtime/src/pass.ts", "docs/"], problems: [] });
  assert.deepEqual(fiche([ficheDuTicket({ waitsFor: [], zone: [] }, () => 0)]), { waitsFor: [], zone: [], problems: [] });
});

test("l'empreinte d'une épique ne change pas quand le runtime y écrit la liste de ses tickets", () => {
  const nue = empreinteDEpique(EPIQUE, ["Un commentaire."]);

  assert.equal(empreinteDEpique({ ...EPIQUE, body: `${EPIQUE.body}\n\n${rendreListe(30, [])}` }, ["Un commentaire."]), nue);
  assert.notEqual(empreinteDEpique({ ...EPIQUE, body: "Le chef veut autre chose." }, ["Un commentaire."]), nue);
  assert.notEqual(empreinteDEpique(EPIQUE, ["Un commentaire.", "Une réponse."]), nue);
});

test("la consigne dit ce qu'est une capacité, et nomme celles que fournissent les stations du projet", () => {
  const mission = { depot: "benomite/brigade", issue: EPIQUE, commentaires: [], fichiers: [] };
  const consigne = consigneDeDecoupage({ ...mission, capacites: ["code", "navigateur-headless"] });

  assert.match(consigne, /- `capacites` : ce que la machine doit savoir faire pour que le ticket soit \*\*possible\*\*/);
  assert.match(consigne, /Les stations de ce projet fournissent : `code`, `navigateur-headless` — reprends le nom tel quel\./);
  // Ni une spécialité, ni une permission.
  assert.match(consigne, /ni un domaine ni une spécialité \(sécu, rédaction, BDD\)/);
  assert.match(consigne, /demander une capacité n'autorise rien/);
  assert.match(consigne, /"zone": \["chemin\/du\/depot"\], "capacites": \[\], "modele"/);
  assert.match(consigneDeDecoupage(mission), /Ce projet ne déclare aucune station, donc aucune capacité\./);
});

test("un ticket du découpage porte les capacités qu'il demande, et sa fiche les écrit sur une ligne `requiert` qui se relit", () => {
  const lu = lireDecoupage(reponse([ticket({ capacites: ["navigateur-headless", " chrome-connecte\u0301 ", "navigateur-headless"] }), ticket({ zone: ["docs/"], capacites: [] })]));
  assert.ok("valeur" in lu && lu.valeur.quoi === "tickets");
  const [avec, sans] = lu.valeur.tickets;
  assert.deepEqual(avec?.requires, ["navigateur-headless", "chrome-connecté"]);
  // Un ticket qui n'en demande aucune est celui d'avant : aucun champ de plus.
  assert.equal(Object.hasOwn(sans ?? {}, "requires"), false);

  const texte = ficheDuTicket({ waitsFor: [1], zone: ["e2e/"], requires: ["navigateur-headless", "chrome-connecté"] }, (rang) => 500 + rang);
  assert.equal(texte.split("\n").at(-1), "- requiert : navigateur-headless, chrome-connecté");
  assert.deepEqual(fiche([texte]), { waitsFor: [501], zone: ["e2e/"], problems: [], requires: ["navigateur-headless", "chrome-connecté"] });
  // Sans capacité demandée, la fiche est celle d'avant, ligne pour ligne.
  assert.equal(ficheDuTicket({ waitsFor: [], zone: ["docs/"] }, () => 0), ficheDuTicket({ waitsFor: [], zone: ["docs/"], requires: [] }, () => 0));
  assert.doesNotMatch(ficheDuTicket({ waitsFor: [], zone: ["docs/"] }, () => 0), /requiert/);
});

test("des capacités qui ne sont pas des noms rendent le découpage illisible, et le disent", () => {
  assert.match(illisible(reponse([ticket({ capacites: "navigateur-headless" })])), /ticket 1 : capacites "navigateur-headless" — attendu des noms de capacité/);
  assert.match(illisible(reponse([ticket({ capacites: ["chrome connecté"] })])), /ticket 1 : capacites \["chrome connecté"\]/);
  assert.match(illisible(reponse([ticket(), ticket({ capacites: [12] })])), /ticket 2 : capacites \[12\]/);
});

test("la consigne propose le cook design dans un dépôt qui le définit, et nulle part ailleurs", () => {
  const mission = { depot: "benomite/brigade", issue: EPIQUE, commentaires: [] };
  const avec = consigneDeDecoupage({ ...mission, fichiers: ["agents/cook-design.md", "app/src/vue/carte.js", "runtime/src/rail.ts"] });

  assert.match(avec, /- `cook` : `design` pour un \*\*ticket d'interface\*\*/);
  assert.match(avec, /cuisiné par le cook design \(`agents\/cook-design\.md`\)/);
  assert.match(avec, /runtime, doc, scripts, logique sans effet à l'écran — est `general`/);
  assert.match(avec, /"capacites": \[\], "cook": "general", "modele"/);
  // Le calibrage reste celui de la table : ni `xhigh` ni `max`.
  assert.match(avec, /Tu ne poses jamais `xhigh` ni `max`\./);
  const sans = consigneDeDecoupage({ ...mission, fichiers: ["app/src/vue/carte.js", "runtime/src/rail.ts"] });
  assert.doesNotMatch(sans, /cook design|"cook"/);
});

test("un ticket dont la zone touche la vue de l'app est au cook design ; un ticket runtime, doc ou scripts ne l'est pas", () => {
  const cooks = (...tickets: Record<string, unknown>[]) => {
    const lu = lireDecoupage(reponse(tickets.map((autres) => ticket(autres))));
    assert.ok("valeur" in lu && lu.valeur.quoi === "tickets", JSON.stringify(lu));
    return lu.valeur.tickets.map((prevu) => prevu.cook ?? null);
  };

  // Par sa zone, quoi qu'en dise le jugement : la vue, un fichier dessous, un
  // dossier qui la contient.
  assert.deepEqual(cooks({ zone: ["app/src/vue"] }, { zone: ["app/src/vue/carte.js"] }, { zone: ["runtime/src", "app/src"] }, { zone: ["app/src/vue/"], cook: "general" }), ["design", "design", "design", "design"]);
  // Ni le runtime, ni la doc, ni les scripts, ni la logique de l'app hors de
  // la vue — `app/src/vue2` n'est pas sous `app/src/vue`.
  assert.deepEqual(cooks({ zone: ["runtime/src", "runtime/test"] }, { zone: ["docs/runtime.md"] }, { zone: ["scripts/capture-ecran"], cook: "general" }, { zone: ["app/src/service.ts", "app/src/vue2"] }), [null, null, null, null]);
  // Le jugement peut désigner un ticket d'interface que sa zone ne trahit pas.
  assert.deepEqual(cooks({ zone: ["app/src/libelles.ts"], cook: "design" }), ["design"]);
  // Un ticket ordinaire est celui d'avant : aucun champ de plus.
  const lu = lireDecoupage(reponse([ticket()]));
  assert.ok("valeur" in lu && lu.valeur.quoi === "tickets");
  assert.equal(Object.hasOwn(lu.valeur.tickets[0] ?? {}, "cook"), false);
  assert.match(illisible(reponse([ticket({ cook: "designer" })])), /ticket 1 : cook inconnu : "designer" — attendu general, design/);
});

test("le cook design ne change rien au calibrage : modèle et effort se lisent comme avant, sans `xhigh` ni `max`", () => {
  const lu = lireDecoupage(reponse([ticket({ zone: ["app/src/vue/carte.js"], modele: "opus", effort: "high" })]));
  assert.ok("valeur" in lu && lu.valeur.quoi === "tickets");
  assert.deepEqual([lu.valeur.tickets[0]?.model, lu.valeur.tickets[0]?.effort, lu.valeur.tickets[0]?.cook], ["opus", "high", "design"]);
  for (const effort of ["xhigh", "max"]) {
    assert.match(illisible(reponse([ticket({ zone: ["app/src/vue/carte.js"], cook: "design", effort })])), /effort hors de ce que le manager pose/);
  }
});

test("le corps d'un ticket d'interface dit au cook qu'il est le cook design, et où lire son profil ; celui d'un autre ticket n'en dit rien", () => {
  const lu = lireDecoupage(reponse([ticket({ zone: ["app/src/vue/carte.js"] }), ticket()]));
  assert.ok("valeur" in lu && lu.valeur.quoi === "tickets");
  const [design, ordinaire] = lu.valeur.tickets.map((prevu) => corpsDuTicket(30, 1, prevu));

  assert.match(design ?? "", /<!-- brigade:decoupage #30\.1 -->\n\n## Cook design\n\nTicket d'interface : il touche la vue de l'app\. .*lis `agents\/cook-design\.md` et suis-le/);
  assert.match(design ?? "", /Calibré `sonnet` \/ `low`, pour le cook design \(`cook:design`\) — Un module\./);
  assert.doesNotMatch(ordinaire ?? "", /cook design|cook:design/i);
  assert.match(ordinaire ?? "", /Calibré `sonnet` \/ `low` — Un module\./);
});
