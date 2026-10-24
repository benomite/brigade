// Les téléphones d'une station, côté process principal (#1598) : la station visée — ici, ou par sa machine —, la
// commande `phones …` que l'app y lance, ce qu'elle en lit, et ce qu'un échec dit à l'écran — en une ligne et son
// survol, sans jamais une commande, ni `ssh`, ni `sudo`.
import assert from "node:assert/strict";
import type { ExecFileException } from "node:child_process";
import { describe, test } from "node:test";
import type { Locale, Lu, Rendu } from "../src/box.ts";
import type { StationVue } from "../src/stations/stations.ts";
import { cibleDeLaStation, etatDuCode, refusDe, revoquerUnTelephone, telephonesAppaires, tirerUnCode, type Cible, type Refus } from "../src/telephones-de-station.ts";

const BOX: StationVue = { id: "g1", nom: "box", machine: "Debian 12", etat: "en-ligne", ligne: "online", pannes: [], dit: "online", version: "1.6.0", projets: ["parade", "cantine"], max: null };
const LOCALE: Locale = { node: "/usr/bin/node", runtime: "/opt/brigade/runtime", racine: "/home/chef/.config/brigade/station", env: {} };
const AILLEURS = { gist: "g9", locale: LOCALE };
const CIBLE: Cible = { lu: { nom: "parade", cuisine: { hote: "box" } } };

// Ce que la station rendrait : sa sortie, ou son code de sortie — `ssh` qui n'a pas joint (255), le geste qui refuse (68)…
const sortie = (texte: string): Rendu => ({ lance: "$ ssh -- box brigade parade phones code", erreur: null, sortie: texte, erreurs: "" });
const echec = (code: number | string | undefined, killed = false): Rendu => ({
  lance: "$ ssh -o BatchMode=yes -- box brigade parade phones code",
  erreur: Object.assign(new Error("Command failed"), { code, killed }) as ExecFileException,
  sortie: "",
  erreurs: "ssh: connect to host box port 22: Connection refused\nsudo: a password is required\n",
});
function lanceur(rendu: Rendu) {
  const lancees: { lu: Lu; commande: string }[] = [];
  return {
    lancees,
    lancer: (lu: Lu, commande: string) => {
      lancees.push({ lu, commande });
      return Promise.resolve(rendu);
    },
  };
}

// Rien de ce que l'écran montre — ni la ligne, ni son survol — ne dit une commande.
const COMMANDE = /\bssh\b|\bsudo\b|\$ |brigade [a-z]+ phones|--/i;
function sansCommande(refus: Refus) {
  assert.doesNotMatch(refus.refus, COMMANDE);
  assert.doesNotMatch(refus.detail, COMMANDE);
}

describe("la station visée", () => {
  test("une station d'ailleurs se joint par sa machine, au nom du premier projet qu'elle porte", () => {
    assert.deepEqual(cibleDeLaStation(BOX, AILLEURS), { lu: { nom: "parade", cuisine: { hote: "box" } } });
    assert.deepEqual(cibleDeLaStation({ ...BOX, nom: "atelier/claude" }, AILLEURS), { lu: { nom: "parade", cuisine: { hote: "atelier" } } });
  });

  test("la station de cet ordinateur se lance ici, sans ssh", () => {
    assert.deepEqual(cibleDeLaStation(BOX, { gist: "g1", locale: LOCALE }), { lu: { nom: "parade", cuisine: { locale: LOCALE } } });
  });

  test("un téléphone, une station sans projet, une station qui n'est plus là : rien ne part, une ligne dit pourquoi", () => {
    for (const station of [{ ...BOX, cuisine: false as const }, { ...BOX, projets: [] }, undefined, { ...BOX, nom: "pas une machine" }]) {
      const cible = cibleDeLaStation(station, AILLEURS);
      assert.ok("refus" in cible, JSON.stringify(station));
      sansCommande(cible);
    }
  });
});

