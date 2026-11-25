// #4262 — le second et l'app parquent et déparquent un ticket de la même façon : les deux mêmes fonctions, écrites sur
// l'issue, sur tout projet — ici BOBL-tech/mirrorlab, pas brigade —, sans commande ni shell de la box. Le second les joue
// par la commande de parking (second/parking.ts), que l'app lui donne à chaque début de session (crochet-du-parking.ts).
// Joué sur un faux GitHub qui tient les labels et les commentaires de ses issues.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join, sep } from "node:path";
import { describe, test } from "node:test";
import { attenteDeLIssue } from "../../../runtime/src/attente-github/marque.ts";
import type { ClientDeLaPriorite } from "../../src/priorite.ts";
import { crochetsDuParking } from "../../src/second/crochet-du-parking.ts";
import { contexte, principal } from "../../src/second/geste-de-parking.ts";
import type { TableauLu } from "../../src/tableau/lecture.ts";
import { ouvrirTerminaux, type Lancement } from "../../src/terminaux.ts";
import { jouerLAttente, tiersDesCommentaires } from "../../src/vue/attente/attente-github.ts";

const DEPOT = "BOBL-tech/mirrorlab";
const TICKET = 614;
const AUJOURDHUI = new Date(2026, 10, 9, 15, 5);
const JOUR = "2026-11-20";
const SCRIPT = join(import.meta.dirname, "../../src/second/parking.ts");
// Le script tel que la commande le cite : sous Windows, ses `\\` deviennent des `/`, que le `bash` de Git lit (cite1, crochet-de-la-file.ts).
const SCRIPT_CITE = sep === "\\" ? SCRIPT.replaceAll("\\", "/") : SCRIPT;

type Reponse = { status: number; data: unknown };
// Le GitHub d'un projet : l'issue 614, une carte de TODO. `panne` : ce qu'il rend à la place, pour une écriture.
function github(panne: (ecriture: string) => Reponse | undefined = () => undefined) {
  const issues = new Map([[TICKET, { labels: ["fire", "chef-todo"], commentaires: [] as string[] }]]);
  const ecrites: string[] = [];
  const client: ClientDeLaPriorite = {
    lire: async () => ({ status: 404, data: { message: "Not Found" } }),
    ecrire: async (methode, chemin, corps) => {
      ecrites.push(`${methode} ${chemin}`);
      const enPanne = panne(`${methode} ${chemin}`);
      if (enPanne !== undefined) return enPanne;
      const [, depot, numero, reste = ""] = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)(.*)$/.exec(chemin) ?? [];
      const issue = depot === DEPOT ? issues.get(Number(numero)) : undefined;
      if (issue === undefined) return { status: 404, data: { message: "Not Found" } };
      if (methode === "POST" && reste === "/comments") {
        issue.commentaires.push((corps as { body: string }).body);
        return { status: 201, data: { html_url: `https://github.com/${DEPOT}/issues/${numero}#issuecomment-${issue.commentaires.length}` } };
      }
      if (methode === "POST" && reste === "/labels") {
        for (const label of (corps as { labels: string[] }).labels) if (!issue.labels.includes(label)) issue.labels.push(label);
        return { status: 200, data: [] };
      }
      const retire = /^\/labels\/(.+)$/.exec(reste)?.[1];
      if (methode === "DELETE" && retire !== undefined) {
        const rang = issue.labels.indexOf(decodeURIComponent(retire));
        if (rang < 0) return { status: 404, data: { message: "Label does not exist" } };
        issue.labels.splice(rang, 1);
        return { status: 200, data: [] };
      }
      return { status: 404, data: { message: "Not Found" } };
    },
  };
  const etat = () => structuredClone(issues.get(TICKET));
  return { client, ecrites, etat };
}

// La dernière lecture du rail par l'app : le ticket y est, sur le dépôt du projet.
const LU = { depot: DEPOT, faits: { rail: [{ ticket: TICKET }], attend: [], attendAutres: [] } } as unknown as TableauLu;
const parLApp = (client: ClientDeLaPriorite, id: string, saisie?: unknown) => jouerLAttente({ id, ticket: TICKET, saisie, aujourdhui: AUJOURDHUI, lu: () => LU, client });
async function parLeSecond(client: ClientDeLaPriorite, ...args: string[]) {
  const [dit, redit]: [string[], string[]] = [[], []];
  const code = await principal(args, { client, aujourdhui: AUJOURDHUI, dire: (ligne) => void dit.push(ligne), redire: (ligne) => void redit.push(ligne) });
  return { code, dit: dit.join("\n"), redit: redit.join("\n") };
}
// Ce que la commande dit d'une forme qui n'en est pas une.
const USAGE = "usage: parking.ts park <owner>/<repo>#<issue> --who <who it waits for> --what <what it waits for> --until <YYYY-MM-DD>\n       parking.ts unpark <owner>/<repo>#<issue>";
const PARQUER = ["park", `${DEPOT}#${TICKET}`, "--who", "the client", "--what", "the signed quote", "--until", JOUR];

