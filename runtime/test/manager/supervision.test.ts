// Le superviseur du projet (#3911, `manager/supervision.ts`) : le contrôle qui referme le disjoncteur, la trace qu'il laisse,
// et le dossier d'un ticket mis de côté — seuls les gestes de l'étape 4 de la spec s'appliquent.
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { ouvrirJournal } from "../../src/journal.ts";
import { etatDesGardeFous } from "../../src/projections/guardrails.ts";
import { ouvrirSupervision } from "../../src/manager/supervision.ts";
import { jusqua, repertoireTemporaire } from "../outils.ts";

// Les gestes de l'étape 4 de la spec que ce ticket sait appliquer, et le rythme du superviseur : 10 minutes, trois essais.
const GESTES = ["rail", "waiting", "close", "todo"];
const CONTROLE_TOUS_LES_MS = 10 * 60_000;
const DOSSIER_TOUS_LES_MS = 10 * 60_000;
const DOSSIER_ESSAIS_MAX = 3;
const MARQUE_DU_SUPERVISEUR = "<!-- brigade:superviseur -->";
const LIMITES = { durationMs: 3_600_000, tokens: 2_000_000, idleMs: 600_000 };

type Reponse = { run: string; valeur: unknown } | { run: string; illisible: string } | null;

function superviseur(t: TestContext, { labels = ["fire", "set-aside:failures"], reponses, lectureEnPanne = false, sansRun = false }: { labels?: string[]; reponses: Array<Reponse | ((lire: (message: string | null) => unknown) => Reponse | Promise<Reponse>)>; lectureEnPanne?: boolean; sansRun?: boolean }) {
  const journal = ouvrirJournal(repertoireTemporaire(t));
  journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "guard.configured", payload: { limits: LIMITES, breakerThreshold: 3 } });
  const portes = [...labels];
  t.after(() => journal.fermer());
  let instant = Date.parse("2026-11-20T10:00:00Z");
  const ecritures: string[] = [];
  const consignes: string[] = [];
  const sujets: string[] = [];
  const succes: Array<string | undefined> = [];
  let suite = 0;
  const panne: { commentaire: number | null; fermer: boolean } = { commentaire: null, fermer: false };
  const github = {
    tickets: async () => {
      if (lectureEnPanne) throw new Error("HTTP 502");
      return { inchange: false as const, issues: [{ number: 77, title: "Add the lap screen", labels: [...portes], state: "open" as const, createdAt: "", updatedAt: "", url: "" }], confirmer: () => {} };
    },
    issue: async () => ({ number: 77, title: "Add the lap screen", labels: [...portes], state: "open" as const, createdAt: "", updatedAt: "", url: "", body: "The lap screen shows each lap." }),
    commentaires: async () => [{ body: "The cook stopped without a delivery", author: "station", association: "OWNER", createdAt: "2026-11-20T09:00:00Z" }],
    commenter: async (numero: number, corps: string) => {
      if (panne.commentaire === numero) throw new Error("HTTP 502");
      ecritures.push(`comment #${numero}: ${corps}`);
    },
    labelliser: async (numero: number, ajoutes: string[]) => {
      portes.push(...ajoutes);
      ecritures.push(`label #${numero} +${ajoutes.join(",")}`);
    },
    delabelliser: async (numero: number, label: string) => {
      portes.splice(0, portes.length, ...portes.filter((porte) => porte !== label));
      ecritures.push(`label #${numero} -${label}`);
    },
    fermerIssue: async (numero: number) => {
      if (panne.fermer) throw new Error("HTTP 502");
      ecritures.push(`close #${numero}`);
    },
  };
  const demander = async (sujet: { numero: number; prefixe: string }, consigne: string, lire: (message: string | null) => unknown, _env?: unknown, ok?: string) => {
    sujets.push(sujet.prefixe);
    // Un contrôle part comme un run, sauf quand le lancement est refusé.
    if (sujet.prefixe === "controle" && !sansRun) journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "cook.launched", payload: { run: `controle-0-${suite}`, limits: LIMITES, stream: "runs/controle.jsonl" } });
    consignes.push(consigne);
    succes.push(ok);
    const prochaine = reponses[Math.min(suite, reponses.length - 1)];
    suite += 1;
    const reponse = typeof prochaine === "function" ? prochaine(lire) : prochaine;
    return reponse as never;
  };
  const avertissements: string[] = [];
  const supervision = ouvrirSupervision({ base: journal.base, journal, projet: "brigade", github: github as never, demander: demander as never, maintenant: () => new Date(instant), avertir: (texte) => avertissements.push(texte), arrete: () => false });
  const ouvrirLeDisjoncteur = (stalled?: Record<string, unknown>) => {
    for (const [i, ticket] of [31, 32, 33].entries()) {
      journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.launched", payload: { run: `${ticket}-github-0000000${i}`, limits: LIMITES, stream: `runs/${ticket}.jsonl` } });
      journal.ajouter({ project: "brigade", ticket, author: "runtime", type: "cook.exited", payload: { run: `${ticket}-github-0000000${i}`, outcome: "failed", code: 1, signal: null, turns: 3, tokens: 1000, durationMs: 1000 } });
    }
    journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.opened", payload: stalled === undefined ? { failures: 3, threshold: 3 } : ({ failures: 0, threshold: 3, stalled } as never) });
  };
  return { panne, journal, supervision, ecritures, consignes, sujets, succes, avertissements, avancer: (ms: number) => (instant += ms), ouvert: () => etatDesGardeFous(journal.base).breakerOpenedAt !== null, ouvrirLeDisjoncteur };
}

