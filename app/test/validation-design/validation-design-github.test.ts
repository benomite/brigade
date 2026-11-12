// La carte « Validate its screen » (ticket 3185), de bout en bout sur une carte d'essai : le runtime la pose comme la pass
// la pose (runtime/src/validation-design/, `retenirLeDesign`) sur un faux GitHub ; l'app la lit comme son TODO la lit
// (tableau/attente-du-chef.ts) — la question, la PR, les captures avant et après — ; puis chaque geste joue la vraie
// commande du runtime (`principal` de runtime/src/validation-design/commande.ts) sur le même faux : « Validate » merge la PR
// et ferme la carte, « Send back to the kitchen » renvoie la livraison à un cook avec le commentaire, et ferme la carte.
// Aucun runtime ne tourne, aucun `gh` n'est lancé.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Sortie } from "../../../runtime/src/appel.ts";
import { principal } from "../../../runtime/src/validation-design/commande.ts";
import { corpsDeCeQuiEstFait } from "../../../runtime/src/validation-design/brief.ts";
import { retenirLeDesign } from "../../../runtime/src/validation-design/validation-design.ts";
import { carteDuChefDeTodo } from "../../src/carte-todo.ts";
import { tenirFaits } from "../../src/faits.ts";
import { lireCeQuiAttendLeChef } from "../../src/tableau/attente-du-chef.ts";
import type { AppelGitHub } from "../../src/tableau/client.ts";
import { briefDuCorps, INCONNUE, jouerLaValidation, SORTE_DE_VALIDATION, validationDuCorps, VIDE, type CommandeChargee, type CommandeDuRuntime } from "../../src/vue/validation-design/validation-design-github.ts";

const DEPOT = "chef/parade";
const SHA = "3f9c2a1b7d4e5f60718293a4b5c6d7e8f9012345";
const TICKET = 58;
const PR = 60;

type IssueFausse = { title: string; body: string; labels: Set<string>; state: "open" | "closed"; comments: Array<{ body: string; author: string; association: string; createdAt: string }> };

// Un faux GitHub qui tient le ticket, sa PR verte, et ce que le runtime y écrit.
function fauxGitHub() {
  const issues = new Map<number, IssueFausse>([[TICKET, { title: "Export the journal as CSV", body: "", labels: new Set(["fire", "in-pass"]), state: "open", comments: [] }]]);
  // Les commentaires de la PR : ce que la station y a posté, dont ce que le cook a changé à l'écran (ticket 3330).
  const surLaPR: IssueFausse["comments"] = [];
  let prochaine = 61;
  const pr = { number: PR, url: `https://github.com/${DEPOT}/pull/${PR}`, base: "main", sha: SHA, state: "open" as "open" | "closed", merged: false, enRetard: false, mergeePar: null };
  const merges: Array<[number, string]> = [];
  const sienne = (numero: number) => issues.get(numero) ?? assert.fail(`pas d'issue #${numero}`);
  const github = {
    creerIssue: async ({ titre, corps, labels }: { titre: string; corps: string; labels: string[] }) => {
      const numero = prochaine++;
      issues.set(numero, { title: titre, body: corps, labels: new Set(labels), state: "open", comments: [] });
      return numero;
    },
    commenter: async (numero: number, corps: string) => void sienne(numero).comments.push({ body: corps, author: "brigade", association: "OWNER", createdAt: "2026-11-11T12:00:00Z" }),
    delabelliser: async (numero: number, label: string) => void sienne(numero).labels.delete(label),
    fermerIssue: async (numero: number) => void (sienne(numero).state = "closed"),
    commentaires: async (numero: number) => (numero === PR ? surLaPR : sienne(numero).comments),
    issue: async (numero: number) => {
      const lue = issues.get(numero);
      return lue === undefined ? null : { number: numero, title: lue.title, labels: [...lue.labels], state: lue.state, createdAt: "2026-11-11T12:00:00Z", updatedAt: "2026-11-11T12:00:00Z", url: `https://github.com/${DEPOT}/issues/${numero}`, body: lue.body };
    },
    ouvertes: async () => ({
      inchange: false as const,
      issues: [...issues].filter(([, { state }]) => state === "open").map(([number, { title, body, labels }]) => ({ number, title, labels: [...labels], body, association: "OWNER" })),
      confirmer: () => {},
    }),
    prDeBranche: async (branche: string) => (branche === `cook/${TICKET}-github` ? { ...pr } : null),
    merger: async (numero: number, sha: string) => {
      merges.push([numero, sha]);
      pr.state = "closed";
      pr.merged = true;
      return { fait: true as const };
    },
    fermer: () => {},
  };
  // L'API de GitHub telle que l'app la lit pour son TODO : les issues ouvertes au label demandé, et leurs commentaires.
  const appeler: AppelGitHub = async (chemin) => {
    const [route, requete = ""] = chemin.split("?");
    const page = new URLSearchParams(requete).get("page");
    if (page !== null && page !== "1") return { status: 200, data: [] };
    if (route === `/repos/${DEPOT}/issues`) {
      const label = new URLSearchParams(requete).get("labels") ?? "";
      const data = [...issues]
        .filter(([, { state, labels }]) => state === "open" && labels.has(label))
        .map(([number, { title, body, labels }]) => ({ number, title, body, labels: [...labels].map((name) => ({ name })), html_url: `https://github.com/${DEPOT}/issues/${number}`, created_at: "2026-11-11T12:00:00Z" }));
      return { status: 200, data };
    }
    const commentaires = /^\/repos\/chef\/parade\/issues\/(\d+)\/comments$/.exec(route ?? "");
    if (commentaires !== null) return { status: 200, data: sienne(Number(commentaires[1])).comments.map(({ body, createdAt }) => ({ body, created_at: createdAt })) };
    return { status: 404, data: null };
  };
  return { github, appeler, issues, merges, pr, surLaPR };
}

