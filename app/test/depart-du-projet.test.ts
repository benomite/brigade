// Le départ d'un projet (#3268) : les issues ouvertes lues sur GitHub, le triage du second — la section de son rôle donnée à
// `claude -p` —, et la mise sur le rail des lignes que le chef garde. Aucune lecture qui échoue ne devient une liste ou une
// priorité par défaut.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { DELAI_DU_TRIAGE_MS, lancerLeTriage, lireLaReponse, mettreSurLeRail, proposerLeDepart, triageDuSecond, type LancerLeTriage } from "../src/depart-du-projet.ts";
import { ROLE_DU_SECOND } from "../src/second/lancement.ts";
import type { AppelGitHub, ReponseGitHub } from "../src/tableau/client.ts";
import type { ClientDeLaPriorite } from "../src/priorite.ts";

const issue = (number: number, extra: Record<string, unknown> = {}) => ({ number, title: `Issue ${number}`, body: `body ${number}`, labels: [], ...extra });
const GitHub = (pages: unknown[][], statut = 200): AppelGitHub => async (chemin) => {
  const page = Number(/[?&]page=(\d+)/.exec(chemin)?.[1] ?? 1);
  return { status: statut, data: pages[page - 1] ?? [] };
};
const repond = (prios: Record<number, [number, string]>): LancerLeTriage => async () => ({
  code: 0,
  sortie: JSON.stringify(Object.entries(prios).map(([number, [prio, reason]]) => ({ number: Number(number), prio, reason }))),
  erreur: "",
});
const base = { depot: "chef/cantine", dossier: "/tmp/cantine", claude: "claude" };

describe("le triage du second", () => {
  test("la consigne est la section de son rôle, mot pour mot, avec les issues sans `fire` — et le compte compte toutes les issues, pas les pull requests", async () => {
    let consigne = "";
    const lancer: LancerLeTriage = async (_c, args, entree) => {
      consigne = entree;
      assert.deepEqual(args, ["-p"]);
      return { code: 0, sortie: JSON.stringify([{ number: 1, prio: 2, reason: "important" }]), erreur: "" };
    };
    const lire = GitHub([[issue(1), issue(2, { labels: [{ name: "fire" }] }), { ...issue(3), pull_request: {} }]]);
    const rendu = await proposerLeDepart({ ...base, lire, lancer });
    assert.deepEqual(rendu, { ouvertes: 2, lignes: [{ ticket: 1, titre: "Issue 1", priorite: 2, raison: "important" }] });
    const section = triageDuSecond(readFileSync(ROLE_DU_SECOND, "utf8"));
    assert.ok(section?.includes("`prio:1`, `prio:2` or `prio:3`"));
    assert.ok(consigne.includes(section ?? assert.fail("pas de section")));
    assert.ok(consigne.includes("Issue 1"));
    assert.equal(consigne.includes("Issue 2"), false);
  });

  test("aucune issue ouverte : pas d'écran, et le triage n'est pas appelé", async () => {
    const lancer: LancerLeTriage = async () => assert.fail("le triage ne se lance pas sans issue");
    assert.deepEqual(await proposerLeDepart({ ...base, lire: GitHub([[{ ...issue(5), pull_request: {} }]]), lancer }), { aucune: true });
  });

  test("toutes les pages sont lues : 101 issues, la 101e sur la seconde page, comptée et triée", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => issue(i + 1));
    let consigne = "";
    const lancer: LancerLeTriage = async (_c, _a, entree) => {
      consigne = entree;
      return { code: 0, sortie: JSON.stringify([{ number: 101, prio: 3, reason: "last" }]), erreur: "" };
    };
    const rendu = await proposerLeDepart({ ...base, lire: GitHub([page1, [issue(101)]]), lancer });
    assert.ok("ouvertes" in rendu && rendu.ouvertes === 101);
    assert.ok(consigne.includes("Issue 101"));
  });

  test("GitHub qui refuse la lecture : rien n'est inventé, la cause est dite", async () => {
    const rendu = await proposerLeDepart({ ...base, lire: GitHub([[]], 403), lancer: repond({}) });
    assert.ok("sans" in rendu && rendu.sans.includes("were not read") && rendu.detail?.includes("403"));
  });

  test("un triage qui échoue, ou répond ce qui ne se lit pas, est dit — jamais une liste ni une priorité par défaut", async () => {
    const lire = GitHub([[issue(1)]]);
    const echec = await proposerLeDepart({ ...base, lire, lancer: async () => ({ code: 1, sortie: "", erreur: "boom" }) });
    assert.ok("sans" in echec && echec.detail === "boom");
    for (const sortie of ["no list here", JSON.stringify([{ number: 1, prio: 9, reason: "x" }]), JSON.stringify([{ number: 1, prio: 1, reason: "" }]), JSON.stringify([{ number: 99, prio: 1, reason: "x" }])]) {
      const rendu = await proposerLeDepart({ ...base, lire, lancer: async () => ({ code: 0, sortie, erreur: "" }) });
      assert.ok("sans" in rendu, sortie);
    }
  });

  test("une issue que le triage ne nomme pas n'est pas proposée ; l'ordre est celui des issues", () => {
    const lignes = lireLaReponse(JSON.stringify([{ number: 2, prio: 3, reason: "later" }, { number: 1, prio: 1, reason: "first" }]), [{ number: 1, title: "a", body: "", labels: [] }, { number: 2, title: "b", body: "", labels: [] }, { number: 3, title: "c", body: "", labels: [] }]);
    assert.deepEqual(lignes.map(({ ticket }) => ticket), [1, 2]);
  });

  test("un vrai processus lancé : la consigne arrive sur son entrée, sa sortie revient, et un délai dépassé le tue", async () => {
    const eco = await lancerLeTriage(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], "bonjour", process.cwd(), 5_000);
    assert.deepEqual(eco, { code: 0, sortie: "bonjour", erreur: "" });
    const lent = await lancerLeTriage(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], "", process.cwd(), 200);
    assert.notEqual(lent.code, 0);
    assert.ok(lent.erreur.includes("no answer within"));
    const absent = await lancerLeTriage("/nulle/part/claude", ["-p"], "", process.cwd(), 1_000);
    assert.equal(absent.code, null);
  });
});

