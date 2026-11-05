import assert from "node:assert/strict";
import { test } from "node:test";
import { RENVOIS_MAX as RENVOIS_MAX_DE_LA_STATION } from "../../../src/brigade-github.ts";
import { RENVOIS_MAX as RENVOIS_MAX_DE_LA_PASS } from "../../../src/events/pass.ts";
import { etatDuTicket, LABEL_IN_PASS, LABEL_WAITING } from "../../../src/github-etat/etats.ts";
import { corpsDeVerdict } from "../../../src/github-etat/fusion.ts";
import { HORS_CUISINE } from "../../../src/github.ts";
import {
  calibrageAuDessus,
  marqueDeFix,
  RENVOIS_MAX,
  renvoyerLaLivraison,
  type CheckLu,
  type CommentaireLu,
  type ContexteDuRenvoi,
  type Refus,
} from "../../../src/github-seul/renvois/renvois.ts";

const TICKET = 40;
const PR = 41;

// Un dépôt GitHub tenu en mémoire : ses issues (et PR), leurs labels, leurs
// commentaires, les checks de chaque commit. Il survit à la station : chaque
// `contexte()` est une station neuve, sans rien en mémoire, qui ne le lit que
// par son client.
function depot(labels: string[], corps = "") {
  const commentaires = new Map<number, CommentaireLu[]>();
  const etiquettes = new Map<number, Set<string>>([[TICKET, new Set(labels)]]);
  const corpsDes = new Map<number, string>([[TICKET, corps]]);
  const checks = new Map<string, CheckLu[]>();
  const creees: { numero: number; titre: string; corps: string; labels: string[] }[] = [];
  let horloge = Date.parse("2026-11-04T10:00:00Z");
  let id = 0;
  const poster = (numero: number, body: string, association = "OWNER") => {
    const liste = commentaires.get(numero) ?? [];
    liste.push({ id: ++id, body, association, createdAt: new Date((horloge += 1000)).toISOString() });
    commentaires.set(numero, liste);
  };
  const contexte = (station = "box/claude"): ContexteDuRenvoi => ({
    station,
    github: {
      commentaires: async (numero) => [...(commentaires.get(numero) ?? [])],
      commenter: async (numero, body) => poster(numero, body),
      labelliser: async (numero, ajout) => void ajout.forEach((label) => etiquettes.get(numero)?.add(label)),
      delabelliser: async (numero, label) => void etiquettes.get(numero)?.delete(label),
      ci: async (sha) => checks.get(sha) ?? [],
      corpsDuTicket: async (numero) => corpsDes.get(numero) ?? "",
    },
    manager: {
      creerIssue: async ({ titre, corps: texte, labels: ajout }) => {
        const numero = 100 + creees.length;
        creees.push({ numero, titre, corps: texte, labels: ajout });
        etiquettes.set(numero, new Set(ajout));
        corpsDes.set(numero, texte);
        return numero;
      },
    },
  });
  const ticket = () => ({ number: TICKET, title: "Port the send-backs", labels: [...(etiquettes.get(TICKET) ?? [])] });
  return {
    contexte,
    ticket,
    poster,
    creees,
    labels: () => [...(etiquettes.get(TICKET) ?? [])],
    commentaires: () => commentaires.get(TICKET) ?? [],
    rougeSur: (sha: string, nom = "runtime tests", url = `https://github.com/o/r/actions/runs/${sha}`) => checks.set(sha, [{ name: "typecheck", outcome: "green" }, { name: nom, outcome: "red", url }]),
    refuseeSur: (sha: string, motif: string) => poster(PR, corpsDeVerdict("mac/claude", sha, { verdict: "request-changes", motif })),
    // L'état que la boucle lit : libre (null), un cook peut le prendre.
    etat: (pr: { state: "open"; merged: false } | null = { state: "open", merged: false }) => etatDuTicket({ state: "open", labels: ticket().labels, pr }),
  };
}

const sha = (n: number) => `${n}`.repeat(40).slice(0, 40).replace(/[^0-9]/g, "a");
const ciRouge = (n: number): Refus => ({ genre: "ci-rouge", pr: PR, sha: sha(n) });
const refusee = (n: number): Refus => ({ genre: "relecture", pr: PR, sha: sha(n) });
const CALIBRE = ["fire", LABEL_IN_PASS, "model:sonnet", "effort:medium"];

// Les renvois que la CLI `pass` compte (`montrer-pass.ts`) sont ceux de la station.
test("N vaut sur le chemin GitHub seul ce que la CLI `pass` en compte", () => {
  assert.equal(RENVOIS_MAX, RENVOIS_MAX_DE_LA_PASS);
  assert.equal(RENVOIS_MAX, RENVOIS_MAX_DE_LA_STATION);
});

