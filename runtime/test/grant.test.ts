// L'échéance du grant `merge` : ce que le journal en garde, ce qu'il vaut à une
// heure donnée, ce que le chef en tape et ce qu'il en lit. Tout se joue en
// processus, à l'heure qu'on lui donne.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { dureeEn as duree } from "../src/etat.ts";
import { bientotEteint, commanderGrant, direCompris, direGrant, direInstant, direInstantEn, gestesDuGrant, GrantRefuse, lireEcheance, type Commande } from "../src/grant.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDuGrant, pass, passDuTicket, usagesDuGrant } from "../src/projections/pass.ts";
import { sessions } from "../src/projections/sessions.ts";
import { sansMotFrancais } from "./helpers/glossary.ts";
import { horloge, photographier, repertoireTemporaire, JOUR_HORLOGE } from "./outils.ts";

const PR = "https://github.com/o/r/pull/40";
const a = (heure: string) => new Date(`${JOUR_HORLOGE}T${heure}.000Z`);
const iso = (heure: string) => a(heure).toISOString();

function histoire(t: TestContext) {
  const journal = ouvrirJournal(repertoireTemporaire(t), { maintenant: horloge(), projections: [pass, sessions] });
  t.after(() => journal.fermer());
  const noter = (fait: Fait, ticket: number | null = null, author = "chef") => journal.ajouter({ project: "brigade", ticket, author, ...fait });
  const vouloir = (ticket: number) => noter({ type: "grant.used", payload: { action: "merge", pr: PR, number: 40, sha: `sha-${ticket}`, base: "v2", verdict: 1 } }, ticket, "pass");
  const merger = (ticket: number, by: "pass" | "outside" = "pass") => noter({ type: "merge.done", payload: { pr: PR, sha: `sha-${ticket}`, by, reconciled: false } }, ticket, "pass");
  const refuser = (ticket: number) => noter({ type: "merge.failed", payload: { pr: PR, sha: `sha-${ticket}`, reason: "refusé" } }, ticket, "pass");
  // Un cook parti sur le ticket : sa livraison a une branche, que la pass peut lâcher.
  const cuisiner = (ticket: number) =>
    noter({ type: "cook.launched", payload: { run: `r${ticket}`, limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: `runs/r${ticket}.jsonl`, branch: `cook/${ticket}`, worktree: `worktrees/${ticket}` } }, ticket, "runtime");
  const grant = (heure = "10:30:00") => etatDuGrant(journal.base, "merge", a(heure));
  return { journal, base: journal.base, noter, cuisiner, vouloir, merger, refuser, grant };
}

