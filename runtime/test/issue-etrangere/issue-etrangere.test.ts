// L'issue d'un auteur sans l'écriture sur le dépôt (#2934) : le manager y
// poste une proposition de tri, puis une carte de TODO pour l'humain
// `product` ; rien n'entre sur le rail avant sa réponse, qui la met sur le
// rail avec son `prio:` ou la ferme.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Humain } from "../../src/aiguillage-humains/aiguillage.ts";
import type { Commentaire, IssueOuverte } from "../../src/github.ts";
import { auteurSansEcriture } from "../../src/github-etat/auteur.ts";
import { CHEF_TODO } from "../../src/github-seul/carte-todo/carte-todo.ts";
import { carteDuTriage, corpsDuTriage, lireTriage, MARQUE_DU_TRI, ouvrirIssuesEtrangeres, PRIO_PAR_DEFAUT, propositionDu, reponseDuProduit, type AtelierDuTri, type Triage } from "../../src/issue-etrangere/issue-etrangere.ts";
import { MARQUEUR_MANAGER } from "../../src/juger.ts";
import { chef, cuisine, issue, type Options } from "../aides/cuisine.ts";
import { ouvrirJournal } from "../../src/journal.ts";
import { aArreter, jusqua } from "../outils.ts";

const PRODUIT: Humain[] = [{ login: "lea", roles: ["product"] }, { login: "sam", roles: ["review"] }];
const CARTE = "<!-- brigade:todo kind=product-question -->";

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
  const tris = (numero: number) => commentaires(numero).filter((corps) => corps.includes("<!-- brigade:triage triage="));
  const cartes = (numero: number) => commentaires(numero).filter((corps) => corps.startsWith(CARTE));
  const labels = (numero: number) => c.gh.lire(numero)?.labels ?? [];
  const lancementsDeTri = () => c.lancements().filter((lancement) => (lancement.args[1] ?? "").startsWith(MARQUE_DU_TRI));
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
  return { ...c, battre, assignations, tris, cartes, labels, lancementsDeTri, laisserTourner, repondre };
}

// L'issue d'un inconnu (#30), et celle d'un membre (#31), servie comme avant.
// #31, l'issue neuve d'un membre, est jugée avant le tri de #30 (#3422).
const ETRANGERE = { issues: [issue(30, []), issue(31, [])], manager: { suite: ["juge-ticket", "trie-ticket"], humains: () => PRODUIT } } satisfies Options;
function avecUnInconnu(t: TestContext) {
  const c = brigade(t, ETRANGERE);
  c.gh.decrire(30, { body: "The CSV export drops its last row.", association: "NONE" });
  return c;
}