// La carte posée par le runtime, comme la pass la pose sur une livraison design verte qui porte ses captures. `avant` : ce
// qui se passe sur le faux avant que la pass ne la pose.
async function carteDEssai(avant: (faux: ReturnType<typeof fauxGitHub>) => void = () => {}) {
  const faux = fauxGitHub();
  avant(faux);
  const motif = await retenirLeDesign(faux.github, {
    depot: DEPOT,
    station: "box/claude",
    ticket: { number: TICKET, title: "Export the journal as CSV", labels: ["cook:design"] },
    pr: { number: PR, sha: SHA },
    fichiers: ["app/src/vue/rail.js", `docs/captures/${TICKET}/rail-avant.png`, `docs/captures/${TICKET}/rail-apres.png`],
    renvoyer: async () => assert.fail("une livraison qui porte ses captures n'est pas renvoyée"),
  });
  assert.match(motif ?? "", /card #61/);
  return faux;
}

// Ce que l'app lit de la carte, et ce que les faits en gardent.
async function lue(appeler: AppelGitHub) {
  const attente = await lireCeQuiAttendLeChef({ depot: DEPOT, appeler });
  assert.equal(attente.lue, true);
  return attente.lue ? attente.attentes : [];
}

// La commande du runtime, sur le faux GitHub, et sa `Sortie` — ce que main.ts charge du runtime. `appels` : les arguments de
// chaque appel.
const estUneSortie = (erreur: unknown): erreur is Sortie => erreur instanceof Sortie;
const commandeSur =
  (faux: ReturnType<typeof fauxGitHub>, appels: string[][] = []): (() => Promise<CommandeChargee>) =>
  async () => ({ principal: (appel) => (appels.push(appel.args), principal(appel, () => faux.github as never)), estUneSortie });
const chargee = (principal: CommandeDuRuntime) => async (): Promise<CommandeChargee> => ({ principal, estUneSortie });

describe("l'app lit la carte que le runtime pose", () => {
  test("sa question, sa PR, son ticket et les captures avant et après de chaque écran, au commit jugé vert", async () => {
    const faux = await carteDEssai();
    const [carte, ...autres] = await lue(faux.appeler);
    assert.deepEqual(autres, []);
    assert.equal(carte?.ticket, 61);
    assert.equal(carte?.chef?.sorte, SORTE_DE_VALIDATION);
    const design = carte?.chef?.design ?? assert.fail("la carte ne dit pas ce qu'elle valide");
    assert.equal(design.pr, PR);
    assert.equal(design.ticket, TICKET);
    assert.equal(design.url, `https://github.com/${DEPOT}/pull/${PR}`);
    assert.equal(design.captures.complet, true);
    assert.deepEqual(
      design.captures.ecrans.map(({ ecran, avant, apres }) => [ecran, avant?.includes(`/blob/${SHA}/docs/captures/${TICKET}/rail-avant.png`), apres?.includes(`/blob/${SHA}/docs/captures/${TICKET}/rail-apres.png`)]),
      [["rail", true, true]],
    );
    // Sa ligne, au second : les deux gestes de la carte.
    assert.match(carte?.ligne ?? "", /Does the screen of #58 look right\? .* — on its Todo card: Validate, or Send back to the kitchen with a comment$/);
  });

  test("la carte de TODO : sa question, ses captures, sa PR — ni choix ni réponse libre", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    const todo = carteDuChefDeTodo(carte?.chef ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de TODO");
    assert.match(todo.question ?? "", /^Does the screen of #58 look right\?/);
    assert.deepEqual(todo.validation, { pr: PR, ticket: TICKET });
    assert.deepEqual(todo.choix, []);
    assert.equal(todo.contexte, undefined, "le lien de la PR est sur la carte, pas en contexte");
    assert.deepEqual(
      todo.captures?.ecrans.map(({ ecran, avant, apres }) => [ecran, avant.livree, apres.livree, avant.legende, apres.legende]),
      [["rail", true, true, "rail — before", "rail — after"]],
    );
    assert.equal(todo.captures?.incomplete, undefined);
  });

  test("les faits de l'app gardent ce que la carte valide : sa PR s'ouvre, ses captures se lisent", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    const tenus = tenirFaits(() => new Map());
    const faits = { etat: "ouverte", lu: "2026-11-11T12:00:00Z", dernierTick: "2026-11-11T12:00:00Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [{ ticket: 61, titre: carte?.titre, url: carte?.url, chef: carte?.chef }] };
    tenus.recevoir({ projet: "parade", demande: 0, a: "2026-11-11T12:00:00Z", sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
    assert.equal(tenus.chef("parade", 61)?.design?.pr, PR);
    assert.equal(tenus.pr("parade", 61), `https://github.com/${DEPOT}/pull/${PR}`);
    assert.match(tenus.capture("parade", 61, "rail", "apres") ?? "", new RegExp(`/blob/${SHA}/docs/captures/58/rail-apres\\.png\\?raw=true$`));
    // Ce qui n'a pas la forme d'une carte n'est pas gardé.
    tenus.recevoir({ projet: "parade", demande: 1, a: "2026-11-11T12:01:00Z", sorties: [{ commande: "facts", texte: JSON.stringify({ ...faits, attend: [{ ticket: 61, titre: "x", url: carte?.url, chef: { ...carte?.chef, design: { pr: "60" } } }] }) }] });
    assert.equal(tenus.chef("parade", 61)?.design, undefined);
  });

  test("son brief (ticket 3330) : ce que le ticket demandait et ce que le cook a changé à l'écran, posté sur la PR — sur la carte de TODO et dans les faits", async () => {
    const faux = await carteDEssai((avant) => {
      (avant.issues.get(TICKET) ?? assert.fail("pas de ticket")).body = "## Context\n\nThe chef copies the journal by hand every week.\n\n## Acceptance criteria\n\n- a CSV button";
      avant.surLaPR.push({ body: corpsDeCeQuiEstFait(["the rail shows an Export as CSV button", "an empty journal greys it out"]), author: "brigade", association: "OWNER", createdAt: "2026-11-11T11:00:00Z" });
    });
    const [carte] = await lue(faux.appeler);
    const attendu = { demande: "Export the journal as CSV — The chef copies the journal by hand every week.", fait: ["the rail shows an Export as CSV button", "an empty journal greys it out"] };
    assert.deepEqual(carte?.chef?.design?.brief, attendu);
    assert.deepEqual(carteDuChefDeTodo(carte?.chef ?? assert.fail("pas de carte"))?.brief, attendu);
    const tenus = tenirFaits(() => new Map());
    const faits = { etat: "ouverte", lu: "2026-11-11T12:00:00Z", dernierTick: "2026-11-11T12:00:00Z", compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 1, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [{ ticket: 61, titre: carte?.titre, url: carte?.url, chef: carte?.chef }] };
    tenus.recevoir({ projet: "parade", demande: 0, a: "2026-11-11T12:00:00Z", sorties: [{ commande: "facts", texte: JSON.stringify(faits) }] });
    assert.deepEqual(tenus.chef("parade", 61)?.design?.brief, attendu);
  });

  test("sans résumé posté sur la PR, le brief n'a rien de fait et garde ce qui était demandé ; une carte d'avant le ticket 3330 garde le titre de son ticket", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    assert.deepEqual(carte?.chef?.design?.brief, { demande: "Export the journal as CSV", fait: null });
    const ancienne = [`<!-- brigade:validation-design pr=${PR} ticket=${TICKET} sha=${SHA} -->`, "**Does the screen of #58 look right?**", "", "Ticket: #58 — Export the journal as CSV", `Pull request: https://github.com/${DEPOT}/pull/${PR}`].join("\n");
    assert.deepEqual(briefDuCorps(ancienne), { demande: "Export the journal as CSV", fait: null });
    assert.deepEqual(briefDuCorps("nothing"), { demande: "", fait: null });
  });

  test("une image d'un autre dépôt, d'un autre commit ou hors du dossier du ticket n'est pas une capture de la carte", () => {
    const ailleurs = (depot: string, sha: string, chemin: string) => `![x](https://github.com/${depot}/blob/${sha}/${chemin}?raw=true)`;
    const corps = [
      `<!-- brigade:validation-design pr=${PR} ticket=${TICKET} sha=${SHA} -->`,
      ailleurs("intrus/autre", SHA, "docs/captures/58/rail-avant.png"),
      ailleurs(DEPOT, "aaaaaaa", "docs/captures/58/rail-avant.png"),
      ailleurs(DEPOT, SHA, "docs/captures/59/rail-avant.png"),
      ailleurs(DEPOT, SHA, "docs/captures/58/fiche-avant.png"),
    ].join("\n");
    assert.deepEqual(validationDuCorps(DEPOT, corps)?.captures, { complet: false, ecrans: [{ ecran: "fiche", avant: `https://github.com/${DEPOT}/blob/${SHA}/docs/captures/58/fiche-avant.png?raw=true`, apres: null }] });
  });

  test("une issue dont le corps ne dit pas sa PR : la carte le dit, sans geste à jouer", async () => {
    const faux = await carteDEssai();
    (faux.issues.get(61) ?? assert.fail("pas de carte")).body = "Someone rewrote the card.";
    const [carte] = await lue(faux.appeler);
    assert.equal(carte?.chef?.design, undefined);
    const todo = carteDuChefDeTodo(carte?.chef ?? assert.fail("pas de carte")) ?? assert.fail("pas de carte de TODO");
    assert.deepEqual(todo.validation, { illisible: "its issue does not say which pull request it validates: validate it on GitHub" });
    assert.equal(todo.captures, undefined);
  });
});

describe("les deux gestes jouent la commande du runtime", () => {
  test("« Validate » : `validate chef/parade#60` — la PR est mergée à la tête jugée verte, la carte fermée, elle quitte TODO", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    const appels: string[][] = [];
    const rendu = await jouerLaValidation({ depot: DEPOT, design: carte?.chef?.design, geste: { geste: "valider" }, env: {}, commande: commandeSur(faux, appels) });
    assert.deepEqual(appels, [["validate", `${DEPOT}#${PR}`]]);
    assert.deepEqual(rendu, { fait: `${DEPOT}#${PR} validated: merged, card #61 closed — ticket #${TICKET} is served` });
    assert.deepEqual(faux.merges, [[PR, SHA]]);
    assert.equal(faux.issues.get(61)?.state, "closed");
    assert.deepEqual(await lue(faux.appeler), [], "la carte a quitté TODO");
  });

  test("« Send back to the kitchen » : `send-back chef/parade#60 --comment …` — le commentaire part au ticket, rien n'est mergé, la carte quitte TODO", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    const appels: string[][] = [];
    const rendu = await jouerLaValidation({ depot: DEPOT, design: carte?.chef?.design, geste: { geste: "renvoyer", commentaire: "  The export button is cut off.\r\nKeep it on one line.  " }, env: {}, commande: commandeSur(faux, appels) });
    assert.deepEqual(appels, [["send-back", `${DEPOT}#${PR}`, "--comment", "The export button is cut off.\nKeep it on one line."]]);
    assert.match("fait" in rendu ? rendu.fait : assert.fail(JSON.stringify(rendu)), /sent back: #58 goes back to a cook with your comment, card #61 closed/);
    assert.deepEqual(faux.merges, []);
    assert.ok(faux.issues.get(TICKET)?.comments.some(({ body }) => body.includes("The export button is cut off.\nKeep it on one line.")));
    assert.equal(faux.issues.get(TICKET)?.labels.has("in-pass"), false);
    assert.deepEqual(await lue(faux.appeler), [], "la carte a quitté TODO");
  });

  test("un renvoi sans commentaire, ou une carte que la lecture ne porte plus : rien ne part", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    let lancee = false;
    const commande = chargee(async () => void (lancee = true));
    assert.deepEqual(await jouerLaValidation({ depot: DEPOT, design: carte?.chef?.design, geste: { geste: "renvoyer", commentaire: "  \n " }, env: {}, commande }), { refus: VIDE, detail: "" });
    assert.deepEqual(await jouerLaValidation({ depot: DEPOT, design: undefined, geste: { geste: "valider" }, env: {}, commande }), { refus: INCONNUE, detail: "" });
    assert.equal(lancee, false);
    assert.equal(faux.issues.get(61)?.state, "open");
  });

  test("un refus du runtime — la PR fermée sans merge — se dit en une ligne, son détail au survol, et la carte reste", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    faux.pr.state = "closed";
    const rendu = await jouerLaValidation({ depot: DEPOT, design: carte?.chef?.design, geste: { geste: "valider" }, env: {}, commande: commandeSur(faux) });
    assert.ok("refus" in rendu);
    assert.match(rendu.refus, /^nothing was done: PR #60 is closed without being merged/);
    assert.match(rendu.detail, /^brigade : PR #60 is closed without being merged/);
    assert.deepEqual(faux.merges, []);
    assert.equal((await lue(faux.appeler)).length, 1, "la carte reste dans TODO");
  });

  test("« Validate » après une mise à jour de la branche depuis sa base (ticket 3332) : rien ne se merge tout de suite, la validation est gardée sur le ticket, la carte quitte TODO et dit ce qui suit", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    faux.pr.sha = "b".repeat(40);
    const rendu = await jouerLaValidation({ depot: DEPOT, design: carte?.chef?.design, geste: { geste: "valider" }, env: {}, commande: commandeSur(faux) });
    assert.deepEqual(rendu, { fait: `${DEPOT}#${PR} validated: your validation is kept, card #61 closed — the branch was updated since the card and is being checked again; the pass merges it once its head is green` });
    assert.deepEqual(faux.merges, []);
    assert.deepEqual(await lue(faux.appeler), [], "la carte a quitté TODO");
    assert.ok(faux.issues.get(TICKET)?.comments.some(({ body }) => body.startsWith(`<!-- brigade:validation-design-validee carte=61 pr=${PR} sha=${SHA} -->\nValidated by the chef on card #61 — merge pending.`)));
  });

  test("une commande qui ne se charge pas, ou qui lève, se dit : rien n'est fait", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    const rendu = await jouerLaValidation({ depot: DEPOT, design: carte?.chef?.design, geste: { geste: "valider" }, env: {}, commande: async () => assert.fail("the runtime is not there") });
    assert.equal("refus" in rendu && rendu.refus, "nothing was done: the kitchen's command could not run");
    assert.match("refus" in rendu ? rendu.detail : "", /the runtime is not there/);
  });

  test("une erreur qui porte un `code` sans être la `Sortie` du runtime — une erreur système — n'est pas lue comme son refus", async () => {
    const faux = await carteDEssai();
    const [carte] = await lue(faux.appeler);
    const systeme = Object.assign(new Error("spawn gh ENOENT"), { code: -2 });
    const rendu = await jouerLaValidation({ depot: DEPOT, design: carte?.chef?.design, geste: { geste: "valider" }, env: {}, commande: chargee(async ({ redire }) => (redire("brigade : not this line"), Promise.reject(systeme))) });
    assert.deepEqual(rendu, { refus: "nothing was done: the kitchen's command could not run", detail: "spawn gh ENOENT" });
    assert.equal(faux.issues.get(61)?.state, "open");
  });
});
