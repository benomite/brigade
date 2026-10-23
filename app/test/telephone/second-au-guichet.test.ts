// La conversation d'un projet avec son second, sur le téléphone appairé (#1426) : l'onglet Second lit celle que le
// guichet de la station sert (`GET /projects/<nom>/second`, runtime/src/telephone/guichet.ts), un message du chef y part
// (`POST`), et la réponse du second arrive ensuite, relue par la lecture du pont (app/android/web/lecture.ts) tant que le
// second répond. Ici, la vue est jouée telle quelle (aides/fausse-vue.ts), la lecture du pont telle quelle derrière elle.
// D'abord devant un faux guichet, qui rend ce que le vrai rend : ce qui se lit, ce qui part, et ce qui ne se joint pas,
// dit en une phrase, le détail au survol. Puis devant le vrai guichet d'une station, dont le second est une doublure de
// `claude -p` : l'échange du téléphone est celui que le second du desktop lit (runtime/src/second/conversation.ts). Ce
// que le pont envoie au HTTP natif est éprouvé à part (packaging/android.test.ts).
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { lireLaConversation } from "../../../runtime/src/second/conversation.ts";
import { CONFIGURATION } from "../../../runtime/src/station/configuration.ts";
import { ouvrirTelephones } from "../../../runtime/src/telephone/appairage.ts";
import { ouvrirGuichet } from "../../../runtime/src/telephone/guichet.ts";
import { secondsDeLaStation } from "../../../runtime/src/telephone/second.ts";
import { ouvrirLaLecture, PAS_DE_LA_REPONSE_MS, type ProjetDuGuichet, type Reponse } from "../../android/web/lecture.ts";
import { ALLUMAGE } from "../../src/allumage.ts";
import { BOUTONS } from "../../src/boutons.ts";
import { EXEMPLE } from "../../src/config.ts";
import { PALETTE } from "../../src/couleurs.ts";
import { GESTES_DE_LA_CUISINE } from "../../src/cuisine.ts";
import { BANNIERE } from "../../src/faits.ts";
import { CONFIRMES, DIRECTS, GRANTS } from "../../src/gestes.ts";
import { GESTES_DES_GRANTS } from "../../src/grants.ts";
import { ONGLETS, RUBRIQUES } from "../../src/onglets.ts";
import { EFFORTS, MODELES } from "../../src/projets/projets.ts";
import { ILLISIBLE, REPOND } from "../../src/vue/telephone/conversation.js";
import { type Faux, FauxEcran, FauxStockage, type Jouee, jouerLaVue, type Reponses, repos } from "../aides/fausse-vue.ts";

const A = "2026-10-23T08:04:12.000Z";
const STATION = "atelier";
const ADRESSE = "http://192.168.1.20:7010";
const PROJETS: ProjetDuGuichet[] = [{ name: "parade", repository: "chef/parade", state: "served" }];
const FACTS = { etat: "ouverte", lu: A, dernierTick: null, compteurs: { rail: 0, auTravail: 0, aLaPass: 0, attend: 0, livres24h: 0 }, dernierEvenement: null, rail: [], cooks: [], attend: [], stations: [] };
const INJOIGNABLE = "failed to connect to /192.168.1.20 (port 7010) after 10000ms";

type Message = { from: "chef" | "second"; at: string; text: string };
const DU_DESKTOP: Message[] = [
  { from: "chef", at: "2026-10-23T08:01:00.000Z", text: "What blocks #15?" },
  { from: "second", at: "2026-10-23T08:01:10.000Z", text: "Nothing: **#15** waits for a cook." },
];
type Lue = { messages: Message[]; answering?: true; failed?: { said: string; detail: string } };

