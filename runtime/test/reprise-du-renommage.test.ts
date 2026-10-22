// La cuisine reprise après un renommage du code mergé (pause/reprise.ts) : la
// pause levée, la pass merge et les stations prennent à nouveau, seules ; les
// tickets retenus sont repris sur le nouvel arbre — leur zone et leur branche
// sur les nouveaux chemins, par les déplacements que l'outil a dits —, ou
// nommés dans la file avec la raison ; ceux qui ne touchaient aucun fichier
// déplacé sont repris tels quels. Les premiers tests lisent les déplacements
// seuls ; puis le dépôt porte une livraison sur un vrai arbre renommé ; le
// dernier fait tourner une cuisine, de la pause à la reprise.
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test, type TestContext } from "./support/posix.ts";
import { attentesDuChef } from "../src/attend.ts";
import { ouvrirDepot, type Depot, type Transposition } from "../src/depot.ts";
import { decrireEtat, lireEtat } from "../src/etat.ts";
import { MARQUEUR, type Fiche } from "../src/fiche.ts";
import { ouvrirJournal, type Journal } from "../src/journal.ts";
import type { Pass } from "../src/pass.ts";
import type { Deplacement } from "../src/pause/evenements.ts";
import { demanderPause, mergeRetenu, pauseEnCours, repondre } from "../src/pause/pause.ts";
import { renommeur } from "../src/pause/renommage.ts";
import { deplacementsDeLOutil, ficheSurLeNouvelArbre, INTRANSPOSABLE, traduireChemin, zoneTraduite, type RenommageMerge } from "../src/pause/reprise.ts";
import { lireRail, ticketDuRail } from "../src/projections/rail.ts";
import type { Runtime } from "../src/runtime.ts";
import { chef, cuisine, issue } from "./aides/cuisine.ts";
import { sansMotFrancais } from "./aides/glossaire.ts";
import { BASE, depotGit, ENV_GIT, git, jusqua, repertoireTemporaire } from "./outils.ts";

// La table de l'outil, en petit : un fichier renommé, un dossier renommé.
const MOUVEMENTS: Deplacement[] = [
  ["runtime/src/garde-fous.ts", "guardrails.ts"],
  ["runtime/src/pause", "freeze"],
];
const renommage = (moves: Deplacement[] = MOUVEMENTS): RenommageMerge => ({ request: 1, sha: "5a5a", moves });

describe("les déplacements de l'outil de renommage", () => {
  test("se lisent de ses lignes `move`, et de rien d'autre", () => {
    const sortie = [
      "kept\truntime/src/rail.ts\tproperty\tetat\tstate\tJSON.parse",
      "move\truntime/src/garde-fous.ts\tguardrails.ts",
      "move\truntime/src/pause\tfreeze",
      "rename\truntime/src/rail.ts\tfunction\tprendre\ttake\t3",
      "move\tnon\tvalide\ten trop",
      "move\truntime/src/x.ts\tun/chemin",
    ];
    assert.deepEqual(deplacementsDeLOutil(sortie), MOUVEMENTS);
  });

  test("un chemin suit le fichier ou le dossier qui le porte ; un chemin que rien ne déplace reste tel quel", () => {
    assert.equal(traduireChemin("runtime/src/garde-fous.ts", MOUVEMENTS), "runtime/src/guardrails.ts");
    assert.equal(traduireChemin("runtime/src/pause/pause.ts", MOUVEMENTS), "runtime/src/freeze/pause.ts");
    assert.equal(traduireChemin("runtime/src/pause", MOUVEMENTS), "runtime/src/freeze");
    // Par segments entiers : `pause2` n'est pas `pause`.
    assert.equal(traduireChemin("runtime/src/pause2/a.ts", MOUVEMENTS), "runtime/src/pause2/a.ts");
    assert.equal(traduireChemin("runtime/src", MOUVEMENTS), "runtime/src");
    assert.equal(traduireChemin("docs/runtime/garde-fous.md", MOUVEMENTS), "docs/runtime/garde-fous.md");
  });

  test("une zone se lit sur les nouveaux chemins, sans doublon ; une fiche que rien ne déplace, ou illisible, est rendue telle quelle", () => {
    assert.deepEqual(zoneTraduite(["runtime/src/garde-fous.ts", "runtime/src/pause", "runtime/src/freeze", "docs"], [renommage()]), ["runtime/src/guardrails.ts", "runtime/src/freeze", "docs"]);
    const fiche: Fiche = { waitsFor: [12], zone: ["runtime/src/pause/pause.ts", "runtime/test"], problems: [] };
    assert.deepEqual(ficheSurLeNouvelArbre(fiche, [renommage()]), { waitsFor: [12], zone: ["runtime/src/freeze/pause.ts", "runtime/test"], problems: [] });
    const intacte: Fiche = { waitsFor: [], zone: ["runtime/test", "docs"], problems: [] };
    assert.equal(ficheSurLeNouvelArbre(intacte, [renommage()]), intacte);
    const illisible: Fiche = { waitsFor: [], zone: ["runtime/src/pause"], problems: ["clé inconnue"] };
    assert.equal(ficheSurLeNouvelArbre(illisible, [renommage()]), illisible);
    assert.equal(ficheSurLeNouvelArbre(null, [renommage()]), null);
    assert.equal(ficheSurLeNouvelArbre(fiche, []), fiche);
  });
});