describe("la borne du triage", () => {
  test("un triage plus lent que la borne : le processus est tué et l'écran rend la cause — jamais une attente sans fin ; la borne tient sous les deux minutes du critère", async () => {
    assert.ok(DELAI_DU_TRIAGE_MS < 120_000);
    const issues = Array.from({ length: 100 }, (_, i) => issue(i + 1));
    // Le vrai lanceur, un processus qui dort bien au-delà de la borne (ramenée à 300 ms) : la même voie que la borne de 100 s.
    const lancer: LancerLeTriage = (_commande, _args, entree, _dossier, delaiMs) => lancerLeTriage(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], entree, process.cwd(), delaiMs);
    const debut = performance.now();
    const rendu = await proposerLeDepart({ ...base, lire: GitHub([issues]), lancer, delaiMs: 300 });
    assert.ok(performance.now() - debut < 5_000);
    assert.ok("sans" in rendu && rendu.detail?.includes("no answer within"), JSON.stringify(rendu));
  });
});

describe("la mise sur le rail", () => {
  const client = (labels: Record<number, string[]> = {}, refuser?: (chemin: string) => boolean) => {
    const ecrits: { methode: string; chemin: string; corps?: unknown }[] = [];
    const reponse = (status: number, data: unknown = {}): ReponseGitHub => ({ status, data });
    const c: ClientDeLaPriorite = {
      lire: async (chemin) => reponse(200, { labels: (labels[Number(/issues\/(\d+)/.exec(chemin)?.[1])] ?? []).map((name) => ({ name })) }),
      ecrire: async (methode, chemin, corps) => {
        ecrits.push({ methode, chemin, corps });
        return refuser?.(chemin) === true ? reponse(403, { message: "no" }) : reponse(200);
      },
    };
    return { c, ecrits };
  };

  test("chaque ligne reçoit sa priorité, `product` et `fire` — l'ancienne priorité est retirée", async () => {
    const { c, ecrits } = client({ 12: ["prio:3"] });
    const mise = await mettreSurLeRail({ depot: "chef/cantine", lignes: [{ ticket: 12, priorite: 1 }, { ticket: 31, priorite: 2 }], client: c });
    assert.deepEqual(mise, { fait: [12, 31], refus: [] });
    assert.deepEqual(ecrits.map(({ methode, chemin, corps }) => [methode, chemin, corps]), [
      ["POST", "/repos/chef/cantine/issues/12/labels", { labels: ["prio:1"] }],
      ["DELETE", "/repos/chef/cantine/issues/12/labels/prio%3A3", undefined],
      ["POST", "/repos/chef/cantine/issues/12/labels", { labels: ["product", "fire"] }],
      ["POST", "/repos/chef/cantine/issues/31/labels", { labels: ["prio:2"] }],
      ["POST", "/repos/chef/cantine/issues/31/labels", { labels: ["product", "fire"] }],
    ]);
  });

  test("une ligne refusée par GitHub est dite avec sa cause et n'est pas comptée ; les autres continuent", async () => {
    const { c } = client({}, (chemin) => chemin.includes("/12/"));
    const mise = await mettreSurLeRail({ depot: "chef/cantine", lignes: [{ ticket: 12, priorite: 1 }, { ticket: 31, priorite: 2 }], client: c });
    assert.deepEqual(mise.fait, [31]);
    assert.equal(mise.refus[0]?.ticket, 12);
  });

  test("une liste qui n'en est pas, ou une priorité hors échelle : rien n'est posé", async () => {
    const { c, ecrits } = client();
    assert.equal((await mettreSurLeRail({ depot: "chef/cantine", lignes: "x", client: c })).fait.length, 0);
    const mise = await mettreSurLeRail({ depot: "chef/cantine", lignes: [{ ticket: 12, priorite: "high" }], client: c });
    assert.equal(mise.refus.length, 1);
    assert.equal(ecrits.length, 0);
  });
});