// Le guichet de la station, faux : sa conversation de `parade` — celle du second du desktop —, et ce que le vrai rend à
// chaque demande. `lire` et `ecrire` : ce qu'il rend d'une lecture ou d'un message, à la place de ce qu'il ferait. Chaque
// demande est notée.
function guichet({ lire, ecrire }: { lire?: () => Reponse | Error | undefined; ecrire?: (texte: string) => Reponse | Error | undefined } = {}) {
  let conversation: Lue = { messages: [...DU_DESKTOP] };
  const demandes: { methode: string; chemin: string; corps?: unknown }[] = [];
  const requete = async (chemin: string): Promise<Reponse> => {
    demandes.push({ methode: "GET", chemin });
    if (chemin === "/projects") return { status: 200, data: { projects: PROJETS } };
    if (chemin === "/projects/parade/queue") return { status: 200, data: { project: "parade", repository: "chef/parade", facts: FACTS, status: "état : cuisine ouverte\n" } };
    if (chemin === "/projects/parade/second") {
      const rendu = lire?.();
      if (rendu instanceof Error) throw rendu;
      return rendu ?? { status: 200, data: { project: "parade", session: "0b6c", ...structuredClone(conversation) } };
    }
    return { status: 404, data: { said: "unknown" } };
  };
  const envoyer = async (chemin: string, corps: unknown): Promise<Reponse> => {
    demandes.push({ methode: "POST", chemin, corps });
    const { text } = corps as { text: string };
    const rendu = ecrire?.(text);
    if (rendu instanceof Error) throw rendu;
    if (rendu !== undefined) return rendu;
    conversation = { messages: [...conversation.messages, { from: "chef", at: "2026-10-23T08:05:00.000Z", text }], answering: true };
    return { status: 202, data: { sent: true, project: "parade", session: "0b6c", ...structuredClone(conversation) } };
  };
  return {
    requete,
    envoyer,
    demandes,
    // Le second répond au dernier message.
    repondre(text: string) {
      conversation = { messages: [...conversation.messages, { from: "second", at: "2026-10-23T08:05:30.000Z", text }] };
    },
    // Le second échoue en y répondant.
    echouer(failed: { said: string; detail: string }) {
      conversation = { messages: conversation.messages, failed };
    },
    // Le chef tape dans le terminal du second, sur son ordinateur.
    ecrireDuDesktop(text: string) {
      conversation = { messages: [...conversation.messages, { from: "chef", at: "2026-10-23T08:06:00.000Z", text }] };
    },
  };
}

const CONSTANTES = {
  palette: PALETTE,
  exemple: EXEMPLE,
  onglets: ONGLETS,
  rubriques: RUBRIQUES,
  boutons: BOUTONS,
  gestes: { allumage: ALLUMAGE, cuisine: GESTES_DE_LA_CUISINE, grants: { gestes: GESTES_DES_GRANTS, nommes: GRANTS }, directs: DIRECTS, confirmes: CONFIRMES },
  banniere: BANNIERE,
  calibrage: { modeles: MODELES, efforts: EFFORTS },
  code: undefined,
};

