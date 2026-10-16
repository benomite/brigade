// Les tickets ordinaires d'une station distante : ce que la box tient du bac à
// sable de son poste, d'après ce qu'elle en dit ; la commande de son cook ; ce
// que la sonde du poste rend. Sans E/S, sauf la sonde, jouée sur une machine
// simulée.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NON_DIT, configurerLeCook, constater, dansLeBacASable, direOrdinaires, pourLaBox, prendLesOrdinaires } from "../../src/bac-a-sable/ordinaires.ts";
import { argumentsDuBacASable } from "../../src/bac-a-sable/configuration.ts";
import { SEATBELT, type Sondes } from "../../src/bac-a-sable/detection.ts";
import { principal as sonder } from "../../src/bac-a-sable/sonder.ts";
import { argumentsClaude } from "../../src/claude.ts";
import { reglesDuProjet } from "../../src/reseau.ts";
import { appeler } from "../outils.ts";

const HOTES = reglesDuProjet(["registry.npmjs.org"]);
const DIT = { available: true, version: "2.1.250", home: "/Users/chef", worktrees: "/Users/chef/brigade-cooks/brigade", caches: ["/Users/chef/Library/Caches/brigade"] };

test("disponible, le poste est retenu tel qu'il le dit — de quoi configurer le bac à sable de chacun de ses cooks", () => {
  const constat = constater(DIT, HOTES);
  assert.deepEqual(constat, { disponible: true, poste: { version: "2.1.250", home: DIT.home, worktrees: DIT.worktrees, caches: DIT.caches } });
  const config = configurerLeCook(constat.disponible ? constat.poste : (null as never), "851-abcd", HOTES);
  assert.deepEqual(config.reglages.sandbox.filesystem.allowWrite, ["/Users/chef/brigade-cooks/brigade/851-abcd", "/Users/chef/Library/Caches/brigade"]);
});

test("indisponible, ce que la station en dit est la raison — et une station qui n'en dit rien ne l'a pas", () => {
  assert.deepEqual(constater({ available: false, reason: "  Seatbelt est introuvable  " }, HOTES), { disponible: false, raison: "Seatbelt est introuvable" });
  assert.deepEqual(constater({ available: false }, HOTES), { disponible: false, raison: "la station le dit indisponible, sans dire pourquoi" });
  assert.deepEqual(constater(undefined, HOTES), { disponible: false, raison: NON_DIT });
  const longue = constater({ available: false, reason: "x".repeat(1000) }, HOTES);
  assert.equal(!longue.disponible && longue.raison.length, 300);
});

test("ce qui ne se lit pas n'est pas un bac à sable : version absente, chemin relatif, caches qui ne sont pas une liste", () => {
  for (const dit of [{ ...DIT, version: "" }, { ...DIT, home: "Users/chef" }, { ...DIT, worktrees: "~/cooks" }, { ...DIT, caches: "/Users/chef/cache" }, { ...DIT, caches: ["cache"] }, { ...DIT, available: "oui" }, "disponible"]) {
    const constat = constater(dit, HOTES);
    assert.equal(constat.disponible, false, JSON.stringify(dit));
    assert.match(!constat.disponible ? constat.raison : "", /ne se lit pas/);
  }
});

test("un poste dont la configuration ne tient pas est indisponible, et la raison dit pourquoi : ses worktrees là où un cook ne lit rien, un cache au-dessus du compte", () => {
  for (const [dit, motif] of [
    [{ ...DIT, worktrees: "/Users/chef/.config/brigade/stations/brigade" }, /\.config\/brigade/],
    [{ ...DIT, caches: ["/Users"] }, /ni à la racine du compte/],
    [{ ...DIT, worktrees: "/Users/chef/.ssh/cooks" }, /\.ssh/],
  ] as const) {
    const constat = constater(dit, HOTES);
    assert.equal(constat.disponible, false);
    assert.match(!constat.disponible ? constat.raison : "", /^la configuration du bac à sable ne tient pas sur ce poste — /);
    assert.match(!constat.disponible ? constat.raison : "", motif);
  }
});

