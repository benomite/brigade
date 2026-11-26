// L'issue d'un auteur qui n'est pas de confiance (#2934, #4422) : retenue. Aucun
// agent ne la lit ; la cuisine y pose une carte de TODO pour l'humain `product`,
// sans rien recopier de l'issue ; sa réponse l'accepte — l'accord est gardé, et le
// manager la juge comme toute autre — ou la ferme.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import type { Humain } from "../../src/aiguillage-humains/aiguillage.ts";
import { DE_CONFIANCE } from "../../src/alimenter.ts";
import type { Commentaire, IssueOuverte } from "../../src/github.ts";
import { auteurSansEcriture } from "../../src/github-etat/auteur.ts";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { ouvrirIssuesEtrangeres, reponseDuProduit, type AtelierDuTri } from "../../src/issue-etrangere/issue-etrangere.ts";
import { ouvrirAcceptes, type Acceptes } from "../../src/trust/acceptes.ts";
import { creerConfiance } from "../../src/trust/trust.ts";
import { chef, cuisine, issue, type Options } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

const PRODUIT: Humain[] = [{ login: "lea", roles: ["product"] }, { login: "sam", roles: ["review"] }];
const CARTE = "<!-- brigade:todo kind=product-question -->";

// Un magasin d'accords neuf, dans un répertoire du test.
function magasin(t: TestContext): Acceptes {
  const dossier = mkdtempSync(join(tmpdir(), "brigade-retenue-"));
  t.after(() => rmSync(dossier, { recursive: true, force: true }));
  return ouvrirAcceptes(join(dossier, "acceptes.json"));
}

// Une cuisine dont le manager est allumé, et ses humains déclarés.
function brigade(t: TestContext, options: Options) {
  const c = cuisine(t, options);
  const assignations: Array<[number, string[]]> = [];
  c.gh.github.assigner = async (numero, logins) => void assignations.push([numero, logins]);
  chef(c.repertoire, "manager.enabled");
  // Un battement, par une autre connexion au journal, comme le tick du runtime : il réveille le manager.
  const autre = ouvrirJournal(c.repertoire);
  aArreter(t, () => autre.fermer());
  const battre = () => void autre.ajouter({ project: c.runtime.projet, ticket: null, author: "runtime", type: "runtime.ticked", payload: { intervalMs: 100 } });
  const commentaires = (numero: number) => c.gh.commentaires.filter(([n]) => n === numero).map(([, corps]) => corps);
  const cartes = (numero: number) => commentaires(numero).filter((corps) => corps.startsWith(CARTE));
  const labels = (numero: number) => c.gh.lire(numero)?.labels ?? [];
  // Trois sondages des issues ouvertes : ce que le manager avait à faire de ce qu'il lit est fait.
  const laisserTourner = async () => {
    for (let i = 0; i < 3; i++) {
      const depart = c.gh.sondages.ouvertes;
      battre();
      await jusqua(() => c.gh.sondages.ouvertes > depart);
    }
  };
  // Ce qu'un humain écrit sous l'issue : sur GitHub, elle en est modifiée.
  let touche = 0;
  const repondre = (numero: number, corps: string, association: string, auteur: string) => {
    c.gh.repondre(numero, corps, association, auteur);
    const lue = c.gh.lire(numero);
    if (lue) c.gh.poser({ ...lue, updatedAt: `2026-10-08T11:00:00.${String(++touche).padStart(3, "0")}Z` });
    battre();
  };
  return { ...c, battre, assignations, commentaires, cartes, labels, laisserTourner, repondre };
}

// L'issue d'un inconnu (#30), et celle d'un membre (#31), servie comme avant.
const etrangere = (acceptes: Acceptes) => ({ issues: [issue(30, []), issue(31, [])], manager: { suite: ["juge-ticket", "juge-ticket"], humains: () => PRODUIT, acceptes } }) satisfies Options;
function avecUnInconnu(t: TestContext) {
  const c = brigade(t, etrangere(magasin(t)));
  c.gh.decrire(30, { body: "The CSV export drops its last row.", association: "NONE", author: "mallory" });
  return c;
}