type Planifie = { faire: () => void; ms: number };
type Guichet = { requete: (chemin: string) => Promise<Reponse>; envoyer: (chemin: string, corps: unknown) => Promise<Reponse> };
// Le téléphone appairé à `atelier` : sa lecture ouverte sur le guichet, la vue devant elle — chaque demande de la vue
// part à la lecture, comme le pont la lui passe (app/android/web/pont.js) —, l'espace de parade ouvert, puis son onglet
// Second. Ce que la lecture planifie est gardé, et ne part que quand le test le joue ; `planifier` le remplace.
async function telephone(station: Guichet, planifier?: (faire: () => void, ms: number) => () => void) {
  let vue: Jouee | undefined;
  const enAttente: { canal: string; args: unknown[] }[] = [];
  const planifies: Planifie[] = [];
  const lecture = ouvrirLaLecture({
    requete: station.requete,
    envoyer: station.envoyer,
    station: STATION,
    adresse: ADRESSE,
    connus: PROJETS,
    maintenant: () => new Date(A),
    planifier:
      planifier ??
      ((faire, ms) => {
        const planifie = { faire, ms };
        planifies.push(planifie);
        return () => void planifies.splice(planifies.indexOf(planifie) >>> 0, 1);
      }),
    dire: ((canal: string, ...args: unknown[]) => {
      if (vue !== undefined) (vue.dire as (canal: string, ...args: unknown[]) => void)(canal, ...args);
      else enAttente.push({ canal, args });
    }) as Parameters<typeof ouvrirLaLecture>[0]["dire"],
  });
  // Le pont rend la promesse de la lecture ; la fausse vue l'attend comme celle du vrai pont.
  const promise = <F>(geste: F) => geste as unknown as never;
  vue = await jouerLaVue(
    {
      demarrage: () => ({ ...CONSTANTES, configuration: lecture.configuration(), telephone: lecture.telephone() }),
      faits: (demande) => void lecture.faits(demande),
      tous: (demande) => void lecture.tous(demande),
      regarder: (projet, demande) => void lecture.regarder(projet, demande),
      relireBox: () => void lecture.relire(),
      conversation: promise((projet: string) => lecture.conversation(projet)),
      envoyerAuSecond: promise((projet: string, texte: string) => lecture.envoyerAuSecond(projet, texte)),
      oublierLeTelephone: async () => undefined,
      espace: () => [],
      machines: () => [],
    } satisfies Reponses as Reponses & Required<Pick<Reponses, "demarrage">>,
    { ecran: new FauxEcran(true), stockage: new FauxStockage() },
  );
  for (const { canal, args } of enAttente.splice(0)) (vue.dire as (canal: string, ...args: unknown[]) => void)(canal, ...args);
  await calme();
  (vue.element("projets").children.find((pose) => pose.title.startsWith("parade — ")) ?? assert.fail("pas de case pour parade")).click();
  await calme();
  await toucherSecond(vue);
  // Ce que la lecture a planifié au pas de la réponse du second, joué maintenant.
  const relireDePres = async () => {
    const proches = planifies.filter(({ ms }) => ms === PAS_DE_LA_REPONSE_MS);
    for (const planifie of proches) {
      planifies.splice(planifies.indexOf(planifie), 1);
      planifie.faire();
    }
    await calme();
    return proches.length;
  };
  return { vue, lecture, relireDePres };
}
// Le guichet faux répond sans attendre : quelques tours de la boucle suffisent à ce que tout soit lu et posé.
async function calme(): Promise<void> {
  for (let tour = 0; tour < 30; tour++) await repos();
}
async function toucherSecond(vue: Jouee): Promise<void> {
  (vue.element("onglets-du-projet").children.find((onglet) => onglet.textContent === "Second") ?? assert.fail("pas d'onglet Second")).click();
  await calme();
}

const conversation = (vue: Jouee) => vue.element("conversation");
// Les messages montrés : qui, et ce qu'il a écrit — ou ce que l'écran dit à leur place.
const messages = (vue: Jouee) =>
  (conversation(vue).dessous("ol")[0] ?? assert.fail("pas de messages")).children.map((li) =>
    li.className === "chef" || li.className === "second" ? `${li.children[0]?.children[0]?.textContent}: ${li.children[1]?.textContent}` : `(${li.className}) ${li.textContent}`,
  );
// La ligne d'une conversation qui ne se lit pas : ce qu'elle dit, et son survol.
const illisible = (vue: Jouee) => {
  const ligne = conversation(vue).dessous("li").find((li) => li.className === "illisible");
  if (ligne === undefined) return undefined;
  const dit = ligne.children[0] ?? assert.fail();
  return { dit: dit.children[0]?.textContent, survol: dit.dessous("button").find((aide) => aide.className === "aide")?.ariaLabel ?? "" };
};
// Ce que la ligne d'issue dit, sous les messages, et son survol.
const issue = (vue: Jouee) =>
  (conversation(vue).children.find((pose) => pose.className === "issue-conversation") ?? assert.fail("pas de ligne d'issue")).children.map((pose) => ({
    classe: pose.className,
    dit: pose.children[0]?.textContent ?? pose.textContent,
    survol: pose.dessous("button").find((aide) => aide.className === "aide")?.ariaLabel ?? "",
  }));
