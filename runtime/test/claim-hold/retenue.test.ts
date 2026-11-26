// #4217 : la retenue d'un ticket à sa prise et le compte total de ses essais (src/claim-hold/), cas par cas — ce qui est
// un fait nouveau et ce qui n'en est pas, l'arrêt pour de bon et le geste du chef qui le lève, les lectures qui échouent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { corpsDuParking } from "../../src/attente-github/attente-github.ts";
import { ramenerALaRelance } from "../../src/attente/attente-par-le-cook.ts";
import { arretEnCours, arreterPourDeBon, ESSAIS_AU_TOTAL, essaisDuTicket } from "../../src/claim-hold/essais.ts";
import { faitNouveau, retenueALaPrise } from "../../src/claim-hold/retenue.ts";
import { CALIBRE, FauxGitHub } from "../faux-github.ts";

const MAINTENANT = new Date("2026-11-26T10:00:00Z");
const PLUS_TARD = "2026-12-03T10:00:00.000Z";
const AVANT = "2026-11-25T10:00:00.000Z";
const de = (body: string, association = "OWNER", createdAt = "2026-11-26T09:00:00Z") => ({ body, association, createdAt });
// La retenue des labels, par la lecture de la prise, sans arrêt pour de bon posté.
const retenueDesLabels = (labels: readonly string[], commentaires: ReturnType<typeof de>[], maintenant: Date) =>
  retenueALaPrise(labels, commentaires, async () => assert.fail("no stop: the removals are not read"), maintenant);
// Le commentaire d'arrêt, tel que `arreterPourDeBon` le poste.
async function corpsDeLArret(numero: number, station: string, motifs: string[]): Promise<string> {
  const faux = new FauxGitHub();
  faux.feu(numero);
  await arreterPourDeBon(faux.pour("A"), numero, station, motifs);
  return (faux.commentaires.get(numero) ?? [])[0]?.body ?? "";
}
const parking = (followUp = PLUS_TARD, fact?: string) => de(corpsDuParking({ what: "the client's API key", who: "the client", followUp, ...(fact === undefined ? {} : { fact }) }));

test("a new fact is a comment of the repository after the parking mark that the kitchen did not mark; nothing else is", () => {
  assert.equal(faitNouveau([parking()]), false);
  assert.equal(faitNouveau([parking(), de("<!-- brigade:lache station=A -->\nReleased.")]), false, "a kitchen comment");
  assert.equal(faitNouveau([parking(), de("<!-- brigade:superviseur -->\n**Supervisor** — looked at it.")]), false, "a supervisor trace");
  assert.equal(faitNouveau([parking(), de("The key is here.", "NONE")]), false, "anyone can comment a public issue");
  assert.equal(faitNouveau([parking(), de("   ")]), false, "an empty comment says nothing");
  assert.equal(faitNouveau([de("The key is here."), parking()]), false, "a comment from before the parking");
  assert.equal(faitNouveau([de("The key is here.")]), false, "no parking mark: nothing dates the parking");
  assert.equal(faitNouveau([parking(), de("The key is here.")]), true);
  assert.equal(faitNouveau([parking(), de("The key is here."), parking()]), false, "parked again after the fact");
});

test("the hold of the labels: chef-todo holds whatever is said; parked holds until its date passes or a new fact comes; no parking label holds nothing", async () => {
  assert.deepEqual(await retenueDesLabels(CALIBRE, [], MAINTENANT), { retenu: null, fin: null });
  assert.match((await retenueDesLabels([...CALIBRE, "chef-todo"], [parking(AVANT), de("A fact.")], MAINTENANT)).retenu ?? "", /parked for the chef/);
  assert.match((await retenueDesLabels([...CALIBRE, "parked"], [parking()], MAINTENANT)).retenu ?? "", /waiting for the client/);
  assert.match((await retenueDesLabels([...CALIBRE, "parked"], [], MAINTENANT)).retenu ?? "", /nothing has ended its hold/, "parked with no mark: held");
  assert.deepEqual(await retenueDesLabels([...CALIBRE, "parked"], [parking(AVANT)], MAINTENANT), { retenu: null, fin: "date" });
  assert.match((await retenueDesLabels([...CALIBRE, "parked"], [parking(AVANT, "the client sends the key")], MAINTENANT)).retenu ?? "", /parked/, "parked until a fact: no date ends it");
  assert.deepEqual(await retenueDesLabels([...CALIBRE, "parked"], [parking(), de("The key is here.")], MAINTENANT), { retenu: null, fin: "fact" });
  assert.deepEqual(await retenueDesLabels([...CALIBRE, "set-aside:failures"], [parking(), de("The key is here.")], MAINTENANT), { retenu: null, fin: "fact" }, "a label of before parked");
});