describe("un code neuf", () => {
  test("`phones code` : le code, son échéance, et ce que le QR porte tel que la station l'a rendu", async () => {
    const qr = "brigade://pair?code=7KQ2-M9XD&url=https%3A%2F%2Fbox.tail1234.ts.net";
    const { lancer, lancees } = lanceur(sortie(JSON.stringify({ code: "7KQ2-M9XD", expiresAt: "2026-10-24T12:15:00.000Z", qr, url: "https://box.tail1234.ts.net" })));
    assert.deepEqual(await tirerUnCode(lancer, CIBLE, "box"), { tire: { code: "7KQ2-M9XD", expireLe: "2026-10-24T12:15:00.000Z", qr, adresse: "https://box.tail1234.ts.net" } });
    assert.deepEqual(lancees, [{ lu: { nom: "parade", cuisine: { hote: "box" } }, commande: "phones code" }]);
  });

  test("une station qui ne connaît aucune adresse : le QR ne porte que le code", async () => {
    const { lancer } = lanceur(sortie(JSON.stringify({ code: "7KQ2-M9XD", expiresAt: "2026-10-24T12:15:00.000Z", qr: "brigade://pair?code=7KQ2-M9XD", url: null })));
    const rendu = await tirerUnCode(lancer, CIBLE, "box");
    assert.ok("tire" in rendu);
    assert.equal(rendu.tire.adresse, null);
  });

  test("une sortie illisible n'est pas un code : elle se dit, sans rien de la sortie", async () => {
    for (const texte of ["", "not json", JSON.stringify({ code: "7KQ2-M9XD" }), JSON.stringify({ code: "7KQ2-M9XD", expiresAt: "demain", qr: "x" })]) {
      const rendu = await tirerUnCode(lanceur(sortie(texte)).lancer, CIBLE, "box");
      assert.ok("refus" in rendu, texte);
      assert.match(rendu.refus, /^box answered something this app cannot read/);
    }
  });

  test("sans cible, rien n'est lancé", async () => {
    const { lancer, lancees } = lanceur(sortie("{}"));
    const rendu = await tirerUnCode(lancer, { refus: "x", detail: "y" }, "box");
    assert.deepEqual(rendu, { refus: "x", detail: "y" });
    assert.deepEqual(lancees, []);
  });
});