const saisie = (vue: Jouee): Faux => conversation(vue).dessous("textarea")[0] ?? assert.fail("pas de champ");
const envoyer = (vue: Jouee): Faux => conversation(vue).dessous("button").find((pose) => pose.dataset.geste === "envoyer-au-second") ?? assert.fail("pas de « send »");
async function ecrire(vue: Jouee, texte: string): Promise<void> {
  saisie(vue).value = texte;
  saisie(vue).declencher("input");
  await repos();
  envoyer(vue).click();
  await calme();
}
const envoyes = (station: ReturnType<typeof guichet>) => station.demandes.filter(({ methode }) => methode === "POST").map(({ chemin, corps }) => ({ chemin, corps }));

describe("sur le téléphone appairé, l'onglet Second lit et écrit la conversation du second au guichet de la station", () => {
  test("la conversation du desktop, lue au guichet : chaque message nommé, le markdown rendu, le champ du message — plus de « conversation unavailable »", async () => {
    const station = guichet();
    const { vue } = await telephone(station);
    assert.ok(station.demandes.some(({ methode, chemin }) => methode === "GET" && chemin === "/projects/parade/second"));
    assert.deepEqual(messages(vue), ["you: What blocks #15?", "second: Nothing: #15 waits for a cook."]);
    assert.deepEqual(
      (conversation(vue).dessous("ol")[0]?.children[1] ?? assert.fail()).dessous("strong").map((gras) => gras.textContent),
      ["second", "#15"],
      "le markdown du second est rendu",
    );
    assert.equal(illisible(vue), undefined);
    assert.doesNotMatch(conversation(vue).textContent, new RegExp(ILLISIBLE));
    assert.equal((conversation(vue).children.find((pose) => pose.className === "message-au-second") ?? assert.fail()).hidden, false);
  });

  test("un message envoyé part au guichet, apparaît avec « the second is answering… », puis la réponse du second arrive, relue de près", async () => {
    const station = guichet();
    const { vue, relireDePres } = await telephone(station);
    await ecrire(vue, "  Merge #12, I grant it.  ");
    assert.deepEqual(envoyes(station), [{ chemin: "/projects/parade/second", corps: { text: "Merge #12, I grant it." } }]);
    assert.deepEqual(messages(vue).slice(2), ["you: Merge #12, I grant it.", `(second repond) ${REPOND}`]);
    assert.equal(saisie(vue).value, "");
    assert.deepEqual(issue(vue), []);
    // Le second n'a pas fini : la conversation relue le dit encore, et le sera de nouveau.
    assert.equal(await relireDePres(), 1);
    assert.deepEqual(messages(vue).slice(2), ["you: Merge #12, I grant it.", `(second repond) ${REPOND}`]);
    station.repondre("Merged: **#12** is served.");
    assert.equal(await relireDePres(), 1);
    assert.deepEqual(messages(vue).slice(2), ["you: Merge #12, I grant it.", "second: Merged: #12 is served."]);
    // Il a répondu : plus rien n'est relu de près.
    assert.equal(await relireDePres(), 0);
  });

  test("ce que le chef tape au desktop dans le même second arrive au téléphone à la lecture suivante de la station", async () => {
    const station = guichet();
    const { vue, lecture } = await telephone(station);
    station.ecrireDuDesktop("Also look at #21.");
    await lecture.relire();
    await calme();
    assert.equal(messages(vue).at(-1), "you: Also look at #21.");
  });

  test("un second qui échoue en répondant le dit en une ligne sous la conversation, ce que la station en a dit au survol", async () => {
    const station = guichet();
    const { vue, relireDePres } = await telephone(station);
    await ecrire(vue, "Merge #12.");
    station.echouer({ said: "the second of parade failed — You've hit your limit", detail: "$ claude --continue -p   (in /home/chef/parade)\nYou've hit your limit\n→ exit code 1" });
    await relireDePres();
    assert.deepEqual(messages(vue).slice(2), ["you: Merge #12."]);
    assert.deepEqual(issue(vue), [{ classe: "indisponible refus", dit: "the second of parade failed — You've hit your limit", survol: "$ claude --continue -p   (in /home/chef/parade)\nYou've hit your limit\n→ exit code 1" }]);
  });
});