describe("l'issue d'un auteur qui n'est pas de confiance", { concurrency: 4 }, () => {
  test("retenue : une carte pour l'humain `product`, aucun agent ne la lit, rien sur le rail — l'issue d'un membre est servie comme avant", async (t) => {
    const c = avecUnInconnu(t);
    await jusqua(() => c.cartes(30).length === 1 && c.labels(31).includes("fire"));
    await c.laisserTourner();

    // Aucun agent n'a lu son texte : un seul lancement, le jugement de #31.
    assert.equal(c.lancements().length, 1);
    assert.equal(c.lancements().some((lancement) => JSON.stringify(lancement.args).includes("CSV export drops")), false);
    // La carte, assignée à l'humain `product`, sans rien de l'issue.
    assert.equal(c.cartes(30).length, 1);
    assert.match(c.cartes(30)[0] ?? "", /\nStranger's issue #30: accept it, or close it\?\n\n- \[rail\] Accept it: the manager judges it like any other issue\n- \[close\] Close it\n\nOpened by @mallory, a stranger\./);
    assert.doesNotMatch(c.cartes(30)[0] ?? "", /CSV/);
    assert.deepEqual(c.commentaires(30), c.cartes(30));
    assert.deepEqual(c.labels(30), [CHEF_TODO]);
    assert.deepEqual(c.assignations, [[30, ["lea"]]]);
    // Ni `fire`, ni calibrage, ni `prio:` : la pass ne la voit pas, aucun cook ne part.
    const sondage = await c.gh.github.tickets();
    assert.deepEqual("issues" in sondage ? sondage.issues.map((lue) => lue.number) : null, [31]);
    assert.equal(c.journal.duTicket(30).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"), false);
    // L'issue d'un membre : jugée, lancée et calibrée, sans carte.
    assert.deepEqual(c.labels(31), ["model:haiku", "effort:low", "fire"]);
    assert.deepEqual(c.cartes(31), []);
  });

  test("« accept » de l'humain `product` lève la carte et garde l'accord ; celui de l'auteur ne vaut rien ; le manager juge ensuite l'issue", async (t) => {
    const acceptes = magasin(t);
    const c = brigade(t, etrangere(acceptes));
    c.gh.decrire(30, { body: "The CSV export drops its last row.", association: "NONE", author: "mallory" });
    await jusqua(() => c.cartes(30).length === 1);

    // L'auteur, ou n'importe qui, ne répond pas à la carte.
    c.repondre(30, "accept", "NONE", "mallory");
    await c.laisserTourner();
    assert.deepEqual(c.labels(30), [CHEF_TODO]);
    assert.equal(acceptes.isAccepted({ kind: "issue", id: 30 }), false);

    c.repondre(30, "Accept", "NONE", "lea");
    await jusqua(() => c.labels(30).includes("fire"));
    assert.deepEqual(c.labels(30), ["model:haiku", "effort:low", "fire"]);
    assert.equal(acceptes.isAccepted({ kind: "issue", id: 30 }), true);
    assert.ok(c.commentaires(30).some((corps) => corps.startsWith("<!-- brigade:held-applied geste=accept -->\n**Accepted** by @lea on the TODO card")));
    assert.ok(c.lancements().some((lancement) => JSON.stringify(lancement.args).includes("CSV export drops")));
  });

  test("« close » d'un compte qui a l'écriture ferme l'issue ; « on the rail », la réponse d'avant, l'accepte", async (t) => {
    const c = brigade(t, { issues: [issue(30, []), issue(32, [])], manager: { suite: ["juge-ticket"], humains: () => PRODUIT, acceptes: magasin(t) } });
    c.gh.decrire(30, { association: "NONE", author: "mallory" });
    c.gh.decrire(32, { association: "FIRST_TIME_CONTRIBUTOR", author: "eve" });
    await jusqua(() => c.cartes(30).length === 1 && c.cartes(32).length === 1);

    c.repondre(30, "`on the rail` — the export matters", "NONE", "Lea");
    c.repondre(32, "close", "OWNER", "chef");
    await jusqua(() => c.labels(30).includes("fire") && c.gh.fermetures.includes(32));
    assert.equal(c.labels(32).includes(CHEF_TODO), false);
    assert.equal(c.labels(32).some((label) => label.startsWith("prio:") || label === "fire"), false);
  });

  test("la porte de confiance décide : un collaborateur sans l'écriture est retenu, un compte qui a l'écriture passe, quel que soit le lien que GitHub affiche", async (t) => {
    const droits: Record<string, string> = { lecteur: "read", ecrivain: "write" };
    const confiance = creerConfiance({ chef: "chef", permission: async (login) => droits[login] ?? "none" });
    const c = brigade(t, { issues: [issue(30, []), issue(31, [])], manager: { suite: ["juge-ticket"], humains: () => PRODUIT, acceptes: magasin(t), confiance } });
    c.gh.decrire(30, { body: "READ-ONLY-PLANT", association: "COLLABORATOR", author: "lecteur" });
    c.gh.decrire(31, { body: "From a writer.", association: "CONTRIBUTOR", author: "ecrivain" });
    await jusqua(() => c.cartes(30).length === 1 && c.labels(31).includes("fire"));
    await c.laisserTourner();
    assert.equal(c.lancements().some((lancement) => JSON.stringify(lancement.args).includes("READ-ONLY-PLANT")), false);
    assert.deepEqual(c.labels(30), [CHEF_TODO]);
    assert.deepEqual(c.cartes(31), []);
  });
});

// Un GitHub en mémoire, réduit à ce que la retenue demande.
function atelier(options: { humains?: Humain[]; panne?: { commentaire: number }; acceptes?: Acceptes | null } = {}) {
  const commentaires: Commentaire[] = [];
  const labels: string[] = [];
  const faits: string[] = [];
  const avertissements: string[] = [];
  const accordes: number[] = [];
  let pannes = options.panne?.commentaire ?? 0;
  const github: AtelierDuTri["github"] = {
    commentaires: async () => commentaires.map((lu) => ({ ...lu })),
    commenter: async (_numero, body) => {
      if (pannes > 0) {
        pannes -= 1;
        throw new Error("gh api : HTTP 502");
      }
      commentaires.push({ body, author: "brigade", association: "OWNER", createdAt: "2026-11-08T10:00:00Z" });
    },
    issue: async (numero) => ({ ...issue(numero, [...labels]), body: "" }),
    labelliser: async (_numero, poses) => void labels.push(...poses.filter((pose) => !labels.includes(pose))),
    delabelliser: async (_numero, label) => void (labels.includes(label) && labels.splice(labels.indexOf(label), 1)),
    fermerIssue: async (numero) => void faits.push(`fermer ${numero}`),
    assigner: async (numero, logins) => void faits.push(`assigner ${numero} ${logins.join(",")}`),
  };
  const acceptes: Acceptes | null =
    options.acceptes !== undefined ? options.acceptes : { accept: ({ id }) => void accordes.push(id), isAccepted: ({ id }) => accordes.includes(id) };
  const contexte: AtelierDuTri = {
    github,
    acceptes,
    deConfiance: async ({ association }) => DE_CONFIANCE.includes(association),
    arrete: () => false,
    avertir: (texte) => void avertissements.push(texte),
    humains: () => options.humains ?? PRODUIT,
  };
  const ouverte = (updatedAt = "2026-11-08T09:00:00Z", author = "mallory"): IssueOuverte => ({ ...issue(40, []), body: "Please add dark mode.", association: "NONE", author, updatedAt });
  const ecrire = (body: string, author: string, association = "NONE") => void commentaires.push({ body, author, association, createdAt: "2026-11-08T11:00:00Z" });
  return { contexte, commentaires, labels, faits, avertissements, accordes, ouverte, ecrire };
}

describe("la retenue, sans manager autour", () => {
  test("une carte, une seule, assignée à l'humain `product` ; le tour suivant, sans réponse, ne double rien", async () => {
    const a = atelier();
    const retenues = ouvrirIssuesEtrangeres(a.contexte);
    assert.equal(await retenues.traiter(a.ouverte()), "fait");
    assert.equal(await retenues.traiter(a.ouverte("2026-11-08T09:30:00Z")), "fait");
    assert.equal(a.commentaires.filter((lu) => lu.body.startsWith(CARTE)).length, 1);
    assert.equal(a.commentaires.length, 1);
    assert.deepEqual(a.labels, [CHEF_TODO]);
    assert.deepEqual(a.faits, ["assigner 40 lea"]);
  });

  test("la carte : sa question, ses deux choix, qui l'a ouverte — rien du titre ni du corps de l'issue", async () => {
    const a = atelier();
    await ouvrirIssuesEtrangeres(a.contexte).traiter(a.ouverte());
    const lignes = (a.commentaires.find((lu) => lu.body.startsWith(CARTE))?.body ?? "").split("\n");
    assert.equal(lignes[1], "Stranger's issue #40: accept it, or close it?");
    assert.deepEqual(lignes.slice(3, 5), ["- [rail] Accept it: the manager judges it like any other issue", "- [close] Close it"]);
    assert.ok(lignes.includes("Opened by @mallory, a stranger."));
    assert.equal(lignes.some((ligne) => /dark mode|Ticket 40/.test(ligne)), false);
  });

  test("l'auteur est un humain déclaré dans `humans` : la carte ne parle pas d'inconnu ; absent de `humans`, elle l'en traite", async () => {
    const declare = atelier({ humains: [...PRODUIT, { login: "Mallory", roles: ["client-contact"] }] });
    await ouvrirIssuesEtrangeres(declare.contexte).traiter(declare.ouverte());
    const texte = declare.commentaires.find((lu) => lu.body.startsWith(CARTE))?.body ?? "";
    assert.match(texte, /\nIssue #40: accept it, or close it\?/);
    assert.match(texte, /\nOpened by @mallory, a declared human of the project without write access\./);
    assert.doesNotMatch(texte, /stranger/i);
    const inconnu = atelier({ humains: [] });
    await ouvrirIssuesEtrangeres(inconnu.contexte).traiter(inconnu.ouverte());
    assert.match(inconnu.commentaires.find((lu) => lu.body.startsWith(CARTE))?.body ?? "", /Stranger's issue #40[\s\S]*Opened by @mallory, a stranger\./);
  });

  test("GitHub qui refuse la carte : rien n'est posé de travers, le tour suivant la pose, une seule", async () => {
    const a = atelier({ panne: { commentaire: 1 } });
    const retenues = ouvrirIssuesEtrangeres(a.contexte);
    assert.equal(await retenues.traiter(a.ouverte()), "reste");
    assert.match(a.avertissements[0] ?? "", /issue retenue #40, d'un auteur qui n'est pas de confiance, reprise au tour suivant — gh api : HTTP 502/);
    assert.equal(await retenues.traiter(a.ouverte()), "fait");
    assert.equal(a.commentaires.filter((lu) => lu.body.startsWith(CARTE)).length, 1);
  });

  test("« accept » : la carte levée, l'accord gardé, le commentaire qui le dit ; l'auteur, lui, n'accepte rien", async () => {
    const a = atelier();
    const retenues = ouvrirIssuesEtrangeres(a.contexte);
    await retenues.traiter(a.ouverte());
    a.ecrire("accept", "mallory");
    await retenues.traiter(a.ouverte("2026-11-08T11:30:00Z"));
    assert.deepEqual(a.accordes, []);
    a.ecrire("Accept it, thanks.", "lea");
    assert.equal(await retenues.traiter(a.ouverte("2026-11-08T12:00:00Z")), "fait");
    assert.deepEqual(a.accordes, [40]);
    assert.deepEqual(a.labels, []);
    assert.match(a.commentaires.at(-1)?.body ?? "", /^<!-- brigade:held-applied geste=accept -->\n\*\*Accepted\*\* by @lea on the TODO card: the manager judges #40 like any other issue\.$/);
  });

  test("des accords illisibles : « accept » ne s'applique pas, la carte reste, et la cuisine le dit, une fois par état", async () => {
    const a = atelier({ acceptes: null });
    const retenues = ouvrirIssuesEtrangeres(a.contexte);
    await retenues.traiter(a.ouverte());
    a.ecrire("accept", "chef", "OWNER");
    assert.equal(await retenues.traiter(a.ouverte("2026-11-08T12:00:00Z")), "reste");
    assert.equal(await retenues.traiter(a.ouverte("2026-11-08T12:00:00Z")), "fait");
    assert.deepEqual(a.labels, [CHEF_TODO]);
    assert.equal(a.avertissements.length, 1);
    assert.match(a.avertissements[0] ?? "", /l'issue #40 est acceptée par @chef, mais l'accord ne peut pas se garder .* elle reste retenue/);
  });

  test("le bouton `[rail]` de l'app vaut « accept » ; une réponse appliquée par le tri d'avant ne pose plus de carte", async () => {
    const a = atelier();
    const retenues = ouvrirIssuesEtrangeres(a.contexte);
    await retenues.traiter(a.ouverte());
    a.ecrire("<!-- brigade:reponse gesture=rail -->\nAccept it: the manager judges it like any other issue", "chef", "OWNER");
    await retenues.traiter(a.ouverte("2026-11-08T12:00:00Z"));
    assert.deepEqual(a.accordes, [40]);
    const avant = atelier();
    avant.commentaires.push({ body: "<!-- brigade:triage-applied geste=rail label=prio:2 -->\n**On the rail**", author: "brigade", association: "OWNER", createdAt: "" });
    assert.equal(await ouvrirIssuesEtrangeres(avant.contexte).traiter(avant.ouverte()), "fait");
    assert.equal(avant.commentaires.length, 1);
  });

  test("sans humain `product` déclaré, la carte va au chef : seul un auteur de confiance y répond", async () => {
    const deConfiance = async ({ association }: Commentaire) => DE_CONFIANCE.includes(association);
    const lus = (author: string, association: string, body: string): Commentaire[] => [{ author, association, body, createdAt: "" }];
    assert.equal(await reponseDuProduit(lus("lea", "NONE", "close"), null, deConfiance), null);
    assert.deepEqual(await reponseDuProduit(lus("chef", "MEMBER", "Close it, please."), null, deConfiance), { geste: "close", par: "chef" });
    assert.equal(await reponseDuProduit(lus("chef", "OWNER", "Why close it?"), null, deConfiance), null);
    assert.equal(await reponseDuProduit(lus("brigade", "OWNER", "<!-- brigade:todo kind=product-question -->\nclose"), null, deConfiance), null);
    assert.equal(await reponseDuProduit(lus("chef", "OWNER", "accepted, but later"), null, deConfiance), null);
    assert.deepEqual(await reponseDuProduit(lus("chef", "OWNER", "on the rail prio:3"), null, deConfiance), { geste: "accept", par: "chef" });
  });

  test("l'auteur sans l'écriture : ni le propriétaire, ni un membre, ni un collaborateur — sauf quand la porte de confiance dit autrement", () => {
    assert.deepEqual(
      ["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"].filter((association) => auteurSansEcriture({ association })),
      ["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"],
    );
    assert.equal(auteurSansEcriture({ association: "COLLABORATOR", author: "lecteur" }, [], false), true);
    assert.equal(auteurSansEcriture({ association: "NONE", author: "ecrivain" }, [], true), false);
    // Le robot du projet reste un agent de la cuisine, quoi que dise la porte.
    assert.equal(auteurSansEcriture({ association: "NONE", author: "github-actions[bot]" }, [], false), false);
  });
});