// Un vrai dépôt : la base porte `runtime/src/garde-fous.ts`, le dossier
// `runtime/src/pause` et `runtime/src/rail.ts`. Les livraisons partent de là ;
// puis le renommage est mergé sur la base, et la déplace comme le dit
// `MOUVEMENTS`, en réécrivant la première ligne de `garde-fous.ts`.
async function avantEtApresLeRenommage(t: TestContext) {
  const { clone } = depotGit(t);
  const worktrees = join(repertoireTemporaire(t), "worktrees");
  const depot = ouvrirDepot({ clone, base: BASE, worktrees, env: ENV_GIT });
  const poser = (arbre: string, fichiers: Record<string, string>, message: string) => {
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      mkdirSync(dirname(join(arbre, chemin)), { recursive: true });
      writeFileSync(join(arbre, chemin), contenu);
    }
    git(arbre, "add", "-A");
    git(arbre, "commit", "-q", "-m", message);
  };
  const mergerSurLaBase = (arbre: string, branche: string) => git(arbre, "push", "-q", "origin", `${branche}:${BASE}`);

  const socle = await depot.preparer("socle");
  poser(
    socle.worktree,
    {
      "runtime/src/garde-fous.ts": "export const gardeFous = 1;\n\n// le milieu\n\nexport const fin = 2;\n",
      "runtime/src/pause/pause.ts": "export const pause = 1;\n",
      "runtime/src/rail.ts": "export const rail = 1;\n",
    },
    "le socle",
  );
  mergerSurLaBase(socle.worktree, socle.branche);
  await depot.rapatrier();

  // Trois livraisons, poussées comme celles des cooks : l'une écrit dans les
  // fichiers que le renommage déplace, l'autre n'y touche pas, la dernière
  // réécrit la ligne même que le renommage réécrit.
  const livrer = async (run: string, fichiers: Record<string, string>) => {
    const { worktree, branche } = await depot.preparer(run);
    poser(worktree, fichiers, `livraison ${run}`);
    depot.pousser(branche);
    return { worktree, branche, sha: git(worktree, "rev-parse", "HEAD") };
  };
  const deplacee = await livrer("17-aaaa", {
    "runtime/src/garde-fous.ts": "export const gardeFous = 1;\n\n// le milieu, réécrit par le cook\n\nexport const fin = 2;\n",
    "runtime/src/pause/nouveau.ts": "export const nouveau = 1;\n",
  });
  const intacte = await livrer("20-cccc", { "runtime/src/rail.ts": "export const rail = 2;\n" });
  const disputee = await livrer("19-bbbb", { "runtime/src/garde-fous.ts": "export const gardeFousDuCook = 1;\n\n// le milieu\n\nexport const fin = 2;\n" });

  // Le renommage, mergé sur la base.
  const outil = await depot.preparer("renommage-aa");
  git(outil.worktree, "mv", "runtime/src/garde-fous.ts", "runtime/src/guardrails.ts");
  git(outil.worktree, "mv", "runtime/src/pause", "runtime/src/freeze");
  writeFileSync(join(outil.worktree, "runtime/src/guardrails.ts"), "export const guardrails = 1;\n\n// le milieu\n\nexport const fin = 2;\n");
  git(outil.worktree, "add", "-A");
  git(outil.worktree, "commit", "-q", "-m", "le renommage");
  const commit = git(outil.worktree, "rev-parse", "HEAD");
  mergerSurLaBase(outil.worktree, outil.branche);
  const traduire = (chemin: string) => traduireChemin(chemin, MOUVEMENTS);
  return { clone, worktrees, depot, deplacee, intacte, disputee, commit, traduire };
}