describe("le second et l'app parquent et déparquent un ticket dans le même état, sur un projet qui n'est pas brigade", () => {
  test("parqué : le même label et le même commentaire, que la station et l'app relisent — qui, pour quoi, jusqu'à quand", async () => {
    const app = github();
    const second = github();
    assert.ok("fait" in (await parLApp(app.client, "attente-poser", { quoi: "the signed quote", qui: "the client", relance: JOUR })));
    const lance = await parLeSecond(second.client, ...PARQUER);
    assert.deepEqual([lance.code, lance.redit], [0, ""]);
    assert.equal(lance.dit, `in WAITING on GitHub: #${TICKET} awaits the client, follow-up on ${JOUR} — https://github.com/${DEPOT}/issues/${TICKET}#issuecomment-1`);
    assert.deepEqual(second.ecrites, app.ecrites);
    assert.deepEqual(second.etat(), app.etat());

    const { labels, commentaires } = second.etat() ?? assert.fail();
    assert.deepEqual(labels, ["fire", "chef-todo", "waiting"]);
    assert.equal(commentaires.length, 1);
    // La station le relit (runtime/src/attente-github/marque.ts), et l'app aussi : le même enregistrement.
    assert.deepEqual(attenteDeLIssue(commentaires.map((body) => ({ body, association: "OWNER" }))), { what: "the signed quote", who: "the client", followUp: new Date(2026, 10, 20).toISOString() });
    const tiers = tiersDesCommentaires(commentaires.map((body) => ({ body, created_at: AUJOURDHUI.toISOString() })));
    assert.deepEqual([tiers?.qui, tiers?.quoi, tiers?.relance], ["the client", "the signed quote", new Date(2026, 10, 20).toISOString()]);
  });

  for (const id of ["attente-reprendre", "attente-arrivee"]) {
    test(`déparqué — « ${id === "attente-reprendre" ? "resume" : "it arrived, back to the kitchen"} » de l'app, \`unpark\` du second : le même état`, async () => {
      const app = github();
      const second = github();
      for (const { client } of [app, second]) assert.equal((await parLeSecond(client, ...PARQUER)).code, 0);
      assert.ok("fait" in (await parLApp(app.client, id)));
      const lance = await parLeSecond(second.client, "unpark", `${DEPOT}#${TICKET}`);
      assert.deepEqual([lance.code, lance.redit], [0, ""]);
      assert.equal(lance.dit, `back to the kitchen on GitHub: #${TICKET} no longer carries \`waiting\` — it is queued on the rail again — https://github.com/${DEPOT}/issues/${TICKET}`);
      assert.deepEqual(second.ecrites, app.ecrites);
      assert.deepEqual(second.etat(), app.etat());
      assert.deepEqual(second.etat()?.labels, ["fire", "chef-todo"]);
    });
  }
});