describe("sur le téléphone, une conversation qui ne se lit pas se dit en une phrase, le détail au survol, avec « read again »", () => {
  for (const [cas, rendu, dit, survol] of [
    ["la station injoignable", new Error(INJOIGNABLE), "atelier could not be reached", INJOIGNABLE],
    ["la réponse qui n'arrive pas à temps", new Error("timeout"), "atelier did not answer", "timeout"],
    [
      "la station qui ne tient pas le second de parade (503)",
      { status: 503, data: { said: "this station does not hold the second of parade: its line names no folder where the second runs (BRIGADE_SECOND_DIR)" } },
      "atelier cannot reach parade's second",
      "this station does not hold the second of parade: its line names no folder where the second runs (BRIGADE_SECOND_DIR)",
    ],
    ["le guichet derrière `tailscale serve` qui ne répond pas (502 sans corps)", { status: 502, data: "" }, "atelier's phone desk does not answer", `${ADRESSE} answered 502: nothing answers behind it`],
    ["un téléphone que la station ne connaît plus (401)", { status: 401, data: { said: "unknown token" } }, "atelier no longer knows this phone: pair it again", "unknown token"],
  ] as const) {
    test(`${cas} : « ${dit} », sans champ ; relue, la conversation revient`, async () => {
      let panne = true;
      const station = guichet({ lire: () => (panne ? rendu : undefined) });
      const { vue } = await telephone(station);
      assert.deepEqual(illisible(vue), { dit, survol });
      assert.doesNotMatch(conversation(vue).textContent, /BRIGADE_SECOND_DIR|failed to connect/, "le détail n'est qu'au survol");
      assert.equal((conversation(vue).children.find((pose) => pose.className === "message-au-second") ?? assert.fail()).hidden, true);
      panne = false;
      (conversation(vue).dessous("button").find((pose) => pose.textContent === "read again") ?? assert.fail("pas de « read again »")).click();
      await calme();
      assert.equal(illisible(vue), undefined);
      assert.equal(messages(vue).length, 2);
    });
  }
});

describe("sur le téléphone, un message qui ne part pas se dit en une phrase, le texte reste dans le champ", () => {
  for (const [cas, rendu, dit, survol] of [
    ["la station injoignable", new Error(INJOIGNABLE), "atelier could not be reached: your message was not sent", INJOIGNABLE],
    ["le second qui répond encore au précédent (409)", { status: 409, data: { sent: false, said: "the second of parade is still answering your previous message: wait for its answer, then send this one" } }, "the second of parade is still answering your previous message: wait for its answer, then send this one", `${ADRESSE} answered 409`],
    ["le second qui ne prend pas le message (502)", { status: 502, data: { sent: false, said: "the second of parade failed — Invalid API key", detail: "$ claude --continue -p   (in /home/chef/parade)\nInvalid API key\n→ exit code 1" } }, "the second of parade failed — Invalid API key", "$ claude --continue -p   (in /home/chef/parade)\nInvalid API key\n→ exit code 1"],
    ["la station qui ne tient plus le second (503)", { status: 503, data: { sent: false, said: "the conversation with the second of parade cannot be read: EACCES" } }, "atelier cannot reach parade's second: your message was not sent", "the conversation with the second of parade cannot be read: EACCES"],
  ] as const) {
    test(`${cas} : « ${dit} »`, async () => {
      const station = guichet({ ecrire: () => rendu });
      const { vue } = await telephone(station);
      await ecrire(vue, "Merge #12.");
      assert.deepEqual(issue(vue), [{ classe: "indisponible refus", dit, survol }]);
      assert.equal(saisie(vue).value, "Merge #12.");
      assert.equal(messages(vue).length, 2);
      assert.equal(envoyer(vue).disabled, false, "« send » se rejoue");
    });
  }

  test("la réponse au message qui n'arrive pas à temps : la phrase le dit, et la conversation relue montre s'il est parti", async () => {
    const station = guichet();
    let premier = true;
    const enRetard = guichet({
      ecrire: (texte) => {
        if (!premier) return undefined;
        premier = false;
        // Le message est entré dans la conversation, mais la réponse du guichet n'est pas revenue.
        void station.envoyer("/projects/parade/second", { text: texte });
        return new Error("timeout");
      },
      lire: () => undefined,
    });
    const { vue } = await telephone({ requete: (chemin) => (chemin === "/projects/parade/second" ? station.requete(chemin) : enRetard.requete(chemin)), envoyer: enRetard.envoyer });
    await ecrire(vue, "Merge #12.");
    assert.deepEqual(messages(vue).slice(2), ["you: Merge #12.", `(second repond) ${REPOND}`], "la conversation relue montre le message parti");
    assert.deepEqual(issue(vue), [{ classe: "indisponible refus", dit: "atelier did not answer: the conversation shows whether your message went through", survol: "timeout" }]);
  });
});

