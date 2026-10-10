// L'échéance du grant `merge` : ce que le journal en garde, ce qu'il vaut à une
// heure donnée, ce que le chef en tape et ce qu'il en lit. Tout se joue en
// processus, à l'heure qu'on lui donne.
import assert from "node:assert/strict";
import { describe, test, type TestContext } from "node:test";
import type { Fait } from "../src/evenements.ts";
import { duree } from "../src/etat.ts";
import { bientotEteint, commanderGrant, direGrant, gestesDuGrant, GrantRefuse, lireEcheance, type Commande } from "../src/grant.ts";
import { ouvrirJournal } from "../src/journal.ts";
import { etatDuGrant, grantActif, pass, passDuTicket } from "../src/projections/pass.ts";
import { sessions } from "../src/projections/sessions.ts";
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
  const grant = (heure = "10:30:00") => etatDuGrant(journal.base, "merge", a(heure));
  return { journal, base: journal.base, noter, vouloir, merger, refuser, grant };
}

describe("le grant au journal", () => {
  test("accordé sans échéance, il se lit comme tel, et ne s'éteint pas", (t) => {
    const { base, noter, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge" } });

    assert.deepEqual(grant(), { action: "merge", active: true, since: iso("10:00:00"), by: "chef", until: null, usesLeft: null, reserved: 0, ended: null, cause: null, unrecorded: false });
    assert.equal(grantActif(base, "merge", new Date("2036-01-01T00:00:00Z")), true);
  });

  test("accordé jusqu'à une heure, il vaut avant, et il est éteint dès qu'elle sonne — sans qu'aucun fait l'ait dit", (t) => {
    const { base, noter, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", until: iso("12:00:00") } });

    assert.deepEqual([grant("11:59:59")?.active, grant("11:59:59")?.until, grant("11:59:59")?.ended], [true, iso("12:00:00"), null]);
    // Éteint depuis son échéance, pas depuis l'heure où on le lit.
    assert.deepEqual(grant("12:00:00"), { action: "merge", active: false, since: iso("12:00:00"), by: "chef", until: iso("12:00:00"), usesLeft: null, reserved: 0, ended: "expired", cause: "until", unrecorded: true });
    assert.equal(grantActif(base, "merge", a("15:00:00")), false);
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

  test("un merge fait à la main ne consomme rien, même sur une intention restée en vol", (t) => {
    const { noter, vouloir, merger, grant } = histoire(t);
    noter({ type: "grant.activated", payload: { action: "merge", uses: 2 } });

    merger(18, "outside");
    vouloir(17);
    merger(17, "outside");

    assert.deepEqual([grant()?.usesLeft, grant()?.reserved], [2, 0]);
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
    assert.equal(lue("--jusqu-a", "18h").until, local(2026, 9, 8, 18, 0));
    assert.equal(lue("--jusqu-a", "18h30").until, local(2026, 9, 8, 18, 30));
    assert.equal(lue("--jusqu-a", "18:30").until, local(2026, 9, 8, 18, 30));
    assert.equal(lue("--jusqu-a", "2026-10-12T09:15").until, local(2026, 9, 12, 9, 15));
    assert.equal(lue("--jusqu-a", "2026-10-12").until, local(2026, 9, 12, 23, 59, 59));
    // Aujourd'hui, date seule : jusqu'à ce soir.
    assert.equal(lue("--jusqu-a", "2026-10-08").until, local(2026, 9, 8, 23, 59, 59));
  });

  test("une heure déjà passée aujourd'hui est refusée, pas reportée à demain ; une date passée aussi", () => {
    assert.match(refus("--jusqu-a", "9h") ?? "", /9h est déjà passé aujourd'hui — pour demain, dis la date/);
    assert.match(refus("--jusqu-a", "12:30") ?? "", /déjà passé aujourd'hui/);
    assert.match(refus("--jusqu-a", "2026-10-07") ?? "", /2026-10-07 est déjà passé$/);
  });

  test("pour une durée, comptée à partir de maintenant", () => {
    const dans = (ms: number) => new Date(midi.getTime() + ms).toISOString();
    assert.equal(lue("--pour", "30min").until, dans(30 * 60_000));
    assert.equal(lue("--pour", "4h").until, dans(4 * 3_600_000));
    assert.equal(lue("--pour", "1h30").until, dans(90 * 60_000));
    assert.equal(lue("--pour", "2j").until, dans(48 * 3_600_000));
  });

  test("pour un nombre d'usages, seul ou avec une date : les deux se donnent ensemble", () => {
    assert.deepEqual(lue("--usages", "10"), { sansEcheance: false, uses: 10 });
    assert.deepEqual(lue("--usages", "3", "--jusqu-a", "18h"), { sansEcheance: false, uses: 3, until: local(2026, 9, 8, 18, 0) });
  });

  test("ce qui ne se lit pas est refusé en disant ce qui est attendu, jamais deviné", () => {
    for (const [args, attendu] of [
      [["--jusqu-a", "vendredi"], /« vendredi » ne se lit pas — attendu une date/],
      [["--jusqu-a", "2026-02-31"], /ne se lit pas/],
      [["--jusqu-a", "25h"], /ne se lit pas/],
      [["--pour", "longtemps"], /« longtemps » ne se lit pas — attendu une durée/],
      [["--pour", "0h"], /ne se lit pas/],
      [["--usages", "0"], /attendu un nombre de merges, 1 au moins/],
      [["--usages", "2.5"], /ne se lit pas/],
      [["--usages"], /--usages attend une valeur/],
      [["--toujours"], /option inconnue : --toujours/],
      [["--pour", "2h", "--jusqu-a", "18h"], /l'un ou l'autre/],
      [["--pour", "2h", "--pour", "3h"], /--pour est donné deux fois/],
      [["--sans-echeance", "--usages", "3"], /ne se combine avec aucune échéance/],
    ] as Array<[string[], RegExp]>) {
      assert.match(refus(...args) ?? "", attendu, args.join(" "));
    }
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

  test("accordé sans échéance, il se lit « sans échéance » ; accordé pour une durée et un nombre d'usages, il dit ce qu'il reste", (t) => {
    const { commander, faits, lu, noter } = chef(t);
    assert.match(commander("activer", T0), /grant merge actif, sans échéance : toute pass verte à partir de maintenant est mergée[\s\S]*jusqu'à ce que tu le révoques/);
    assert.match(lu(dans(30)), /^ACTIF depuis le \S+ \(par chef\) — sans échéance : une pass verte est mergée sans toi$/);
    noter({ type: "grant.revoked", payload: { action: "merge" } });

    const dit = commander("activer", T0, "--pour", "4h", "--usages", "10");

    assert.match(dit, new RegExp(`grant merge actif jusqu'au ${dans(4).toISOString()} \\(encore 4 h 00\\) · pour 10 usages : [\\s\\S]*Il s'éteindra seul`));
    assert.deepEqual(faits().at(-1), ["grant.activated", "chef", { action: "merge", until: dans(4).toISOString(), uses: 10 }]);
    assert.match(lu(dans(1)), new RegExp(`ACTIF depuis le \\S+ \\(par chef\\) — jusqu'au ${dans(4).toISOString()} \\(encore 3 h 00\\) · encore 10 usages : une pass verte`));
  });

  test("activer un grant déjà actif n'écrit rien, dit ce qu'il en reste et renvoie à `prolonger`", (t) => {
    const { commander, faits } = chef(t);
    commander("activer", T0, "--pour", "4h");

    const dit = commander("activer", dans(1), "--pour", "8h");

    assert.match(dit, /grant merge déjà actif depuis le \S+ — jusqu'au \S+ \(encore 3 h 00\)\. Rien n'est écrit : pour changer son échéance, `prolonger merge`/);
    assert.equal(faits().length, 1);
  });

  test("le chef prolonge un grant en cours sans le révoquer : un fait de plus, que l'histoire garde", (t) => {
    const { journal, commander, faits, lu } = chef(t);
    commander("activer", T0, "--pour", "4h", "--usages", "2");

    // Deux heures à partir de maintenant, pas ajoutées à l'ancienne échéance.
    assert.match(commander("prolonger", dans(3), "--pour", "2h"), new RegExp(`grant merge prolongé : jusqu'au ${dans(5).toISOString()} \\(encore 2 h 00\\) · encore 2 usages`));
    assert.match(commander("prolonger", dans(3), "--usages", "5"), /prolongé : jusqu'au \S+ \(encore 2 h 00\) · encore 7 usages/);

    assert.deepEqual(faits(), [
      ["grant.activated", "chef", { action: "merge", until: dans(4).toISOString(), uses: 2 }],
      ["grant.extended", "chef", { action: "merge", until: dans(5).toISOString() }],
      ["grant.extended", "chef", { action: "merge", uses: 5 }],
    ]);
    assert.match(lu(dans(4.5)), /ACTIF depuis le \S+T10:00:\S+ \(par chef\) — BIENTÔT ÉTEINT — jusqu'au \S+ \(encore 30 min\) · encore 7 usages/);
    const gestes = gestesDuGrant(journal);
    assert.equal(gestes.length, 3);
    assert.match(gestes[0] ?? "", /merge  prolongé : 5 usages de plus  \(chef\)$/);
    assert.match(gestes[1] ?? "", new RegExp(`merge  prolongé : jusqu'au ${dans(5).toISOString()}  \\(chef\\)$`));
    assert.match(gestes[2] ?? "", new RegExp(`merge  accordé jusqu'au ${dans(4).toISOString()} · pour 2 usages  \\(chef\\)$`));
  });

  test("prolonger ne raccourcit pas : une date plus proche, ou une limite posée là où il n'y en avait pas, est refusée sans rien écrire", (t) => {
    const { commander, refus, faits, noter } = chef(t);
    commander("activer", T0, "--pour", "4h");
    assert.match(refus("prolonger", dans(1), "--pour", "1h") ?? "", /vaut déjà jusqu'au \S+ : \S+ ne le prolonge pas — pour le raccourcir, révoque-le puis réaccorde-le/);
    assert.match(refus("prolonger", dans(1), "--usages", "3") ?? "", /ne compte pas ses usages/);
    assert.match(refus("prolonger", dans(1)) ?? "", /prolonger de combien \?/);
    noter({ type: "grant.revoked", payload: { action: "merge" } });
    commander("activer", T0, "--usages", "3");
    assert.match(refus("prolonger", dans(1), "--pour", "1h") ?? "", /n'a pas d'échéance en date/);

    assert.deepEqual(faits().map(([type]) => type), ["grant.activated", "grant.revoked", "grant.activated"]);
  });

  test("l'échéance se lève explicitement, et le journal le dit", (t) => {
    const { journal, commander, faits, lu } = chef(t);
    commander("activer", T0, "--pour", "4h", "--usages", "2");

    assert.match(commander("prolonger", dans(1), "--sans-echeance"), /prolongé : son échéance est levée/);

    assert.deepEqual(faits().at(-1), ["grant.extended", "chef", { action: "merge", until: null, uses: null }]);
    assert.match(lu(dans(400)), /ACTIF depuis le \S+ \(par chef\) — sans échéance/);
    assert.match(gestesDuGrant(journal)[0] ?? "", /prolongé : échéance levée/);
    assert.match(commander("prolonger", dans(2), "--sans-echeance"), /déjà sans échéance : rien n'est écrit/);
  });

  test("éteint seul, il se lit ainsi avant même que le runtime l'écrive — et ne se prolonge pas : il se réaccorde, l'extinction d'abord écrite", (t) => {
    const { journal, commander, refus, faits, lu } = chef(t);
    commander("activer", T0, "--pour", "4h");

    assert.match(lu(dans(6)), new RegExp(`^ÉTEINT SEUL depuis le ${dans(4).toISOString()} — son échéance est passée \\(accordé par chef\\) : la pass s'arrête à la PR ouverte \\(le runtime l'écrira au journal à son prochain passage\\)$`));
    assert.equal(faits().length, 1);

    assert.match(refus("prolonger", dans(6), "--pour", "2h") ?? "", /rien à prolonger : le grant merge n'est pas actif — il s'est éteint seul le \S+ \(son échéance est passée\) — pour le réaccorder, `activer merge`/);
    assert.match(commander("revoquer", dans(6)), /rien à révoquer : le grant merge n'est pas actif — il s'est éteint seul le/);
    commander("activer", dans(6), "--pour", "1h");

    // Le geste du chef ne recouvre pas l'extinction : elle est au journal, à sa date, et pas en son nom.
    assert.deepEqual(faits(), [
      ["grant.activated", "chef", { action: "merge", until: dans(4).toISOString() }],
      ["grant.expired", "runtime", { action: "merge", cause: "until", since: dans(4).toISOString() }],
      ["grant.activated", "chef", { action: "merge", until: dans(7).toISOString() }],
    ]);
    assert.match(gestesDuGrant(journal)[1] ?? "", new RegExp(`éteint seul : son échéance est passée \\(depuis le ${dans(4).toISOString()}\\)  \\(runtime\\)$`));
    assert.doesNotMatch(lu(dans(6)), /le runtime l'écrira/);
  });

  test("le dernier usage se lit comme bientôt éteint, un merge en vol comme un usage retenu", (t) => {
    const { base, commander, lu, vouloir } = chef(t);
    commander("activer", T0, "--usages", "2");
    assert.equal(bientotEteint(etatDuGrant(base, "merge", T0)!, T0), false);

    vouloir(17);
    assert.match(lu(T0), /encore 2 usages, dont 1 retenu par un merge en cours/);
    commander("revoquer", T0);
    commander("activer", T0, "--usages", "1");

    assert.match(lu(T0), /BIENTÔT ÉTEINT — encore 1 usage : /);
  });

  test("ce que `prolonger` seul sait faire est refusé ailleurs, et un journal vide ne reçoit aucun grant", (t) => {
    const { commander, refus } = chef(t);
    assert.match(refus("activer", T0, "--sans-echeance") ?? "", /--sans-echeance ne vaut que pour `prolonger`/);
    commander("activer", T0);
    assert.match(refus("revoquer", T0, "--pour", "2h") ?? "", /`revoquer` ne prend pas d'échéance/);

    const vide = histoire(t);
    assert.throws(() => commanderGrant(vide.journal, "activer", "merge", { sansEcheance: false }, T0, duree), /journal vide/);
  });
});