const ok = (run = "controle-0-aaaaaaaa"): Reponse => ({ run, valeur: true });
const decision = (valeur: Record<string, unknown>) => (lire: (message: string | null) => unknown): Reponse => {
  const lu = lire(JSON.stringify(valeur)) as { valeur?: unknown; illisible?: string };
  return lu.valeur === undefined ? { run: "supervise-77-aaaaaaaa", illisible: lu.illisible ?? "" } : { run: "supervise-77-aaaaaaaa", valeur: lu.valeur };
};

test("a breaker whose check still fails stays open, and the check is rerun only after its delay", async (t) => {
  const s = superviseur(t, { labels: [], reponses: [null] });
  s.ouvrirLeDisjoncteur();
  await s.supervision.passer();
  assert.deepEqual(s.sujets, ["controle"]);
  assert.deepEqual(s.succes, ["ok"]);
  assert.equal(s.ouvert(), true);
  assert.deepEqual(s.ecritures, []);
  s.avancer(CONTROLE_TOUS_LES_MS - 1);
  await s.supervision.passer();
  assert.equal(s.sujets.length, 1);
  s.avancer(1);
  await s.supervision.passer();
  assert.equal(s.sujets.length, 2);
  assert.equal(s.ouvert(), true);
});

test("a check that launched no run is replayed after a few seconds, not after the delay of a failed check", async (t) => {
  const s = superviseur(t, { labels: [], reponses: [null], sansRun: true });
  s.ouvrirLeDisjoncteur();
  await s.supervision.passer();
  assert.equal(s.sujets.length, 1);
  s.avancer(4_999);
  await s.supervision.passer();
  assert.equal(s.sujets.length, 1);
  s.avancer(1);
  await s.supervision.passer();
  assert.equal(s.sujets.length, 2);
  assert.equal(s.ouvert(), true);
});

test("a breaker whose check passes is closed, and each ticket its failures touched is told which cause is gone", async (t) => {
  const s = superviseur(t, { labels: [], reponses: [ok()] });
  s.ouvrirLeDisjoncteur();
  await s.supervision.passer();
  assert.equal(s.ouvert(), false);
  const fermeture = s.journal.tout().filter((fait) => fait.type === "breaker.lifted");
  assert.deepEqual(fermeture.map((fait) => fait.payload), [{ failures: 3, threshold: 3, after: "controle-0-aaaaaaaa" }]);
  assert.deepEqual(s.ecritures.map((e) => e.slice(0, 11)), ["comment #31", "comment #32", "comment #33"]);
  for (const ecriture of s.ecritures) {
    assert.ok(ecriture.includes(MARQUE_DU_SUPERVISEUR));
    assert.match(ecriture, /breaker is closed/);
    assert.match(ecriture, /Cause gone: cooks failed in a row \(3 failures\)/);
  }
  // Fermé, plus rien n'est rejoué.
  s.avancer(CONTROLE_TOUS_LES_MS);
  await s.supervision.passer();
  assert.equal(s.sujets.length, 1);
});