describe("l'issue d'un auteur sans l'écriture", { concurrency: 4 }, () => {
  test("une proposition de tri, une seule ; une carte pour l'humain `product` ; rien sur le rail tant qu'elle attend — l'issue d'un membre est servie comme avant", async (t) => {
    const c = avecUnInconnu(t);
    await jusqua(() => c.cartes(30).length === 1 && c.labels(31).includes("fire"));
    await c.laisserTourner();

    // Un seul commentaire de tri, sous la forme `ticket` avec son `prio:`.
    assert.equal(c.tris(30).length, 1);
    assert.match(c.tris(30)[0] ?? "", /^<!-- brigade:manager -->\n<!-- brigade:triage triage=ticket prio=2 -->\n\*\*Manager's triage proposal: ticket, with `prio:2`\.\*\*\n\nA real need: the export drops the last row\./);
    assert.equal(c.lancementsDeTri().length, 1);
    assert.match(c.lancementsDeTri()[0]?.args[1] ?? "", /The CSV export drops its last row\./);
    // La carte, assignée à l'humain `product`.
    assert.equal(c.cartes(30).length, 1);
    assert.match(c.cartes(30)[0] ?? "", /\nStranger's issue #30: put it on the rail, or close it\?\n\n- \[rail\] Put it on the rail with `prio:2`\n- \[close\] Close it\n\nAsks: /);
    assert.deepEqual(c.labels(30), [CHEF_TODO]);
    assert.deepEqual(c.assignations, [[30, ["lea"]]]);
    // Ni `fire`, ni calibrage, ni `prio:` : la pass ne la voit pas, aucun cook ne part.
    const sondage = await c.gh.github.tickets();
    assert.deepEqual("issues" in sondage ? sondage.issues.map((lue) => lue.number) : null, [31]);
    assert.equal(c.journal.duTicket(30).some((e) => e.type === "manager.judged" || e.type === "ticket.arrived"), false);
    // L'issue d'un membre : jugée, lancée et calibrée, sans tri ni carte.
    assert.deepEqual(c.labels(31), ["fire", "model:haiku", "effort:low"]);
    assert.deepEqual(c.tris(31), []);
    assert.deepEqual(c.cartes(31), []);
  });

  test("« on the rail » de l'humain `product` pose le `prio:` proposé et lève la carte ; celui de l'auteur ne vaut rien ; le manager juge ensuite l'issue", async (t) => {
    const c = avecUnInconnu(t);
    // Le `prio:2` que la cuisine posera, GitHub le dira posé par un compte qui a l'écriture — le sien (#2619).
    c.gh.garantir(30, ["prio:2"]);
    await jusqua(() => c.cartes(30).length === 1);

    // L'auteur, ou n'importe qui, ne répond pas à la carte.
    c.repondre(30, "on the rail prio:1", "NONE", "mallory");
    await c.laisserTourner();
    assert.deepEqual(c.labels(30), [CHEF_TODO]);

    c.repondre(30, "On the rail", "NONE", "lea");
    // Puis le manager la juge, comme l'issue d'un inconnu qu'un membre a priorisée.
    await jusqua(() => c.labels(30).includes("fire"));
    assert.deepEqual(c.labels(30), ["prio:2", "fire", "model:haiku", "effort:low"]);
    assert.ok(c.gh.commentaires.some(([n, corps]) => n === 30 && corps.startsWith("<!-- brigade:triage-applied geste=rail label=prio:2 -->\n**On the rail**: `prio:2` put on #30, as @lea answered")));
    assert.deepEqual(c.gh.labellisations.filter(([n]) => n === 30), [[30, [CHEF_TODO]], [30, ["prio:2"]], [30, ["fire", "model:haiku", "effort:low"]]]);
    assert.equal(c.tris(30).length, 1);
  });

  test("« on the rail prio:4 » corrige la priorité proposée ; « close » ferme l'issue", async (t) => {
    const c = brigade(t, { issues: [issue(30, []), issue(32, [])], manager: { suite: ["trie-ticket", "trie-hors-perimetre"], humains: () => PRODUIT } });
    c.gh.decrire(30, { association: "NONE" });
    c.gh.decrire(32, { association: "FIRST_TIME_CONTRIBUTOR" });
    await jusqua(() => c.cartes(30).length === 1 && c.cartes(32).length === 1);
    assert.match(c.tris(32)[0] ?? "", /triage=out-of-scope -->\n\*\*Manager's triage proposal: out of scope\.\*\*/);

    c.repondre(30, "`on the rail` prio:4 — the export matters more than that", "NONE", "Lea");
    // Le chef répond aussi : un compte qui a l'écriture.
    c.repondre(32, "close", "OWNER", "chef");
    await jusqua(() => c.labels(30).includes("prio:4") && c.gh.fermetures.includes(32));
    assert.deepEqual(c.labels(30), ["prio:4"]);
    assert.equal(c.labels(32).includes(CHEF_TODO), false);
    assert.equal(c.labels(32).some((label) => label.startsWith("prio:") || label === "fire"), false);
  });
});

// Un GitHub en mémoire, réduit à ce que le tri demande.
function atelier(reponses: Array<string | null>, options: { humains?: Humain[]; panne?: { commentaire: number } } = {}) {
  const commentaires: Commentaire[] = [];
  const labels: string[] = [];
  const faits: string[] = [];
  const avertissements: string[] = [];
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
  const lancees: string[] = [];
  const contexte: AtelierDuTri = {
    github,
    depotGitHub: "acme/brigade",
    demander: async <T,>(_sujet: unknown, consigne: string, lire: (message: string | null) => { valeur: T } | { illisible: string }) => {
      lancees.push(consigne);
      return { run: `trie-${lancees.length}`, ...lire(reponses.shift() ?? null) };
    },
    peutJuger: () => true,
    arrete: () => false,
    avertir: (texte) => void avertissements.push(texte),
    humains: () => options.humains ?? PRODUIT,
  };
  const ouverte = (updatedAt = "2026-11-08T09:00:00Z", author = "mallory"): IssueOuverte => ({ ...issue(40, []), body: "Please add dark mode.", association: "NONE", author, updatedAt });
  const ecrire = (body: string, author: string, association = "NONE") => void commentaires.push({ body, author, association, createdAt: "2026-11-08T11:00:00Z" });
  return { contexte, commentaires, labels, faits, avertissements, lancees, ouverte, ecrire };
}

const tri = (valeur: Triage) => JSON.stringify(valeur.triage === "duplicate" ? { triage: "duplicate", de: valeur.de, motif: valeur.motif } : valeur);

describe("le tri, sans manager autour", () => {
  test("les trois formes : doublon avec son numéro, hors périmètre, ticket avec son `prio:` — un seul commentaire chacune, relu tel quel", async () => {
    for (const valeur of [{ triage: "duplicate", de: 31, motif: "Same as #31." }, { triage: "out-of-scope", motif: "Not this project." }, { triage: "ticket", prio: 3, motif: "A real need." }] satisfies Triage[]) {
      const a = atelier([tri(valeur)]);
      const tris = ouvrirIssuesEtrangeres(a.contexte);
      assert.equal(await tris.traiter(a.ouverte(), [a.ouverte(), { ...issue(31, []), body: "", association: "OWNER" }]), "fait");
      // Le tour suivant, sans réponse : rien de plus.
      assert.equal(await tris.traiter(a.ouverte("2026-11-08T09:30:00Z"), []), "fait");
      const proposes = a.commentaires.filter((lu) => lu.body.includes("<!-- brigade:triage triage="));
      assert.equal(proposes.length, 1);
      assert.ok(proposes[0]?.body.startsWith(MARQUEUR_MANAGER));
      assert.deepEqual(propositionDu(proposes[0]?.body ?? "")?.triage, valeur.triage);
      assert.match(proposes[0]?.body ?? "", { duplicate: /duplicate of #31/, "out-of-scope": /out of scope/, ticket: /ticket, with `prio:3`/ }[valeur.triage]);
      assert.equal(a.commentaires.filter((lu) => lu.body.startsWith(CARTE)).length, 1);
      assert.deepEqual(a.labels, [CHEF_TODO]);
      assert.deepEqual(a.faits, ["assigner 40 lea"]);
      assert.equal(a.lancees.length, 1);
      assert.match(a.lancees[0] ?? "", /- #31 — Ticket 31/);
    }
  });

  test("la carte d'un inconnu : ce que l'issue demande et qui l'a ouverte, la recommandation en premier choix, l'autre ensuite", async () => {
    const rail = atelier([tri({ triage: "ticket", prio: 2, motif: "A real need.\nIt loses data." })]);
    await ouvrirIssuesEtrangeres(rail.contexte).traiter(rail.ouverte(), []);
    const texte = rail.commentaires.find((lu) => lu.body.startsWith(CARTE))?.body ?? "";
    const lignes = texte.split("\n");
    assert.equal(lignes[1], "Stranger's issue #40: put it on the rail, or close it?");
    assert.deepEqual(lignes.slice(3, 5), ["- [rail] Put it on the rail with `prio:2`", "- [close] Close it"]);
    assert.ok(lignes.includes("Asks: Ticket 40 — Please add dark mode."));
    assert.ok(lignes.includes("Opened by @mallory, a stranger."));
    assert.ok(lignes.includes("Recommended: rail, `prio:2` — the manager's triage: ticket, with `prio:2`. A real need. It loses data."));
    // Sans `prio:` proposé : fermer d'abord, puis le rail avec la priorité par défaut.
    const fermer = atelier([tri({ triage: "out-of-scope", motif: "Not this project." })]);
    await ouvrirIssuesEtrangeres(fermer.contexte).traiter(fermer.ouverte(), []);
    const autre = (fermer.commentaires.find((lu) => lu.body.startsWith(CARTE))?.body ?? "").split("\n");
    assert.deepEqual(autre.slice(3, 5), ["- [close] Close it", `- [rail] Put it on the rail with \`prio:${PRIO_PAR_DEFAUT}\``]);
    assert.ok(autre.includes("Recommended: close it — the manager's triage: out of scope. Not this project."));
  });

  test("l'auteur est un humain déclaré dans `humans` : la carte ne parle pas d'inconnu ; absent de `humans`, elle l'en traite", async () => {
    const declare = atelier([tri({ triage: "ticket", prio: 3, motif: "Real." })], { humains: [...PRODUIT, { login: "Mallory", roles: ["client-contact"] }] });
    await ouvrirIssuesEtrangeres(declare.contexte).traiter(declare.ouverte(), []);
    const texte = declare.commentaires.find((lu) => lu.body.startsWith(CARTE))?.body ?? "";
    assert.match(texte, /\nIssue #40: put it on the rail, or close it\?/);
    assert.match(texte, /\nOpened by @mallory, a declared human of the project\./);
    assert.doesNotMatch(texte, /stranger/i);
    const inconnu = atelier([tri({ triage: "ticket", prio: 3, motif: "Real." })], { humains: [] });
    await ouvrirIssuesEtrangeres(inconnu.contexte).traiter(inconnu.ouverte(), []);
    assert.match(inconnu.commentaires.find((lu) => lu.body.startsWith(CARTE))?.body ?? "", /Stranger's issue #40[\s\S]*Opened by @mallory, a stranger\./);
  });

  test("une réponse illisible ne décide rien : la carte part sans proposition, et l'humain tranche", async () => {
    const a = atelier(['{"triage":"maybe","motif":"?"}']);
    assert.equal(await ouvrirIssuesEtrangeres(a.contexte).traiter(a.ouverte(), []), "fait");
    assert.match(a.commentaires[0]?.body ?? "", /triage=none -->\n\*\*Manager — no triage proposal:\*\* its answer could not be read \(unknown triage/);
    assert.match(a.commentaires[1]?.body ?? "", /- \[close\] Close it\n- \[rail\] Put it on the rail with `prio:5`[\s\S]*Recommended: close it — the manager's triage: no triage proposal/);
    assert.deepEqual(a.labels, [CHEF_TODO]);
    assert.match(a.avertissements[0] ?? "", /tri illisible sur l'issue #40/);
    // « on the rail » sans priorité, ni proposée ni écrite : `fire`, et le manager la juge.
    a.ecrire("on the rail", "lea");
    assert.equal(await ouvrirIssuesEtrangeres(a.contexte).traiter(a.ouverte("2026-11-08T12:00:00Z"), []), "fait");
    assert.deepEqual(a.labels, ["fire"]);
  });

  test("GitHub qui refuse le commentaire de tri : rien n'est posé, le tour suivant le rejuge et ne double rien ; la carte qui manque se pose sans rejuger", async () => {
    const a = atelier([tri({ triage: "ticket", prio: 2, motif: "Real." }), tri({ triage: "ticket", prio: 2, motif: "Real." })], { panne: { commentaire: 1 } });
    const tris = ouvrirIssuesEtrangeres(a.contexte);
    assert.equal(await tris.traiter(a.ouverte(), []), "reste");
    assert.deepEqual(a.commentaires, []);
    assert.match(a.avertissements[0] ?? "", /repris au tour suivant — gh api : HTTP 502/);
    assert.equal(await tris.traiter(a.ouverte(), []), "fait");
    assert.equal(a.commentaires.length, 2);
    // Une station tombée entre le tri et la carte : la carte, sans nouveau tri.
    const b = atelier([]);
    b.commentaires.push({ body: corpsDuTriage({ triage: "ticket", prio: 5, motif: "Real." }), author: "brigade", association: "OWNER", createdAt: "2026-11-08T10:00:00Z" });
    assert.equal(await ouvrirIssuesEtrangeres(b.contexte).traiter(b.ouverte(), []), "fait");
    assert.deepEqual(b.lancees, []);
    assert.match(b.commentaires[1]?.body ?? "", /- \[rail\] Put it on the rail with `prio:5`\n- \[close\] Close it/);
  });

  test("une réponse appliquée ne se rejoue pas : le chef qui retire le `prio:` garde la main", async () => {
    const a = atelier([tri({ triage: "ticket", prio: 2, motif: "Real." })]);
    const tris = ouvrirIssuesEtrangeres(a.contexte);
    await tris.traiter(a.ouverte(), []);
    a.ecrire("on the rail", "lea");
    await tris.traiter(a.ouverte("2026-11-08T12:00:00Z"), []);
    assert.deepEqual(a.labels, ["prio:2"]);
    a.labels.splice(0);
    await tris.traiter(a.ouverte("2026-11-08T13:00:00Z"), []);
    assert.deepEqual(a.labels, []);
  });

  test("sans humain `product` déclaré, la carte va au chef : seul un compte qui a l'écriture y répond", () => {
    const carte = carteDuTriage(40, { triage: "out-of-scope", motif: "No." }, { title: "T", body: "B" });
    assert.equal(carte.sorte, "product-question");
    const lus = (author: string, association: string, body: string): Commentaire[] => [{ author, association, body, createdAt: "" }];
    assert.equal(reponseDuProduit(lus("lea", "NONE", "close"), null), null);
    assert.deepEqual(reponseDuProduit(lus("chef", "MEMBER", "Close it, please."), null), { geste: "close", par: "chef" });
    assert.equal(reponseDuProduit(lus("chef", "OWNER", "Why close it?"), null), null);
    assert.equal(reponseDuProduit(lus("brigade", "OWNER", "<!-- brigade:todo kind=product-question -->\nclose"), null), null);
  });

  test("lire le tri : un doublon sans numéro, un `prio:` hors de 1 à 9, un motif absent ne se lisent pas", () => {
    assert.ok("illisible" in lireTriage('{"triage":"duplicate","motif":"Same."}'));
    assert.ok("illisible" in lireTriage('{"triage":"ticket","prio":0,"motif":"Real."}'));
    assert.ok("illisible" in lireTriage('{"triage":"out-of-scope"}'));
    assert.ok("illisible" in lireTriage(null));
    assert.deepEqual(lireTriage('Here: {"triage":"ticket","prio":9,"motif":"Real."}'), { valeur: { triage: "ticket", prio: 9, motif: "Real." } });
  });

  test("l'auteur sans l'écriture : ni le propriétaire, ni un membre, ni un collaborateur", () => {
    assert.deepEqual(
      ["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"].filter((association) => auteurSansEcriture({ association })),
      ["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "NONE"],
    );
  });
});