// Le vrai guichet d'une station, dont le second est une doublure de `claude -p` : elle range le message du chef dans la
// session du dossier du second, là où Claude Code la range, puis sa réponse quand `feu` existe.
const FAUX_CLAUDE = String.raw`
const fs = require("node:fs");
const path = require("node:path");
let texte = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (morceau) => (texte += morceau));
process.stdin.on("end", () => {
  const dossier = path.join(process.env.CLAUDE_CONFIG_DIR, "projects", process.cwd().replace(/[^a-zA-Z0-9]/g, "-"));
  const session = fs.readdirSync(dossier).find((nom) => nom.endsWith(".jsonl")).slice(0, -6);
  const ranger = (entree) => fs.appendFileSync(path.join(dossier, session + ".jsonl"), JSON.stringify({ sessionId: session, isSidechain: false, timestamp: new Date().toISOString(), ...entree }) + "\n");
  ranger({ type: "user", message: { role: "user", content: texte } });
  const attente = setInterval(() => {
    if (!fs.existsSync(process.env.FAUX_SECOND_FEU)) return;
    clearInterval(attente);
    ranger({ type: "assistant", message: { id: "msg_2", role: "assistant", content: [{ type: "text", text: "Heard: " + texte }] } });
  }, 5);
});
`;
const SESSION = "0b6c1c2e-4f5a-4b7c-9d8e-1f2a3b4c5d6e";