describe("une livraison portée sur l'arbre renommé, sur un vrai dépôt", { concurrency: 4 }, () => {
  test("elle touchait des fichiers déplacés : un commit de plus sur sa branche fusionne la base renommée, et y déplace ce qu'elle avait écrit — fichier et dossier", async (t) => {
    const { clone, worktrees, depot, deplacee, commit, traduire } = await avantEtApresLeRenommage(t);

    const portee = await depot.transposer("jugement-17", deplacee.branche, { commit, traduire });

    assert.equal(portee.issue, "portee", JSON.stringify(portee));
    const { de, vers, base, chemins } = portee as Extract<Transposition, { issue: "portee" }>;
    assert.equal(de, deplacee.sha);
    assert.equal(base, git(clone, "rev-parse", `origin/${BASE}`));
    assert.deepEqual(chemins, [
      ["runtime/src/garde-fous.ts", "runtime/src/guardrails.ts"],
      ["runtime/src/pause/nouveau.ts", "runtime/src/freeze/nouveau.ts"],
    ]);
    // La branche n'est pas réécrite : la livraison et la base sont les parents du commit porté.
    assert.equal(git(clone, "rev-parse", deplacee.branche), vers);
    assert.deepEqual([git(clone, "rev-parse", `${vers}^1`), git(clone, "rev-parse", `${vers}^2`)], [deplacee.sha, base]);
    // Sur les nouveaux chemins : l'écriture du cook et celle du renommage, ensemble.
    assert.equal(git(clone, "show", `${vers}:runtime/src/guardrails.ts`), "export const guardrails = 1;\n\n// le milieu, réécrit par le cook\n\nexport const fin = 2;");
    assert.equal(git(clone, "show", `${vers}:runtime/src/freeze/nouveau.ts`), "export const nouveau = 1;");
    assert.equal(git(clone, "ls-tree", "-r", "--name-only", vers, "runtime/src").split("\n").sort().join(" "), "runtime/src/freeze/nouveau.ts runtime/src/freeze/pause.ts runtime/src/guardrails.ts runtime/src/rail.ts");
    // Ce que la livraison change, sur la base renommée : ses seuls fichiers, à leur nouveau chemin.
    assert.deepEqual(depot.changes(deplacee.branche), ["runtime/src/freeze/nouveau.ts", "runtime/src/guardrails.ts"]);
    // Rien n'est poussé, et aucun worktree jetable ne reste.
    assert.equal(git(clone, "rev-parse", `origin/${deplacee.branche}`), deplacee.sha);
    assert.deepEqual(readdirSync(join(worktrees, ".essais")), []);

    // Poussée, elle porte le renommage : il n'y a plus rien à porter.
    depot.pousser(deplacee.branche);
    assert.deepEqual(await depot.transposer("jugement-17", deplacee.branche, { commit, traduire }), { issue: "deja" });
  });

  test("elle ne touchait aucun fichier déplacé : rien n'est porté, sa branche ne bouge pas", async (t) => {
    const { clone, depot, intacte, commit, traduire } = await avantEtApresLeRenommage(t);

    assert.deepEqual(await depot.transposer("jugement-20", intacte.branche, { commit, traduire }), { issue: "intacte" });
    assert.equal(git(clone, "rev-parse", intacte.branche), intacte.sha);
  });

  test("elle réécrit ce que le renommage réécrit : le conflit est dit, chemin compris, sa branche ne bouge pas, et rien ne reste", async (t) => {
    const { clone, worktrees, depot, disputee, commit, traduire } = await avantEtApresLeRenommage(t);

    assert.deepEqual(await depot.transposer("jugement-19", disputee.branche, { commit, traduire }), { issue: "conflit", de: disputee.sha, chemins: ["runtime/src/guardrails.ts"] });
    assert.equal(git(clone, "rev-parse", disputee.branche), disputee.sha);
    assert.deepEqual(readdirSync(join(worktrees, ".essais")), []);
    assert.doesNotMatch(git(clone, "worktree", "list"), /\.essais/);
  });
});