describe("une station injoignable, ou qui refuse : une ligne à la place du code, jamais la commande ni sa sortie", () => {
  const cas: [string, Rendu, RegExp][] = [
    ["ssh n'a pas joint la machine", echec(255), /^box did not answer: it may be off, or offline\.$/],
    ["arrêté par le délai", echec(undefined, true), /^box did not answer/],
    ["ssh introuvable", echec("ENOENT"), /^box did not answer/],
    ["la station refuse cet ordinateur", echec(68), /^box refused: this computer is not allowed to manage its phones\.$/],
    ["la commande manque à la station", echec(127), /^box cannot pair phones yet: its version is too old\.$/],
    ["le projet n'y est plus", echec(65), /^box no longer carries the project/],
    ["un autre refus", echec(2), /^box refused the request\.$/],
  ];
  for (const [nom, rendu, attendu] of cas)
    test(nom, async () => {
      const refus = await tirerUnCode(lanceur(rendu).lancer, CIBLE, "box");
      assert.ok("refus" in refus);
      assert.match(refus.refus, attendu);
      assert.notEqual(refus.detail, "");
      sansCommande(refus);
    });

  test("ici, un code 255 n'est pas celui d'un ssh", () => {
    const erreur = Object.assign(new Error("x"), { code: 255 }) as ExecFileException;
    assert.match(refusDe("macbook", erreur, true).refus, /^macbook refused the request/);
    assert.match(refusDe("macbook", Object.assign(new Error("x"), { killed: true }) as ExecFileException, true).detail, /^This computer's station did not answer/);
  });
});

describe("où en est un code", () => {
  const statut = (status: string, phone: string | null = null) => sortie(JSON.stringify({ code: "7KQ2-M9XD", status, expiresAt: "2026-10-24T12:15:00.000Z", usedAt: null, phone }));

  test("valable, expiré ou servi — et le téléphone qu'il a appairé", async () => {
    assert.deepEqual(await etatDuCode(lanceur(statut("valid")).lancer, CIBLE, "box", "7KQ2-M9XD"), { etat: "valable", telephone: null });
    assert.deepEqual(await etatDuCode(lanceur(statut("expired")).lancer, CIBLE, "box", "7KQ2-M9XD"), { etat: "expire", telephone: null });
    assert.deepEqual(await etatDuCode(lanceur(statut("used", "pixel-8")).lancer, CIBLE, "box", "7KQ2-M9XD"), { etat: "utilise", telephone: "pixel-8" });
  });

  test("la commande porte le code, et rien d'autre que la forme d'un code ne part", async () => {
    const { lancer, lancees } = lanceur(statut("valid"));
    await etatDuCode(lancer, CIBLE, "box", "7KQ2-M9XD");
    assert.equal(lancees[0]?.commande, "phones status 7KQ2-M9XD");
    for (const mauvais of ["7KQ2-M9XD; reboot", "", 12, "--registry"]) assert.ok("refus" in (await etatDuCode(lancer, CIBLE, "box", mauvais)));
    assert.equal(lancees.length, 1);
  });

  test("un code que la station ne connaît plus ne vaut plus rien : il se dit expiré", async () => {
    assert.deepEqual(await etatDuCode(lanceur(echec(1)).lancer, CIBLE, "box", "7KQ2-M9XD"), { etat: "expire", telephone: null });
  });
});

describe("les téléphones appairés, et leur révocation", () => {
  test("`phones list` : chacun, son nom, sa machine et quand il a été appairé", async () => {
    const { lancer, lancees } = lanceur(sortie(JSON.stringify({ phones: [{ name: "pixel-8", machine: "Android 14 · Pixel 8", pairedAt: "2026-10-20T09:00:00.000Z" }] })));
    assert.deepEqual(await telephonesAppaires(lancer, CIBLE, "box"), { telephones: [{ nom: "pixel-8", machine: "Android 14 · Pixel 8", appaireLe: "2026-10-20T09:00:00.000Z" }] });
    assert.equal(lancees[0]?.commande, "phones list");
    assert.deepEqual(await telephonesAppaires(lanceur(sortie(JSON.stringify({ phones: [] }))).lancer, CIBLE, "box"), { telephones: [] });
  });

  test("une liste injoignable se dit comme le reste", async () => {
    const rendu = await telephonesAppaires(lanceur(echec(255)).lancer, CIBLE, "box");
    assert.ok("refus" in rendu);
    sansCommande(rendu);
  });

  test("`phones revoke <phone>` : le nom part en un seul mot, cité s'il le faut", async () => {
    const { lancer, lancees } = lanceur(sortie(""));
    assert.deepEqual(await revoquerUnTelephone(lancer, CIBLE, "box", "pixel-8"), { revoque: "pixel-8" });
    assert.deepEqual(await revoquerUnTelephone(lancer, CIBLE, "box", "le pixel"), { revoque: "le pixel" });
    assert.deepEqual(
      lancees.map(({ commande }) => commande),
      ["phones revoke pixel-8", "phones revoke 'le pixel'"],
    );
    for (const mauvais of ["", "--registry", 3]) assert.ok("refus" in (await revoquerUnTelephone(lancer, CIBLE, "box", mauvais)));
    assert.equal(lancees.length, 2);
  });

  test("un téléphone que la station ne connaît plus n'y est déjà plus appairé", async () => {
    const rendu = await revoquerUnTelephone(lanceur(echec(1)).lancer, CIBLE, "box", "pixel-8");
    assert.ok("refus" in rendu);
    assert.equal(rendu.refus, "pixel-8 is no longer paired with box.");
  });
});