async function stationReelle(t: TestContext) {
  const racine = mkdtempSync(join(tmpdir(), "brigade-second-au-guichet-"));
  const outils = join(racine, "outils");
  const dossier = join(racine, "parade");
  const claude = join(racine, "claude");
  const feu = join(racine, "feu");
  mkdirSync(outils);
  mkdirSync(dossier);
  mkdirSync(join(racine, "telephones"));
  writeFileSync(join(racine, "faux-claude.cjs"), FAUX_CLAUDE);
  writeFileSync(join(outils, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${join(racine, "faux-claude.cjs")}" "$@"\n`);
  for (const outil of ["gh", "git", "ssh"]) writeFileSync(join(outils, outil), "#!/bin/sh\n");
  for (const outil of ["claude", "gh", "git", "ssh"]) chmodSync(join(outils, outil), 0o755);
  writeFileSync(join(racine, CONFIGURATION), `parade   chef/parade   main BRIGADE_SECOND_DIR=${dossier}\n`);
  // Ce que le second du desktop a déjà dit dans cette session, tapé dans son terminal.
  const transcripts = join(claude, "projects", realpathSync(dossier).replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(transcripts, { recursive: true });
  writeFileSync(
    join(transcripts, `${SESSION}.jsonl`),
    [
      { type: "user", timestamp: "2026-10-23T08:01:00.000Z", message: { role: "user", content: "What blocks #15?" } },
      { type: "assistant", timestamp: "2026-10-23T08:01:10.000Z", message: { id: "msg_b", role: "assistant", content: [{ type: "text", text: "Nothing: it waits for a cook." }] } },
    ]
      .map((entree) => `${JSON.stringify({ sessionId: SESSION, isSidechain: false, ...entree })}\n`)
      .join(""),
  );
  const env = { PATH: outils, HOME: racine, CLAUDE_CONFIG_DIR: claude, FAUX_SECOND_FEU: feu };
  const telephones = ouvrirTelephones(join(racine, "telephones"));
  const seconds = secondsDeLaStation({ racine, env, pasMs: 10 });
  const ouvert = await ouvrirGuichet({ telephones, seconds, hote: "127.0.0.1", port: 0 });
  t.after(async () => {
    seconds.arreter();
    await ouvert.fermer();
    telephones.fermer();
    rmSync(racine, { recursive: true, force: true });
  });
  const { jeton } = telephones.appairer(telephones.emettre().code, { nom: "pixel-8", machine: "Android 16" });
  // Ce que le pont fait par le HTTP natif : la demande, avec le jeton gardé.
  const demander = async (chemin: string, init: RequestInit = {}): Promise<Reponse> => {
    const reponse = await fetch(`http://127.0.0.1:${ouvert.port}${chemin}`, { ...init, headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" } });
    return { status: reponse.status, data: await reponse.text() };
  };
  return {
    requete: (chemin: string) => (chemin === "/projects/parade/second" ? demander(chemin) : guichet().requete(chemin)),
    envoyer: (chemin: string, corps: unknown) => demander(chemin, { method: "POST", body: JSON.stringify(corps) }),
    // Le second écrit sa réponse.
    repondre: () => writeFileSync(feu, ""),
    // Ce que le second du desktop lit de la même session.
    duDesktop: () => lireLaConversation({ dossier, claude }).messages.map(({ from, text }) => `${from}: ${text}`),
  };
}

// Attend un fait, pas une durée : la garde n'est là que pour qu'un test cassé finisse par le dire.
async function jusqua(condition: () => boolean): Promise<void> {
  const fin = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > fin) assert.fail("le fait attendu n'est jamais venu");
    await new Promise((fait) => setTimeout(fait, 10));
  }
}

describe("depuis le téléphone, l'échange avec le second est celui du second du desktop", { skip: process.platform === "win32" && "la doublure de `claude` est un script shell" }, () => {
  test("le message part au vrai guichet, la réponse du second arrive au téléphone, et le desktop lit le même échange dans la même session", async (t) => {
    const station = await stationReelle(t);
    // Le pas de la réponse est joué tout de suite ; la lecture de la station toutes les trente secondes ne l'est pas.
    const { vue } = await telephone(station, (faire, ms) => {
      if (ms !== PAS_DE_LA_REPONSE_MS) return () => undefined;
      const minuterie = setTimeout(faire, 10);
      return () => clearTimeout(minuterie);
    });
    assert.deepEqual(messages(vue), ["you: What blocks #15?", "second: Nothing: it waits for a cook."]);
    saisie(vue).value = "Merge #12, I grant it.";
    saisie(vue).declencher("input");
    await repos();
    envoyer(vue).click();
    await jusqua(() => messages(vue).includes("you: Merge #12, I grant it."));
    assert.equal(messages(vue).at(-1), `(second repond) ${REPOND}`);
    station.repondre();
    await jusqua(() => messages(vue).at(-1) === "second: Heard: Merge #12, I grant it.");
    assert.deepEqual(issue(vue), []);
    assert.deepEqual(station.duDesktop(), ["chef: What blocks #15?", "second: Nothing: it waits for a cook.", "chef: Merge #12, I grant it.", "second: Heard: Merge #12, I grant it."]);
  });
});