// Le faux outil de renommage : il écrit un fichier dans l'arbre, comme l'outil
// y renomme, et dit ses déplacements par ses lignes `move` — mais seulement
// une fois que le fichier `feu` existe : le test décide quand il finit.
function fauxOutil(t: TestContext, feu: string): string {
  const outil = join(repertoireTemporaire(t), "faux-renommage.sh");
  writeFileSync(
    outil,
    [
      "#!/usr/bin/env bash",
      `while [ ! -e "${feu}" ]; do sleep 0.05; done`,
      "echo renamed > renomme.txt",
      ...MOUVEMENTS.map(([de, vers]) => `printf 'move\\t%s\\t%s\\n' '${de}' '${vers}'`),
      'echo "renamed: 0 unresolved identifier(s)" >&2',
      "",
    ].join("\n"),
  );
  return outil;
}

// Le numéro de ticket que porte une branche de cook.
const ticketDeLaBranche = (branche: string) => Number(/^(?:origin\/)?cook\/(\d+)-/.exec(branche)?.[1]);

describe("la cuisine reprise après le renommage", () => {
  test("le renommage mergé, la pause est levée, et la cuisine reprend seule : les tickets retenus sont repris sur le nouvel arbre — zone et branche sur les nouveaux chemins —, celui qui ne se porte pas est nommé dans la file avec la raison, celui qui ne touchait rien est repris tel quel, et un ticket neuf est pris et mergé", async (t) => {
    // Arrêté avant la cuisine : les crochets de fin se jouent dans l'ordre.
    let renommage: ReturnType<typeof renommeur> | undefined;
    t.after(() => renommage?.arreter());
    // Le faux dépôt n'a pas d'arbre : ce que la vraie transposition fait d'une
    // branche (le test précédent), il le décide par ticket. #17 touchait des
    // fichiers déplacés, #19 ne se porte pas, #20 ne touchait rien.
    const appels: Array<{ branche: string; commit: string; traduire: (chemin: string) => string }> = [];
    const portees = new Map<string, string>();
    const tenu: { depot?: Depot } = {};
    const lieu = cuisine(t, {
      pass: true,
      scenario: "commite-puis-attend",
      cooks: 3,
      issues: [],
      depot: (vrai) =>
        (tenu.depot = {
          ...vrai,
          tete: (nom) => portees.get(nom.replace(/^origin\//, "")) ?? vrai.tete(nom),
          transposer: async (_nom, branche, { commit, traduire }): Promise<Transposition> => {
            appels.push({ branche, commit, traduire });
            const de = vrai.tete(vrai.livree(branche));
            if (portees.has(branche)) return { issue: "deja" };
            switch (ticketDeLaBranche(branche)) {
              case 17: {
                const vers = `porte-${de}`;
                portees.set(branche, vers);
                return { issue: "portee", de, vers, base: "base-1", chemins: [["runtime/src/garde-fous.ts", traduire("runtime/src/garde-fous.ts")]] };
              }
              case 19:
                return { issue: "conflit", de, chemins: [traduire("runtime/src/pause/pause.ts")] };
              default:
                return { issue: "intacte" };
            }
          },
        }),
    });
    const { gh, journal, heure, conclure, etat } = lieu;
    chef(lieu.repertoire, "grant.activated");
    const fiche = (zone: string) => `${MARQUEUR}\n- attend : rien\n- zone : ${zone}`;
    gh.ficher(17, "2026-10-08T09:00:00Z", fiche("runtime/src/garde-fous.ts, runtime/test/garde-fous.test.ts"));
    gh.ficher(19, "2026-10-08T09:00:00Z", fiche("runtime/src/pause/pause.ts"));
    gh.ficher(20, "2026-10-08T09:00:00Z", fiche("runtime/src/rail.ts"));
    for (const numero of [17, 19, 20]) gh.poser(issue(numero));

    const { depot } = tenu;
    assert.ok(depot, "la cuisine a un dépôt");
    const runtime = lieu.runtime as unknown as Runtime & Pick<Pass, "prendreHorsRail">;
    const feu = join(repertoireTemporaire(t), "feu-du-renommage");
    renommage = renommeur(runtime, {
      depot,
      github: gh.github,
      base: BASE,
      // Par `bash` : le répertoire temporaire peut refuser d'exécuter.
      outil: { commande: "bash", args: [fauxOutil(t, feu)] },
      maintenant: heure.maintenant,
      avertir: (message) => void lieu.avertissements.push(message),
    });
    const suivre = renommage;
    t.after(runtime.surReveil(() => suivre.passer()));

    const ecrire = <T>(faire: (journal: Journal) => T): T => {
      const autre = ouvrirJournal(lieu.repertoire, { maintenant: heure.maintenant });
      try {
        return faire(autre);
      } finally {
        autre.fermer();
      }
    };
    const faits = (type: string, ticket?: number) => (ticket === undefined ? journal.tout() : journal.duTicket(ticket)).filter((e) => e.type === type);
    const zone = (ticket: number) => ticketDuRail(journal.base, ticket)?.card?.zone;
    const cooks = (ticket: number) => faits("cook.launched", ticket).length;

    // Les trois cooks sont en vol quand le chef accepte la pause.
    await jusqua(() => [17, 19, 20].every((numero) => etat(numero) === "taken" && cooks(numero) === 1));
    assert.deepEqual(zone(19), ["runtime/src/pause/pause.ts"]);
    ecrire((autre) => {
      demanderPause(autre, "brigade", { ticket: null, minutes: 45, rail: lireRail(autre.base), auteur: "runtime" });
      return repondre(autre, "brigade", "yes");
    });
    await jusqua(() => faits("rename.started").length === 1);
    // Ils finissent leur travail ; leurs livraisons sont retenues.
    conclure();
    await jusqua(() => [17, 19, 20].every((numero) => faits("pass.waiting", numero).some((e) => (e.payload as { reason?: string }).reason === "paused")));
    assert.equal(gh.merges.length, 0);
    assert.equal(appels.length, 0);

    // L'outil finit : le renommage est mergé, la pause levée sans geste du chef.
    writeFileSync(feu, "");
    await jusqua(() => faits("pause.released").length === 1);
    const levee = faits("pause.released")[0]?.payload as { outcome?: string };
    assert.equal(levee.outcome, "merged", JSON.stringify(levee));
    const livree = faits("rename.delivered")[0]?.payload as { number: number; sha: string; moves: Deplacement[] };
    assert.deepEqual(livree.moves, MOUVEMENTS);
    assert.equal(pauseEnCours(journal.base), null);
    for (const numero of [17, 19, 20]) assert.equal(mergeRetenu(journal.base, numero), null);
    // Les zones sont sur les nouveaux chemins dès la levée ; celle qui n'en touchait aucun est la même.
    assert.deepEqual(zone(17), ["runtime/src/guardrails.ts", "runtime/test/garde-fous.test.ts"]);
    assert.deepEqual(zone(19), ["runtime/src/freeze/pause.ts"]);
    assert.deepEqual(zone(20), ["runtime/src/rail.ts"]);

    // #17 : porté, poussé, jugé et mergé sur sa nouvelle tête.
    await jusqua(() => faits("merge.done", 17).length === 1);
    const portee = faits("rename.carried", 17)[0]?.payload as { from: string; to: string; paths: Array<[string, string]>; request: number };
    assert.ok(portee, "la livraison de #17 a été portée");
    assert.equal(portee.to, `porte-${portee.from}`);
    assert.deepEqual(portee.paths, [["runtime/src/garde-fous.ts", "runtime/src/guardrails.ts"]]);
    assert.equal((faits("merge.done", 17)[0]?.payload as { sha: string }).sha, portee.to);
    assert.ok(gh.merges.some(([numero, sha]) => sha === portee.to && numero !== livree.number), JSON.stringify(gh.merges));
    assert.match(gh.commentaires.filter(([numero]) => numero === 17).map(([, corps]) => corps).join("\n"), /\*\*Pass — livraison portée sur l'arbre du renommage du code\.\*\*[\s\S]*`runtime\/src\/garde-fous\.ts` → `runtime\/src\/guardrails\.ts`/);
    // La transposition part du commit du renommage, et traduit par ses déplacements.
    const appel = appels.find(({ branche }) => ticketDeLaBranche(branche) === 17);
    assert.equal(appel?.commit, livree.sha);
    assert.equal(appel?.traduire("runtime/src/pause/a.ts"), "runtime/src/freeze/a.ts");

    // #20 : jugé et mergé tel quel, sans rien porter.
    await jusqua(() => faits("merge.done", 20).length === 1);
    assert.equal(faits("rename.carried", 20).length, 0);
    assert.doesNotMatch((faits("merge.done", 20)[0]?.payload as { sha: string }).sha, /^porte-/);

    // #19 : ne se porte pas ; remonté au chef, nommé dans la file avec la raison, rien de mergé.
    await jusqua(() => faits("pass.escalated", 19).length === 1);
    assert.equal((faits("pass.escalated", 19)[0]?.payload as { cause: string }).cause, INTRANSPOSABLE);
    assert.equal(etat(19), "86");
    assert.equal(faits("merge.done", 19).length, 0);
    const attente = attentesDuChef(journal.base, lireRail(journal.base)).find((a) => a.ticket === 19);
    assert.equal(attente?.quoi, "remontee");
    const statut = decrireEtat(lireEtat(journal, heure.maintenant()), heure.maintenant());
    const ligne = statut.find((l) => l.startsWith("  #19 "));
    assert.match(ligne ?? "", /held by the code rename and not resumed on the renamed tree: it was born before the code rename \(\w+\) and does not carry onto the renamed tree: conflict on `runtime\/src\/freeze\/pause\.ts`/);
    sansMotFrancais([ligne ?? ""].map((l) => l.replace(/Ticket 19$/, "")));

    // Et la cuisine prend et merge à nouveau, sans geste du chef. La fiche
    // d'un ticket écrite sur les anciens chemins se lit sur les nouveaux.
    gh.ficher(18, "2026-10-08T09:00:00Z", fiche("runtime/src/pause/autre.ts, docs"));
    gh.poser(issue(18));
    await jusqua(() => faits("merge.done", 18).length === 1);
    assert.equal(cooks(18), 1);
    assert.equal(faits("rename.carried", 18).length, 0);
    assert.deepEqual((faits("ticket.arrived", 18)[0]?.payload as { card: Fiche }).card.zone, ["runtime/src/freeze/autre.ts", "docs"]);
  });
});