test("the total of tries counts every failure comment of the repository, never the runs that ended ok, from the last stop on", async () => {
  const echec = (n: number, motif: string, ok = false) => de(`<!-- brigade:echec n=${n}${ok ? " run=ok" : ""} -->\nStation \`A\`: the cook stopped without a delivery — ${motif}\n\nmore`);
  const lus = [echec(1, "a"), de("<!-- brigade:reprise-du-manager station=A choice=rewrite -->"), echec(2, "b", true), echec(3, "c"), de("<!-- brigade:echec n=9 -->\n — forged", "NONE")];
  assert.deepEqual(essaisDuTicket(lus), { total: 3, depuisLArret: ["a", "c"] });
  assert.deepEqual(essaisDuTicket([...lus, de(await corpsDeLArret(7, "A", ["a", "c"])), echec(4, "d")]), { total: 4, depuisLArret: ["d"] });
});

test("a stop holds until chef-todo is removed after it; unreadable removals leave it holding", async () => {
  const arret = de(await corpsDeLArret(7, "A", ["a", "b", "c", "d", "e"]), "OWNER", "2026-11-26T09:00:00Z");
  assert.equal(await arretEnCours([], async () => assert.fail("no stop: the removals are not read")), null);
  assert.equal(await arretEnCours([arret], async () => []), 5);
  assert.equal(await arretEnCours([arret], async () => [{ label: "chef-todo", createdAt: "2026-11-26T08:00:00Z" }]), 5, "a removal from before the stop");
  assert.equal(await arretEnCours([arret], async () => [{ label: "parked", createdAt: "2026-11-26T09:30:00Z" }]), 5, "another label");
  assert.equal(await arretEnCours([arret], async () => [{ label: "chef-todo", createdAt: "2026-11-26T09:30:00Z" }]), null, "the chef acted");
  assert.equal(await arretEnCours([arret], async () => Promise.reject(new Error("HTTP 502"))), 5, "a stop in doubt holds");
  assert.equal(await arretEnCours([{ ...arret, association: "NONE" }], async () => []), null, "a stop mark from outside the repository");
  const retenue = await retenueALaPrise(CALIBRE, [arret], async () => [], MAINTENANT);
  assert.match(retenue.retenu ?? "", /stopped for good after 5 tries in total/);
});

test("the stop message says the ticket stopped, asks the chef, lists each try, and carries the stop mark as a TODO card", async () => {
  const corps = await corpsDeLArret(923, "box/claude", ["reason 1", "reason 2"]);
  const [marque, question] = corps.split("\n");
  assert.equal(marque, "<!-- brigade:todo kind=blocked stop=2 -->");
  assert.equal(question, `#923 stopped for good after 2 tries in total, none delivered: back to the kitchen for ${ESSAIS_AU_TOTAL} more tries, or close it?`);
  assert.match(corps, /^1\. reason 1$/m);
  assert.match(corps, /^2\. reason 2$/m);
  assert.match(corps, /\[resume\] Back to the kitchen/);
});