describe("la commande de parking : ce qu'elle refuse, et ce que GitHub refuse", () => {
  test("une commande mal formée : l'usage, le code 2, et rien n'est écrit", async () => {
    const { client, ecrites } = github();
    const cible = `${DEPOT}#${TICKET}`;
    for (const args of [
      [],
      ["park"],
      ["park", "614", "--who", "a", "--what", "b", "--until", JOUR],
      ["park", cible, "--who", "a", "--what", "b"],
      ["park", cible, "--who", "a", "--what", "b", "--until"],
      ["park", cible, "--who", "a", "--who", "b", "--what", "c", "--until", JOUR],
      ["park", cible, "--who", "a", "--what", "b", "--until", JOUR, "--from", "c"],
      ["unpark", cible, "--who", "a"],
      ["unpark", "mirrorlab#614"],
      ["resume", cible],
    ]) {
      assert.deepEqual(await parLeSecond(client, ...args), { code: 2, dit: "", redit: USAGE }, args.join(" "));
    }
    assert.deepEqual(ecrites, []);
  });

  test("une date qui n'est pas à venir, ou sans quoi : refusée par la lecture de l'app, le code 1, et rien n'est écrit", async () => {
    const { client, ecrites } = github();
    assert.deepEqual(await parLeSecond(client, "park", `${DEPOT}#${TICKET}`, "--who", "the client", "--what", "the signed quote", "--until", "2026-11-09"), {
      code: 1,
      dit: "",
      redit: "nothing is written: the follow-up date 2026-11-09 is not after today — a follow-up is to come",
    });
    assert.equal((await parLeSecond(client, "park", `${DEPOT}#${TICKET}`, "--who", "the client", "--what", " ", "--until", JOUR)).redit, "nothing is written: say what it waits for, in your words");
    assert.deepEqual(ecrites, []);
  });

  test("ce que GitHub refuse se dit, avec son détail, au code 1 : le commentaire refusé ne pose aucun label ; un retrait refusé laisse le ticket parqué", async () => {
    const refuse = github((ecriture) => (ecriture.endsWith("/comments") ? { status: 403, data: { message: "Resource not accessible by integration" } } : undefined));
    assert.deepEqual(await parLeSecond(refuse.client, ...PARQUER), {
      code: 1,
      dit: "",
      redit: `nothing was changed: GitHub did not take the WAITING comment on #${TICKET} — GitHub refused the comment (HTTP 403): Resource not accessible by integration`,
    });
    assert.deepEqual(refuse.etat()?.labels, ["fire", "chef-todo"]);

    const retraitRefuse = github((ecriture) => (ecriture.startsWith("DELETE") ? { status: 500, data: { message: "Server Error" } } : undefined));
    assert.equal((await parLeSecond(retraitRefuse.client, ...PARQUER)).code, 0);
    const lance = await parLeSecond(retraitRefuse.client, "unpark", `${DEPOT}#${TICKET}`);
    assert.equal(lance.code, 1);
    assert.match(lance.redit, /^nothing was changed: GitHub did not remove `waiting` from #614 — /);
    assert.ok(retraitRefuse.etat()?.labels.includes("waiting"));
  });
});

describe("la commande donnée au second à chaque début de session", () => {
  test("elle nomme `park` et `unpark` sur le dépôt du projet, avec le `node` et le chemin de ce poste, cités pour le shell", () => {
    const dite = contexte(DEPOT, "/Applications/Brigade app/node", "/Applications/Brigade app/src/second/parking.ts", "/");
    assert.ok(dite.includes(`  '/Applications/Brigade app/node' '/Applications/Brigade app/src/second/parking.ts' park ${DEPOT}#<n> --who '<who>' --what '<what>' --until <YYYY-MM-DD>\n`), dite);
    assert.ok(dite.includes(`  '/Applications/Brigade app/node' '/Applications/Brigade app/src/second/parking.ts' unpark ${DEPOT}#<n>\n`), dite);
    assert.match(dite, /with no box command/);
    assert.match(contexte("", "node", "parking.ts", "/"), / park <owner>\/<repo>#<n> /);
    // Sous Windows, le `bash` de Git lit `C:/…`.
    assert.match(contexte(DEPOT, "C:\\Brigade\\node.exe", "C:\\Brigade\\parking.ts", "\\"), /^ {2}'C:\/Brigade\/node\.exe' 'C:\/Brigade\/parking\.ts' park /m);
  });

  test("le crochet du début de session — ouverture, reprise, compaction — la donne, joué pour de bon par `node`", () => {
    const [crochet] = crochetsDuParking({ node: "/usr/bin/node", cible: { nom: "mirrorlab", depot: DEPOT } }).SessionStart ?? [];
    assert.equal(crochet?.matcher, "startup|resume|compact");
    assert.equal(crochet?.hooks[0]?.command, `'/usr/bin/node' '${SCRIPT_CITE}' 'context' '${DEPOT}'`);
    const sortie = JSON.parse(execFileSync(process.execPath, [SCRIPT, "context", DEPOT], { encoding: "utf8" })) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    assert.equal(sortie.hookSpecificOutput.hookEventName, "SessionStart");
    assert.ok(sortie.hookSpecificOutput.additionalContext.includes(`'${SCRIPT_CITE}' park ${DEPOT}#<n> --who`), sortie.hookSpecificOutput.additionalContext);
  });

  test("le lancement du second le porte dans ses réglages", () => {
    const lances: Lancement[] = [];
    const terminaux = ouvrirTerminaux({
      claude: "claude",
      shell: "/bin/zsh",
      node: "/usr/bin/node",
      ouvrirPty(lancement) {
        lances.push(lancement);
        return { ecrire: () => {}, redimensionner: () => {}, tuer: () => {} };
      },
      surSortie: () => {},
      surEtat: () => {},
    });
    terminaux.espace({ nom: "mirrorlab", dossier: "/projets/mirrorlab", depot: DEPOT });
    const args = lances.at(0)?.args ?? assert.fail("aucun lancement");
    const reglages = JSON.parse(args[args.indexOf("--settings") + 1] ?? "") as { hooks: { SessionStart: { hooks: { command: string }[] }[] } };
    const commandes = reglages.hooks.SessionStart.flatMap(({ hooks }) => hooks.map(({ command }) => command));
    assert.ok(commandes.includes(`'/usr/bin/node' '${SCRIPT_CITE}' 'context' '${DEPOT}'`), commandes.join("\n"));
  });
});