test("a breaker opened by a stall, closed by the check's own run, is not closed twice; its ticket is told", async (t) => {
  const calage = { run: "44-github-2222aaaa-r2", kind: "cook", turns: 1, tokens: 10, activity: { doing: "running", target: "cat" }, retries: 2 };
  let s: ReturnType<typeof superviseur>;
  s = superviseur(t, {
    labels: [],
    reponses: [
      () => {
        s.journal.ajouter({ project: "brigade", ticket: null, author: "runtime", type: "breaker.lifted", payload: { failures: 0, threshold: 3, after: "controle-0-bbbbbbbb" } });
        return ok("controle-0-bbbbbbbb");
      },
    ],
  });
  s.ouvrirLeDisjoncteur(calage);
  await s.supervision.passer();
  assert.equal(s.journal.tout().filter((fait) => fait.type === "breaker.lifted").length, 1);
  assert.deepEqual(s.ecritures.map((e) => e.slice(0, 11)), ["comment #44"]);
  assert.match(s.ecritures[0] ?? "", /Cause gone: a run kept stalling \(a cook run \(`44-github-2222aaaa-r2`\) hung on `running cat`/);
});

test("a check that answers unreadably does not close the breaker", async (t) => {
  const s = superviseur(t, { labels: [], reponses: [{ run: "controle-0-aaaaaaaa", illisible: "x" }] });
  s.ouvrirLeDisjoncteur();
  await s.supervision.passer();
  assert.equal(s.ouvert(), true);
  assert.deepEqual(s.ecritures, []);
});

test("a comment that cannot be posted is said, the other tickets are told, and the breaker stays closed", async (t) => {
  const s = superviseur(t, { labels: [], reponses: [ok()] });
  s.panne.commentaire = 32;
  s.ouvrirLeDisjoncteur();
  await s.supervision.passer();
  assert.equal(s.ouvert(), false);
  assert.deepEqual(s.ecritures.map((e) => e.slice(0, 11)), ["comment #31", "comment #33"]);
  assert.match(s.avertissements[0] ?? "", /#32 — HTTP 502/);
});

test("a ticket set aside for its failures is handed to the supervisor with its dossier, and no write precedes the answer", async (t) => {
  const s = superviseur(t, { reponses: [null] });
  await s.supervision.passer();
  assert.deepEqual(s.sujets, ["supervise"]);
  const [dossier] = s.consignes;
  assert.match(dossier ?? "", /# Ticket #77 — Add the lap screen/);
  assert.match(dossier ?? "", /The lap screen shows each lap\./);
  assert.match(dossier ?? "", /The cook stopped without a delivery/);
  for (const geste of GESTES) assert.ok((dossier ?? "").includes(`"${geste}"`), geste);
  assert.deepEqual(s.ecritures, []);
});

const AVEC_NOTE = { note: "the PR conflicts with the base" };
const CAS: Array<[string, Record<string, unknown>, RegExp[], string[]]> = [
  ["rail", { gesture: "rail", ...AVEC_NOTE }, [/put it back on the rail/], ["label #77 -set-aside:failures"]],
  ["waiting", { gesture: "waiting", ...AVEC_NOTE, third_party: "the design team" }, [/set it aside in WAITING for the design team/, /^comment #77: <!-- brigade:waiting /], ["label #77 +waiting", "label #77 -set-aside:failures"]],
  ["close", { gesture: "close", ...AVEC_NOTE }, [/closed it/], ["close #77", "label #77 -set-aside:failures"]],
  ["todo", { gesture: "todo", ...AVEC_NOTE, question: "Which screen keeps the laps?" }, [/Which screen keeps the laps\?/], ["label #77 +blocked-on-human", "label #77 -set-aside:failures"]],
];
for (const [nom, reponse, attendus, labels] of CAS) {
  test(`the gesture « ${nom} » is applied with one trace comment, then the set-aside label falls`, async (t) => {
    const s = superviseur(t, { reponses: [decision(reponse)] });
    await s.supervision.passer();
    const traces = s.ecritures.filter((e) => e.includes(MARQUE_DU_SUPERVISEUR));
    assert.equal(traces.length, 1);
    for (const attendu of attendus) assert.match(traces[0] ?? "", attendu);
    assert.match(traces[0] ?? "", /\*\*Saw:\*\* the PR conflicts with the base/);
    for (const ecriture of labels) assert.ok(s.ecritures.includes(ecriture), `${ecriture} in ${s.ecritures.join(" | ")}`);
    assert.equal(s.ecritures.at(-1), "label #77 -set-aside:failures");
    // Rien d'autre que les gestes de la liste : jamais de `fire` retiré, de merge ni de commentaire hors trace.
    assert.deepEqual(s.ecritures.filter((e) => e.startsWith("comment") && !e.includes(MARQUE_DU_SUPERVISEUR)), []);
    // Le ticket n'est plus confié.
    s.avancer(DOSSIER_TOUS_LES_MS);
    await s.supervision.passer();
    assert.equal(s.sujets.length, 1);
  });
}

test("« rail » puts `fire` back only when the ticket has lost it", async (t) => {
  const sans = superviseur(t, { labels: ["set-aside:failures"], reponses: [decision({ gesture: "rail", ...AVEC_NOTE })] });
  await sans.supervision.passer();
  assert.ok(sans.ecritures.includes("label #77 +fire"));
  const avec = superviseur(t, { reponses: [decision({ gesture: "rail", ...AVEC_NOTE })] });
  await avec.supervision.passer();
  assert.equal(avec.ecritures.some((e) => e.includes("+fire")), false);
});

const HORS_LISTE: Array<[string, Record<string, unknown>]> = [
  ["a gesture outside the list", { gesture: "merge", note: "merge it" }],
  ["a rerun of the CI, which this ticket does not apply", { gesture: "rerun", note: "rerun" }],
  ["no note", { gesture: "rail", note: "  " }],
  ["a wait that names nobody", { gesture: "waiting", note: "x" }],
  ["a TODO card with no question", { gesture: "todo", note: "x" }],
];
for (const [nom, reponse] of HORS_LISTE) {
  test(`${nom}: nothing is written, and the dossier is handed again at most ${DOSSIER_ESSAIS_MAX} times, each after its delay`, async (t) => {
    const s = superviseur(t, { reponses: [decision(reponse)] });
    await s.supervision.passer();
    assert.deepEqual(s.ecritures, []);
    assert.equal(s.sujets.length, 1);
    s.avancer(DOSSIER_TOUS_LES_MS - 1);
    await s.supervision.passer();
    assert.equal(s.sujets.length, 1);
    for (let essai = 2; essai <= DOSSIER_ESSAIS_MAX + 2; essai += 1) {
      s.avancer(DOSSIER_TOUS_LES_MS);
      await s.supervision.passer();
    }
    assert.equal(s.sujets.length, DOSSIER_ESSAIS_MAX);
    assert.deepEqual(s.ecritures, []);
    assert.equal(s.avertissements.length, DOSSIER_ESSAIS_MAX);
  });
}

test("an answer that is not JSON does nothing", async (t) => {
  const s = superviseur(t, { reponses: [(lire) => ({ run: "supervise-77-aaaaaaaa", ...(lire("I would rerun it.") as { illisible: string }) })] });
  await s.supervision.passer();
  assert.deepEqual(s.ecritures, []);
  assert.match(s.avertissements[0] ?? "", /no JSON object/);
});

test("a ticket that is not set aside for its failures is not handed over", async (t) => {
  const s = superviseur(t, { labels: ["fire", "served-elsewhere"], reponses: [null] });
  await s.supervision.passer();
  assert.deepEqual(s.sujets, []);
});

test("a gesture that fails on GitHub is said, keeps the set-aside label, and is retried after the delay", async (t) => {
  const s = superviseur(t, { reponses: [decision({ gesture: "close", ...AVEC_NOTE })] });
  s.panne.fermer = true;
  await s.supervision.passer();
  assert.equal(s.ecritures.includes("label #77 -set-aside:failures"), false);
  assert.match(s.avertissements[0] ?? "", /#77 non traité — HTTP 502/);
  s.panne.fermer = false;
  await s.supervision.passer();
  assert.equal(s.sujets.length, 1);
  s.avancer(DOSSIER_TOUS_LES_MS);
  await s.supervision.passer();
  assert.equal(s.sujets.length, 2);
  assert.ok(s.ecritures.includes("close #77"));
  assert.equal(s.ecritures.at(-1), "label #77 -set-aside:failures");
});

test("a gesture that keeps failing on GitHub is handed again at most DOSSIER_ESSAIS_MAX times", async (t) => {
  const s = superviseur(t, { reponses: [decision({ gesture: "close", ...AVEC_NOTE })] });
  s.panne.fermer = true;
  for (let essai = 1; essai <= DOSSIER_ESSAIS_MAX + 2; essai += 1) {
    await s.supervision.passer();
    s.avancer(DOSSIER_TOUS_LES_MS);
  }
  assert.equal(s.sujets.length, DOSSIER_ESSAIS_MAX);
  assert.equal(s.avertissements.length, DOSSIER_ESSAIS_MAX);
});

test("a wake-up that comes during a pass does not hand the same ticket a second time", async (t) => {
  let lacher: () => void = () => {};
  const retenue = new Promise<void>((resoudre) => (lacher = resoudre));
  const s = superviseur(t, { reponses: [async () => (await retenue, null), null] });
  const premiere = s.supervision.passer();
  await jusqua(() => s.sujets.length === 1);
  await s.supervision.passer();
  assert.equal(s.sujets.length, 1);
  lacher();
  await premiere;
  assert.equal(s.sujets.length, 1);
});

test("a GitHub read that fails is said and does not stop the supervisor", async (t) => {
  const s = superviseur(t, { reponses: [null], lectureEnPanne: true });
  await s.supervision.passer();
  assert.match(s.avertissements[0] ?? "", /le superviseur a buté — HTTP 502/);
  assert.deepEqual(s.sujets, []);
});