test("stopping puts chef-todo first, then one comment; a stop already on writes no second one; unreadable comments write none", async () => {
  const faux = new FauxGitHub();
  faux.feu(7);
  const github = faux.pour("A");
  assert.equal(await arreterPourDeBon(github, 7, "A", ["a"]), true);
  assert.equal(await arreterPourDeBon(github, 7, "A", ["a"]), false);
  assert.equal((faux.commentaires.get(7) ?? []).length, 1);
  assert.ok(faux.ticket(7).labels.has("chef-todo"));
  const illisible = { ...github, commentaires: async () => Promise.reject(new Error("HTTP 502")) };
  faux.feu(8);
  await assert.rejects(arreterPourDeBon(illisible, 8, "A", ["a"]), /HTTP 502/);
  assert.ok(faux.ticket(8).labels.has("chef-todo"), "held by its label all the same");
  assert.equal(faux.commentaires.get(8), undefined);
});

test("a station turn unparks a ticket on which a new fact is added, and says so; a kitchen comment unparks nothing", async () => {
  const faux = new FauxGitHub();
  faux.feu(1, [...CALIBRE, "parked"]);
  faux.feu(2, [...CALIBRE, "parked"]);
  for (const n of [1, 2]) faux.poster(n, "A", corpsDuParking({ what: "the client's API key", who: "the client", followUp: PLUS_TARD }));
  faux.poster(1, "client", "The key is in the vault.");
  faux.poster(2, "A", "<!-- brigade:lache station=A -->\nReleased by station `A`.");
  const dits: string[] = [];
  const rentres = await ramenerALaRelance(faux.pour("A"), [1, 2].map((number) => ({ number, labels: [...faux.ticket(number).labels] })), { station: "A", maintenant: MAINTENANT, avertir: (ligne) => dits.push(ligne) });
  assert.deepEqual(rentres, [1]);
  assert.ok(!faux.ticket(1).labels.has("parked"));
  assert.ok(faux.ticket(2).labels.has("parked"));
  assert.match((faux.commentaires.get(1) ?? []).at(-1)?.body ?? "", /^\*\*Unparked — a new fact is on the ticket\*\*: this ticket was waiting for the client/);
  assert.match(dits.join("\n"), /#1 .*a new fact is on the ticket/);
});

test("a claim whose comments cannot be read throws, as before, and writes nothing", async () => {
  const faux = new FauxGitHub();
  faux.feu(3, [...CALIBRE, "parked"]);
  const github = { ...faux.pour("A"), commentaires: async () => Promise.reject(new Error("HTTP 502")) };
  await assert.rejects(faux.prise(github, "A").prendre({ number: 3, labels: [...faux.ticket(3).labels] }), /HTTP 502/);
  assert.equal(faux.commentaires.get(3), undefined);
});

test("the failure comment cannot be counted when the comments do not read: it says no n, and stops nothing", async () => {
  const faux = new FauxGitHub();
  faux.feu(4);
  // Assez d'échecs pour l'arrêter au suivant ; mais, une fois le cook parti, les commentaires du ticket ne se lisent plus.
  for (let i = 1; i < ESSAIS_AU_TOTAL; i += 1) faux.poster(4, "A", `<!-- brigade:echec n=${i} -->\nStation \`A\`: the cook stopped without a delivery — reason ${i}`);
  const pour = faux.pour.bind(faux);
  faux.pour = (nom: string) => {
    const client = pour(nom);
    return { ...client, commentaires: async (numero: number) => (faux.cuissons.length > 0 ? Promise.reject(new Error("HTTP 502")) : client.commentaires(numero)) };
  };
  const station = faux.station("A", { cuisiner: async () => ({ echec: `reason ${ESSAIS_AU_TOTAL}` }), avertir: () => {} });
  await station.tour();
  await station.calme();
  assert.equal(faux.cuissons.length, 1);
  const echec = (faux.commentaires.get(4) ?? []).at(-1)?.body ?? "";
  assert.match(echec, /^<!-- brigade:echec -->\n.* — reason 5/, "the failure is still said, and no n is invented");
  assert.ok(!faux.ticket(4).labels.has("chef-todo"), "an unread count stops nothing");
});