test("la commande d'un cook dans le bac à sable : celle d'un cook de la box, dont le mode de permission cède la place à celui du bac à sable et à ses réglages", () => {
  const args = argumentsClaude("la consigne", { model: "sonnet", effort: "low" });
  const constat = constater(DIT, HOTES);
  const config = configurerLeCook(constat.disponible ? constat.poste : (null as never), "run", HOTES);
  const dedans = dansLeBacASable(args, config);
  const place = args.indexOf("--permission-mode");
  assert.deepEqual(dedans, [...args.slice(0, place), ...argumentsDuBacASable(config), ...args.slice(place + 2)]);
  assert.ok(!dedans.includes("bypassPermissions"));
  assert.throws(() => dansLeBacASable(["-p", "x"], config), /sans `--permission-mode`/);
});

test("une station d'ici prend toujours les tickets ordinaires ; une distante, seulement réglée pour et son bac à sable là", () => {
  assert.equal(prendLesOrdinaires({}, null), true);
  assert.equal(prendLesOrdinaires({ distante: false }, null), true);
  assert.equal(prendLesOrdinaires({ distante: true }, { available: true }), false);
  assert.equal(prendLesOrdinaires({ distante: true, ordinaires: true }, null), false);
  assert.equal(prendLesOrdinaires({ distante: true, ordinaires: true }, { available: false }), false);
  assert.equal(prendLesOrdinaires({ distante: true, ordinaires: true }, { available: true }), true);
});

test("ce que le chef lit des tickets ordinaires d'une station distante : non réglée, rien dit, indisponible avec sa raison, pris", () => {
  assert.match(direOrdinaires({ ordinary: false, sandbox: null }), /^non pris/);
  assert.match(direOrdinaires({ ordinary: true, sandbox: null }), /n'en a encore rien dit/);
  assert.equal(direOrdinaires({ ordinary: true, sandbox: { available: false, reason: "Seatbelt est introuvable", version: null, at: "2026-10-16T10:00:00.000Z" } }), "AUCUN PRIS — bac à sable indisponible depuis le 2026-10-16T10:00:00.000Z : Seatbelt est introuvable");
  assert.match(direOrdinaires({ ordinary: true, sandbox: { available: true, reason: null, version: "2.1.250", at: "2026-10-16T10:00:00.000Z" } }), /^pris, chaque cook dans le bac à sable de Claude Code \(claude 2\.1\.250\)/);
});

const MAC: Sondes = { plateforme: "darwin", existe: (chemin) => chemin === SEATBELT, versionDeClaude: () => "2.1.300 (Claude Code)\n" };

test("la sonde du poste rend, sur une ligne, ce que la station passe à la box : disponible avec la version et les lieux, ou indisponible avec la raison", async () => {
  const dispo = appeler((appel) => sonder(appel, MAC, "/Users/chef"), ["/Users/chef/cooks/brigade", "/Users/chef/Library/Caches/brigade"]);
  assert.equal(await dispo.fin, 0);
  assert.equal(dispo.sortie(), `${JSON.stringify({ available: true, version: "2.1.300", home: "/Users/chef", worktrees: "/Users/chef/cooks/brigade", caches: ["/Users/chef/Library/Caches/brigade"] })}\n`);
  assert.deepEqual(JSON.parse(dispo.sortie()), pourLaBox({ disponible: true, version: "2.1.300" }, { home: "/Users/chef", worktrees: "/Users/chef/cooks/brigade", caches: ["/Users/chef/Library/Caches/brigade"] }));
  // Ce qu'elle rend, la box le retient tel quel.
  assert.equal(constater(JSON.parse(dispo.sortie()), HOTES).disponible, true);

  const linux = appeler((appel) => sonder(appel, { ...MAC, plateforme: "linux" }, "/home/chef"), ["/home/chef/cooks"]);
  assert.equal(await linux.fin, 0);
  const dit = JSON.parse(linux.sortie());
  assert.equal(dit.available, false);
  assert.match(dit.reason, /macOS.*linux/);
});

test("la sonde mal appelée le dit, code 2 : sans lieu, ou un lieu relatif", async () => {
  for (const args of [[], ["cooks"], ["/Users/chef/cooks", "cache"]]) {
    const appel = appeler((a) => sonder(a, MAC, "/Users/chef"), args);
    assert.equal(await appel.fin, 2);
    assert.match(appel.sortie(), /^brigade : usage : node runtime\/src\/bac-a-sable\/sonder\.ts <worktrees>/);
  }
});