describe("le grant au journal", () => {
  test("une échéance se lit en UTC écrit en lettres, la durée restante en tête ; `--until` dit ce qu'il a compris", () => {
    // `direInstant` reste en français : `attente.ts` et `pass.ts` l'appellent encore.
    assert.equal(direInstant("2026-10-12T19:20:36.681Z"), "12 oct. 19:20 UTC");
    assert.equal(direInstantEn("2026-10-12T19:20:36.681Z"), "12 Oct 19:20 UTC");
    assert.equal(direInstantEn("2026-01-05T04:07:00.000Z"), "5 Jan 04:07 UTC");
    assert.equal(direCompris("2026-10-12T19:20:36.681Z", new Date("2026-10-12T15:20:36.681Z"), duree), "understood: until 12 Oct 19:20 UTC — in 4 h 00");
  });

  test("accordé sans échéance, il se lit comme tel, et ne s'éteint pas", (t) => {
    const { base, noter, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge" } });

    assert.deepEqual(grant(), { action: "merge", active: true, since: iso("10:00:00"), by: "chef", until: null, usesLeft: null, reserved: 0, ended: null, cause: null, unrecorded: false });
    assert.equal(etatDuGrant(base, "merge", new Date("2036-01-01T00:00:00Z"))?.active ?? false, true);
  });

  test("accordé jusqu'à une heure, il vaut avant, et il est éteint dès qu'elle sonne — sans qu'aucun fait l'ait dit", (t) => {
    const { base, noter, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: iso("12:00:00") } });

    assert.deepEqual([grant("11:59:59")?.active, grant("11:59:59")?.until, grant("11:59:59")?.ended], [true, iso("12:00:00"), null]);
    // Éteint depuis son échéance, pas depuis l'heure où on le lit.
    assert.deepEqual(grant("12:00:00"), { action: "merge", active: false, since: iso("12:00:00"), by: "chef", until: iso("12:00:00"), usesLeft: null, reserved: 0, ended: "expired", cause: "until", unrecorded: true });
    assert.equal(etatDuGrant(base, "merge", a("15:00:00"))?.active ?? false, false);
  });

  test("l'extinction écrite est un fait à elle, daté de l'échéance : elle ne se lit pas comme une révocation", (t) => {
    const { noter, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: iso("12:00:00") } });
    noter({ type: "grant.expired", payload: { action: "merge", cause: "until", since: iso("12:00:00") } }, null, "pass");

    assert.deepEqual(grant("15:00:00"), { action: "merge", active: false, since: iso("12:00:00"), by: "chef", until: iso("12:00:00"), usesLeft: null, reserved: 0, ended: "expired", cause: "until", unrecorded: false });

    noter({ type: "grant.activated", payload: { action: "merge" } });
    noter({ type: "grant.revoked", payload: { action: "merge" } });
    assert.deepEqual([grant("15:00:00")?.ended, grant("15:00:00")?.cause, grant("15:00:00")?.until], ["revoked", null, null]);
  });

  test("à N usages, il décompte sur le merge fait, pas sur l'intention : un merge que GitHub refuse ne consomme rien", (t) => {
    const { noter, vouloir, merger, refuser, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", uses: 2 } });
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 0]);

    // L'intention réserve un usage, sans le consommer.
    vouloir(17);
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 1]);
    refuser(17);
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 0]);

    vouloir(17);
    merger(17);
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved, grant()?.active], [1, 0, true]);
  });

  test("un merge que la pass n'a pas voulu ne consomme rien ; celui qu'elle a voulu consomme, quel que soit le nom que GitHub donne à son auteur", (t) => {
    const { noter, cuisiner, vouloir, merger, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", uses: 3 } });

    // Le chef merge à la main une livraison arrêtée : aucune intention, aucun usage.
    merger(18, "outside");
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [3, 0]);

    // La réponse de GitHub s'est perdue, le merge a eu lieu : constaté sans identité propre, il se lit « outside ».
    vouloir(17);
    merger(17, "outside");
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 0]);

    // Un ticket parti, sa PR trouvée mergée : la livraison lâchée le dit, l'intention est consommée — une fois.
    cuisiner(19);
    vouloir(19);
    noter({ type: "ticket.left", payload: { reason: "closed" } }, 19, "github");
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 1]);
    noter({ type: "pass.abandoned", payload: { branch: "cook/19", pr: null, merged: true } }, 19, "pass");
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [1, 0]);
    vouloir(20);
    merger(20);
    noter({ type: "pass.abandoned", payload: { branch: "cook/20", pr: null, merged: true } }, 20, "pass");
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved, grant()?.cause], [0, 0, "uses"]);
  });

  test("une intention dont le ticket part ne retient pas son usage sans fin : lâchée non mergée, elle le rend, et le grant sert encore", (t) => {
    const { base, noter, cuisiner, vouloir, merger, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", uses: 2 } });

    // GitHub n'a pas répondu au merge du 17, et son issue est fermée avant la réconciliation.
    cuisiner(17);
    vouloir(17);
    noter({ type: "ticket.left", payload: { reason: "closed" } }, 17, "github");
    // Tant que la pass n'a pas relu GitHub, l'usage reste retenu.
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 1]);
    noter({ type: "pass.abandoned", payload: { branch: "cook/17", pr: PR } }, 17, "pass");
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 0]);
    assert.deepEqual(usagesDuGrant(base, 10).map((u) => u.outcome), ["failed"]);

    // Les deux usages servent : le second merge éteint le grant, rien ne reste muet.
    vouloir(18);
    merger(18);
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved, grant()?.active], [1, 0, true]);
    vouloir(19);
    merger(19);
    assert.deepEqual([grant()?.usesLeft, grant()?.ended], [0, "expired"]);

    // Parti sans rien que la pass ait à lâcher : l'intention est rendue au départ même.
    noter({ type: "grant.activated", payload: { action: "merge", uses: 1 } });
    vouloir(21);
    noter({ type: "ticket.left", payload: { reason: "closed" } }, 21, "github");
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [1, 0]);
  });

  test("une intention d'avant le grant en cours ne lui prend ni réservation ni usage", (t) => {
    const { noter, vouloir, merger, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge" } });
    vouloir(17);
    noter({ type: "grant.revoked", payload: { action: "merge" } });
    noter({ type: "grant.activated", payload: { action: "merge", uses: 1 } });
    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [1, 0]);

    merger(17);

    assert.deepEqual([grant()?.usesLeft, grant()?.active], [1, true]);
  });

  test("le dernier usage consommé, il est éteint — pour qui le lit, avant même le fait", (t) => {
    const { noter, vouloir, merger, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", uses: 1 } });
    vouloir(17);
    merger(17);

    assert.deepEqual([grant()?.active, grant()?.ended, grant()?.cause, grant()?.usesLeft, grant()?.unrecorded], [false, "expired", "uses", 0, true]);

    noter({ type: "grant.expired", payload: { action: "merge", cause: "uses", since: iso("10:00:02") } }, null, "pass");
    assert.deepEqual([grant()?.active, grant()?.cause, grant()?.since, grant()?.unrecorded], [false, "uses", iso("10:00:02"), false]);
  });

  test("prolongé, il garde depuis quand il vaut : l'échéance recule, les usages s'ajoutent, ou la limite est levée", (t) => {
    const { noter, vouloir, merger, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: iso("12:00:00"), uses: 2 } });
    vouloir(17);
    merger(17);

    noter({ type: "grant.extended", payload: { action: "merge", until: iso("18:00:00") } });
    assert.deepEqual([grant("13:00:00")?.active, grant("13:00:00")?.until, grant("13:00:00")?.usesLeft, grant("13:00:00")?.since], [true, iso("18:00:00"), 1, iso("10:00:00")]);

    noter({ type: "grant.extended", payload: { action: "merge", uses: 5 } });
    assert.deepEqual([grant("13:00:00")?.until, grant("13:00:00")?.usesLeft], [iso("18:00:00"), 6]);

    noter({ type: "grant.extended", payload: { action: "merge", until: null, uses: null } });
    assert.deepEqual([grant("23:00:00")?.active, grant("23:00:00")?.until, grant("23:00:00")?.usesLeft], [true, null, null]);
  });

  test("une prolongation ne réveille pas un grant éteint ou révoqué", (t) => {
    const { noter, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: iso("12:00:00") } });
    noter({ type: "grant.expired", payload: { action: "merge", cause: "until", since: iso("12:00:00") } }, null, "pass");

    noter({ type: "grant.extended", payload: { action: "merge", until: iso("18:00:00") } });

    assert.deepEqual([grant("13:00:00")?.active, grant("13:00:00")?.ended], [false, "expired"]);
  });

  test("une échéance qui ne se lit pas ne fait pas un grant sans fin : il ne vaut rien", (t) => {
    const { noter, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: "vendredi", uses: -3 } as never });

    assert.equal(grant()?.active, false);
  });

  test("un journal d'avant l'échéance se rejoue : son grant est sans échéance, ses vieux merges ne décomptent rien", (t) => {
    const { journal, noter, vouloir, merger, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge" } });
    vouloir(17);
    merger(17);
    noter({ type: "grant.extended", payload: { action: "merge", uses: 3 } });
    const avant = photographier(journal, [pass]);

    journal.reconstruire();

    assert.deepEqual(photographier(journal, [pass]), avant);
    assert.deepEqual([grant()?.active, grant()?.until, grant()?.usesLeft], [true, null, null]);
  });

  test("une livraison arrêtée après l'extinction garde l'instant où le grant s'est éteint", (t) => {
    const { base, noter } = histoire(t);
    noter({ type: "cook.launched", payload: { run: "a", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/a.jsonl", branch: "cook/a", worktree: "worktrees/a" } }, 17, "runtime");
    noter({ type: "pass.held", payload: { reason: "no-grant", expired: iso("12:00:00") } }, 17, "pass");
    assert.deepEqual([passDuTicket(base, 17)?.reason, passDuTicket(base, 17)?.grantExpired], ["no-grant", iso("12:00:00")]);

    noter({ type: "pass.held", payload: { reason: "no-grant" } }, 17, "pass");
    assert.equal(passDuTicket(base, 17)?.grantExpired, null);
  });
});

describe("l'échéance que le chef tape", () => {
  // Midi et demi, à l'heure de la machine : ce que le chef lit à sa montre.
  const midi = new Date(2026, 9, 8, 12, 30, 0);
  const local = (...champs: [number, number, number, number, number, number?]) => new Date(...champs).toISOString();
  const lue = (...args: string[]) => lireEcheance(args, midi);
  const refus = (...args: string[]) => {
    try {
      lue(...args);
    } catch (erreur) {
      if (erreur instanceof GrantRefuse) return erreur.message;
      throw erreur;
    }
    return null;
  };

  test("sans option, il n'y a pas d'échéance", () => {
    assert.deepEqual(lue(), { sansEcheance: false });
  });

  test("jusqu'à une heure d'aujourd'hui, une date et une heure, ou une date seule — la fin de cette journée, à l'heure de la machine", () => {
    assert.equal(lue("--until", "18h").until, local(2026, 9, 8, 18, 0));
    assert.equal(lue("--until", "18h30").until, local(2026, 9, 8, 18, 30));
    assert.equal(lue("--until", "18:30").until, local(2026, 9, 8, 18, 30));
    assert.equal(lue("--until", "2026-10-12T09:15").until, local(2026, 9, 12, 9, 15));
    assert.equal(lue("--until", "2026-10-12").until, local(2026, 9, 12, 23, 59, 59));
    // Aujourd'hui, date seule : jusqu'à ce soir.
    assert.equal(lue("--until", "2026-10-08").until, local(2026, 9, 8, 23, 59, 59));
  });

  test("une heure déjà passée aujourd'hui est refusée, pas reportée à demain ; une date passée aussi", () => {
    assert.match(refus("--until", "9h") ?? "", /9h has already passed today — for tomorrow, give the date/);
    assert.match(refus("--until", "12:30") ?? "", /has already passed today/);
    assert.match(refus("--until", "2026-10-07") ?? "", /2026-10-07 has already passed$/);
  });

  test("pour une durée, comptée à partir de maintenant", () => {
    const dans = (ms: number) => new Date(midi.getTime() + ms).toISOString();
    assert.equal(lue("--for", "30min").until, dans(30 * 60_000));
    assert.equal(lue("--for", "4h").until, dans(4 * 3_600_000));
    assert.equal(lue("--for", "1h30").until, dans(90 * 60_000));
    assert.equal(lue("--for", "2d").until, dans(48 * 3_600_000));
    // L'ancien mot répond encore.
    assert.equal(lue("--for", "2j").until, dans(48 * 3_600_000));
  });

  test("pour un nombre d'usages, seul ou avec une date : les deux se donnent ensemble", () => {
    assert.deepEqual(lue("--uses", "10"), { sansEcheance: false, uses: 10 });
    assert.deepEqual(lue("--uses", "3", "--until", "18h"), { sansEcheance: false, uses: 3, until: local(2026, 9, 8, 18, 0) });
  });

  test("ce qui ne se lit pas est refusé en disant ce qui est attendu, jamais deviné", () => {
    for (const [args, attendu] of [
      [["--until", "vendredi"], /“vendredi” cannot be read — expected a date/],
      [["--until", "2026-02-31"], /cannot be read/],
      [["--until", "25h"], /cannot be read/],
      [["--for", "longtemps"], /“longtemps” cannot be read — expected a duration/],
      [["--for", "0h"], /cannot be read/],
      [["--uses", "0"], /expected a number of merges, 1 at least/],
      [["--uses", "2.5"], /cannot be read/],
      [["--uses"], /--uses needs a value/],
      [["--toujours"], /unknown option: --toujours/],
      [["--for", "2h", "--until", "18h"], /one or the other/],
      [["--for", "2h", "--for", "3h"], /--for is given twice/],
      [["--no-expiry", "--uses", "3"], /does not combine with any deadline/],
      // Une durée démesurée est un refus, pas une pile.
      [["--for", "99999999999d"], /goes beyond what a date can express/],
      [["--for", "99999999999j"], /goes beyond what a date can express/],
      [["--for", "99999999999999999999h"], /goes beyond what a date can express/],
    ] as Array<[string[], RegExp]>) {
      assert.match(refus(...args) ?? "", attendu, args.join(" "));
      sansMotFrancais([refus(...args) ?? ""]);
    }
  });

  test("les refus d'une échéance ne portent aucun mot français du glossaire", () => {
    sansMotFrancais(["--until", "--for", "--uses"].flatMap((option) => [refus(option, "vendredi"), refus(option)].filter((m): m is string => m !== null)));
  });
});

describe("les gestes du chef sur le grant", () => {
  const T0 = a("10:00:00");
  function chef(t: TestContext) {
    const lieu = histoire(t);
    // Le journal n'est pas vide : un runtime y a démarré.
    lieu.noter({ type: "cook.launched", payload: { run: "z", limits: { turns: 1, durationMs: 1, tokens: 1, idleMs: 1 }, stream: "runs/z.jsonl", branch: "cook/z", worktree: "worktrees/z" } }, 99, "runtime");
    const commander = (commande: Commande, heure: Date, ...args: string[]) => commanderGrant(lieu.journal, commande, "merge", lireEcheance(args, heure), heure, duree);
    const refus = (commande: Commande, heure: Date, ...args: string[]) => {
      try {
        commander(commande, heure, ...args);
      } catch (erreur) {
        if (erreur instanceof GrantRefuse) return erreur.message;
        throw erreur;
      }
      return null;
    };
    const faits = () => lieu.journal.tout().filter((e) => e.type.startsWith("grant.")).map((e) => [e.type, e.author, e.payload]);
    const lu = (heure: Date) => direGrant(etatDuGrant(lieu.base, "merge", heure), heure, duree);
    return { ...lieu, commander, refus, faits, lu };
  }
  const dans = (heures: number, depuis = T0) => new Date(depuis.getTime() + heures * 3_600_000);

  test("accordé sans échéance, il se lit « no deadline » ; accordé pour une durée et un nombre d'usages, il dit ce qu'il reste", (t) => {
    const { commander, faits, lu, noter } = chef(t);
    assert.match(commander("enable", T0), /grant merge active, no deadline: every green pass from now on is merged[\s\S]*It holds until you revoke it/);
    assert.match(lu(dans(30)), /^ACTIVE since \S+ \(by chef\) — no deadline: a green pass is merged without you$/);
    noter({ type: "grant.revoked", payload: { action: "merge" } });

    const dit = commander("enable", T0, "--for", "4h", "--uses", "10");

    assert.match(dit, new RegExp(`grant merge active, 4 h 00 left \\(until ${direInstantEn(dans(4).toISOString())}\\) · for 10 uses: [\\s\\S]*It will lapse on its own`));
    assert.deepEqual(faits().at(-1), ["grant.activated", "chef", { action: "merge", until: dans(4).toISOString(), uses: 10 }]);
    assert.match(lu(dans(1)), new RegExp(`ACTIVE since \\S+ \\(by chef\\) — 3 h 00 left \\(until ${direInstantEn(dans(4).toISOString())}\\) · 10 uses left: a green pass`));
  });

  test("activer un grant déjà actif n'écrit rien, dit ce qu'il en reste et renvoie à `extend`", (t) => {
    const { commander, faits } = chef(t);
    commander("enable", T0, "--for", "4h");

    const dit = commander("enable", dans(1), "--for", "8h");

    assert.match(dit, /grant merge already active since \S+ — 3 h 00 left \(until 8 Oct 14:00 UTC\)\. Nothing is written: to change its deadline, `extend merge`/);
    assert.equal(faits().length, 1);
  });

  test("le chef prolonge un grant en cours sans le révoquer : un fait de plus, que l'histoire garde", (t) => {
    const { journal, commander, faits, lu } = chef(t);
    commander("enable", T0, "--for", "4h", "--uses", "2");

    // Deux heures à partir de maintenant, pas ajoutées à l'ancienne échéance.
    assert.match(commander("extend", dans(3), "--for", "2h"), new RegExp(`grant merge extended: 2 h 00 left \\(until ${direInstantEn(dans(5).toISOString())}\\) · 2 uses left`));
    assert.match(commander("extend", dans(3), "--uses", "5"), /extended: 2 h 00 left \(until \d+ \S+ \d\d:\d\d UTC\) · 7 uses left/);

    assert.deepEqual(faits(), [
      ["grant.activated", "chef", { action: "merge", until: dans(4).toISOString(), uses: 2 }],
      ["grant.extended", "chef", { action: "merge", until: dans(5).toISOString() }],
      ["grant.extended", "chef", { action: "merge", uses: 5 }],
    ]);
    assert.match(lu(dans(4.5)), /ACTIVE since \S+T10:00:\S+ \(by chef\) — EXPIRING SOON — 30 min left \(until \d+ \S+ \d\d:\d\d UTC\) · 7 uses left/);
    const gestes = gestesDuGrant(journal);
    assert.equal(gestes.length, 3);
    assert.match(gestes[0] ?? "", /merge  extended: 5 uses more  \(chef\)$/);
    assert.match(gestes[1] ?? "", new RegExp(`merge  extended: until ${direInstantEn(dans(5).toISOString())}  \\(chef\\)$`));
    assert.match(gestes[2] ?? "", new RegExp(`merge  enabled until ${direInstantEn(dans(4).toISOString())} · for 2 uses  \\(chef\\)$`));
  });

  test("prolonger ne raccourcit pas : une date plus proche, ou une limite posée là où il n'y en avait pas, est refusée sans rien écrire", (t) => {
    const { commander, refus, faits, noter } = chef(t);
    commander("enable", T0, "--for", "4h");
    assert.match(refus("extend", dans(1), "--for", "1h") ?? "", /already holds until \d+ \S+ \d\d:\d\d UTC: \d+ \S+ \d\d:\d\d UTC does not extend it — to shorten it, revoke it then enable it again/);
    assert.match(refus("extend", dans(1), "--uses", "3") ?? "", /does not count its uses/);
    assert.match(refus("extend", dans(1)) ?? "", /extend by how much\?/);
    noter({ type: "grant.revoked", payload: { action: "merge" } });
    commander("enable", T0, "--uses", "3");
    assert.match(refus("extend", dans(1), "--for", "1h") ?? "", /has no dated deadline/);

    assert.deepEqual(faits().map(([type]) => type), ["grant.activated", "grant.revoked", "grant.activated"]);
  });

  test("l'échéance se lève explicitement, et le journal le dit", (t) => {
    const { journal, commander, faits, lu } = chef(t);
    commander("enable", T0, "--for", "4h", "--uses", "2");

    assert.match(commander("extend", dans(1), "--no-expiry"), /extended: its deadline is lifted/);

    assert.deepEqual(faits().at(-1), ["grant.extended", "chef", { action: "merge", until: null, uses: null }]);
    assert.match(lu(dans(400)), /ACTIVE since \S+ \(by chef\) — no deadline/);
    assert.match(gestesDuGrant(journal)[0] ?? "", /extended: deadline lifted/);
    assert.match(commander("extend", dans(2), "--no-expiry"), /already has no deadline: nothing is written/);
  });

  test("éteint seul, il se lit ainsi avant même que le runtime l'écrive — et ne se prolonge pas : il se réaccorde, l'extinction d'abord écrite", (t) => {
    const { journal, commander, refus, faits, lu } = chef(t);
    commander("enable", T0, "--for", "4h");

    assert.match(lu(dans(6)), new RegExp(`^LAPSED since ${dans(4).toISOString()} — its deadline has passed \\(enabled by chef\\): the pass stops at the open PR \\(the runtime will write it to the log on its next pass\\)$`));
    assert.equal(faits().length, 1);

    assert.match(refus("extend", dans(6), "--for", "2h") ?? "", /nothing to extend: the merge grant is not active — it lapsed on \S+ \(its deadline has passed\) — to enable it again, `enable merge`/);
    assert.match(commander("revoke", dans(6)), /nothing to revoke: the merge grant is not active — it lapsed on/);
    commander("enable", dans(6), "--for", "1h");

    // Le geste du chef ne recouvre pas l'extinction : elle est au journal, à sa date, et pas en son nom.
    assert.deepEqual(faits(), [
      ["grant.activated", "chef", { action: "merge", until: dans(4).toISOString() }],
      ["grant.expired", "runtime", { action: "merge", cause: "until", since: dans(4).toISOString() }],
      ["grant.activated", "chef", { action: "merge", until: dans(7).toISOString() }],
    ]);
    assert.match(gestesDuGrant(journal)[1] ?? "", new RegExp(`lapsed: its deadline has passed \\(since ${dans(4).toISOString()}\\)  \\(runtime\\)$`));
    assert.doesNotMatch(lu(dans(6)), /the runtime will write it/);
  });

  test("le dernier usage se lit comme bientôt éteint, un merge en vol comme un usage retenu", (t) => {
    const { base, commander, lu, vouloir } = chef(t);
    commander("enable", T0, "--uses", "2");
    assert.equal(bientotEteint(etatDuGrant(base, "merge", T0)!, T0), false);

    vouloir(17);
    assert.match(lu(T0), /2 uses left, of which 1 held by a merge under way/);
    commander("revoke", T0);
    commander("enable", T0, "--uses", "1");

    assert.match(lu(T0), /EXPIRING SOON — 1 use left: /);
  });

  test("ce que `extend` seul sait faire est refusé ailleurs, et un journal vide ne reçoit aucun grant", (t) => {
    const { commander, refus } = chef(t);
    assert.match(refus("enable", T0, "--no-expiry") ?? "", /--no-expiry only applies to `extend`/);
    commander("enable", T0);
    assert.match(refus("revoke", T0, "--for", "2h") ?? "", /`revoke` takes no deadline/);

    const vide = histoire(t);
    assert.throws(() => commanderGrant(vide.journal, "enable", "merge", { sansEcheance: false }, T0, duree), /the log is empty/);
  });
});