test("une CI rouge renvoie le ticket à un cook, la raison de l'échec en commentaire sur l'issue", async () => {
  const gh = depot(CALIBRE);
  gh.rougeSur(sha(1), "runtime tests", "https://github.com/o/r/actions/runs/7");
  const coup = await renvoyerLaLivraison(gh.ticket(), ciRouge(1), gh.contexte());
  assert.equal(coup.coup, "renvoi");
  assert.equal(coup.coup === "renvoi" && coup.n, 1);
  const [dit] = gh.commentaires();
  assert.match(dit?.body ?? "", /^<!-- brigade:renvoi n=1 sha=/);
  assert.match(dit?.body ?? "", /sent back to a cook \(1\/2\)/);
  assert.match(dit?.body ?? "", /the CI is red on `1111111` \(PR #41\)/);
  assert.match(dit?.body ?? "", /`runtime tests` — https:\/\/github\.com\/o\/r\/actions\/runs\/7/);
  assert.doesNotMatch(dit?.body ?? "", /typecheck/);
  // `in-pass` tombé : la boucle lit le ticket libre, et un cook le prend.
  assert.ok(!gh.labels().includes(LABEL_IN_PASS));
  assert.equal(gh.etat(), null);
});

test("un request-changes de la relecture renvoie le ticket à un cook, la raison du reviewer en commentaire", async () => {
  const gh = depot(CALIBRE);
  gh.refuseeSur(sha(1), "The fix ticket is never opened.\n- **Blocking** (`runtime/src/x.ts`): no test covers the escalation.");
  const coup = await renvoyerLaLivraison(gh.ticket(), refusee(1), gh.contexte());
  assert.equal(coup.coup, "renvoi");
  const [dit] = gh.commentaires();
  assert.match(dit?.body ?? "", /the review requested changes on `1111111` \(PR #41\)/);
  assert.match(dit?.body ?? "", /The fix ticket is never opened\./);
  assert.match(dit?.body ?? "", /no test covers the escalation/);
  assert.doesNotMatch(dit?.body ?? "", /Changes requested by station/);
  assert.equal(gh.etat(), null);
});

test("après N renvois, le ticket n'est plus donné à un cook : remis au manager, un fix calibré un cran plus haut", async () => {
  const gh = depot(CALIBRE);
  for (const n of [1, 2]) {
    gh.rougeSur(sha(n));
    assert.equal((await renvoyerLaLivraison(gh.ticket(), ciRouge(n), gh.contexte())).coup, "renvoi");
    // Le cook suivant relivre : le ticket revient en pass.
    await gh.contexte().github.labelliser(TICKET, [LABEL_IN_PASS]);
  }
  gh.refuseeSur(sha(3), "Still no escalation test.");
  const coup = await renvoyerLaLivraison(gh.ticket(), refusee(3), gh.contexte());
  assert.equal(coup.coup, "au-manager");
  if (coup.coup !== "au-manager") return;
  assert.equal(coup.n, RENVOIS_MAX + 1);
  assert.deepEqual(coup.de, { model: "sonnet", effort: "medium" });
  assert.deepEqual(coup.vers, { model: "sonnet", effort: "high" });

  const [fix] = gh.creees;
  assert.equal(gh.creees.length, 1);
  assert.equal(fix?.numero, coup.fix);
  assert.deepEqual(fix?.labels, ["fire", "fix", "prio:1", "model:sonnet", "effort:high"]);
  assert.ok(fix?.corps.startsWith(marqueDeFix(TICKET)));
  assert.match(fix?.corps ?? "", /Still no escalation test\./);
  assert.match(fix?.corps ?? "", /runtime tests/);

  assert.match(gh.commentaires().at(-1)?.body ?? "", new RegExp(`^<!-- brigade:au-manager fix=${coup.fix} sha=`));
  assert.match(gh.commentaires().at(-1)?.body ?? "", /handed to the manager, who opened the fix ticket #100, calibrated `sonnet` \/ `high`, one step above `sonnet` \/ `medium`/);
  assert.ok(gh.labels().includes(LABEL_WAITING));
  assert.ok(!gh.labels().includes(LABEL_IN_PASS));
  // La boucle ne le donne plus à un cook : il attend son fix.
  assert.equal(gh.etat(), "waiting");

  // Rejouée sur la même livraison, elle n'ouvre pas un second fix.
  const encore = await renvoyerLaLivraison(gh.ticket(), ciRouge(3), gh.contexte());
  assert.equal(encore.coup, "rien");
  assert.equal(gh.creees.length, 1);
});

test("le compte des renvois survit au redémarrage : chaque station neuve le relit de GitHub", async () => {
  const gh = depot(CALIBRE);
  gh.rougeSur(sha(1));
  await renvoyerLaLivraison(gh.ticket(), ciRouge(1), gh.contexte("box/claude"));
  await gh.contexte().github.labelliser(TICKET, [LABEL_IN_PASS]);
  // La station redémarre, ou une autre prend le relais : rien d'elle ne reste.
  gh.rougeSur(sha(2));
  const second = await renvoyerLaLivraison(gh.ticket(), ciRouge(2), gh.contexte("mac/claude"));
  assert.equal(second.coup === "renvoi" && second.n, 2);
  await gh.contexte().github.labelliser(TICKET, [LABEL_IN_PASS]);
  gh.rougeSur(sha(3));
  assert.equal((await renvoyerLaLivraison(gh.ticket(), ciRouge(3), gh.contexte("box/claude"))).coup, "au-manager");
});

test("un renvoi écrit par la boucle d'avant ce module, sans tête, compte aussi", async () => {
  const gh = depot(CALIBRE);
  gh.poster(TICKET, "<!-- brigade:renvoi n=1 -->\nStation `box/claude`: sent back to a cook (1/2) — the CI is red");
  gh.poster(TICKET, "<!-- brigade:renvoi n=2 -->\nStation `box/claude`: sent back to a cook (2/2) — the review requested changes");
  gh.rougeSur(sha(3));
  assert.equal((await renvoyerLaLivraison(gh.ticket(), ciRouge(3), gh.contexte())).coup, "au-manager");
});

test("une livraison rouge à la CI et refusée par la relecture ne compte qu'un renvoi", async () => {
  const gh = depot(CALIBRE);
  gh.rougeSur(sha(1));
  gh.refuseeSur(sha(1), "Red anyway.");
  assert.equal((await renvoyerLaLivraison(gh.ticket(), ciRouge(1), gh.contexte())).coup, "renvoi");
  assert.equal((await renvoyerLaLivraison(gh.ticket(), refusee(1), gh.contexte())).coup, "rien");
  assert.equal(gh.commentaires().length, 1);
});

test("une marque de renvoi postée par un inconnu ne compte pas", async () => {
  const gh = depot(CALIBRE);
  gh.poster(TICKET, "<!-- brigade:renvoi n=1 sha=ffffff -->\nfake", "NONE");
  gh.poster(TICKET, "<!-- brigade:renvoi n=2 sha=eeeeee -->\nfake", "NONE");
  gh.rougeSur(sha(1));
  const coup = await renvoyerLaLivraison(gh.ticket(), ciRouge(1), gh.contexte());
  assert.equal(coup.coup === "renvoi" && coup.n, 1);
});

test("rien à renvoyer : aucun check rouge, ou une relecture qui n'a pas refusé cette tête", async () => {
  const gh = depot(CALIBRE);
  assert.equal((await renvoyerLaLivraison(gh.ticket(), ciRouge(1), gh.contexte())).coup, "rien");
  gh.refuseeSur(sha(1), "Old head.");
  assert.equal((await renvoyerLaLivraison(gh.ticket(), refusee(2), gh.contexte())).coup, "rien");
  assert.deepEqual(gh.commentaires(), []);
  assert.ok(gh.labels().includes(LABEL_IN_PASS));
});

async function epuiser(gh: ReturnType<typeof depot>) {
  for (const n of [1, 2, 3]) {
    gh.rougeSur(sha(n));
    const coup = await renvoyerLaLivraison(gh.ticket(), ciRouge(n), gh.contexte());
    if (n < 3) await gh.contexte().github.labelliser(TICKET, [LABEL_IN_PASS]);
    else return coup;
  }
  throw new Error("unreachable");
}

test("au plafond, rien ne monte : le ticket sort de la cuisine, un humain décide", async () => {
  const gh = depot(["fire", LABEL_IN_PASS, "model:opus", "effort:high"]);
  const coup = await epuiser(gh);
  assert.equal(coup.coup, "hors-cuisine");
  assert.deepEqual(gh.creees, []);
  assert.ok(gh.labels().includes(HORS_CUISINE));
  assert.match(gh.commentaires().at(-1)?.body ?? "", /already the highest the kitchen sets/);
});

test("un ticket fix de la cuisine n'ouvre pas de fix de plus", async () => {
  const gh = depot(CALIBRE, `${marqueDeFix(7)}\n\n## Context`);
  const coup = await epuiser(gh);
  assert.equal(coup.coup, "hors-cuisine");
  assert.deepEqual(gh.creees, []);
});

test("le calibrage monte l'effort d'abord, puis le modèle, jamais au-delà de high ni du plafond", () => {
  assert.deepEqual(calibrageAuDessus({ model: "haiku", effort: "high" }), { model: "sonnet", effort: "high" });
  assert.deepEqual(calibrageAuDessus({ model: "sonnet", effort: "low" }), { model: "sonnet", effort: "medium" });
  assert.equal(calibrageAuDessus({ model: "opus", effort: "high" }), null);
  assert.equal(calibrageAuDessus({ model: "opus", effort: "high" }, { model: "opus", effort: "max" }), null);
  assert.equal(calibrageAuDessus({ model: "sonnet", effort: "high" }, { model: "sonnet", effort: "high" }), null);
});
