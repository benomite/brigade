// L'accueil : la vue d'ensemble de brigade (#870) — une ligne par projet, une par station, et en
// bas une ligne de santé, Max et GitHub. On n'y agit pas : un clic sur une ligne ouvre sa page, et
// c'est là que tout se décide. Chaque ligne dit ce qui s'y passe en quelques mots de l'app, avec sa
// pastille — jamais une commande, jamais le texte d'une erreur : ce qu'elle tait se lit au survol,
// dans les mots de l'app aussi.
//
// Un projet : rouge quand il est bloqué — base rouge, cuisine arrêtée ou retenue, runtime éteint,
// box injoignable ; jaune quand une décision attend le chef ; vert sinon ; gris tant que rien n'en
// est lu. Sa phrase dit, dans cet ordre, ce qui bloque, ce qui attend le chef — combien, depuis
// quand —, puis ce qui cuit ; et, quand la fiabilité de ses cooks a dérivé, d'un mot : « drifting » (#987).
// Une station : son état (« online », « offline for 12 min »), ce qu'elle fait — ses cooks,
// une mise à jour ratée, sa connexion Max perdue —, et les projets qu'elle porte. Sa machine et sa
// version ne se lisent qu'au survol.
//
// Ce module ne lance rien et ne demande rien de neuf à personne : il dit, d'après ce que les veilles
// ont déjà lu — `faits` de chaque projet, son `status` quand il est lu, les stations et leurs
// projets sur GitHub. Un état qui n'a pas été lu n'est jamais dit sain.
import { CONNECTION, KITCHEN, headsOf } from "./alerts.ts";
import type { Shown } from "./awaiting.ts";
import type { Reading } from "./box.ts";
import { COMMAND as FACTS, understand, isOutsideLine, type CallsGithub, type Facts } from "./facts.ts";
import { driftOf } from "./reliability.ts";
import { hour, hourShort } from "./format.ts";
import type { SeenOfProjects } from "./projects/projects.ts";
import { capsOf, type CapSeen } from "./cap.ts";
import { reasonOf, type ReasonOfStation } from "./stations/reason.ts";
import { LIMIT, type StationVue, type SeenOfStations } from "./stations/stations.ts";
import { blockedOf, saysALHome } from "./vue/rail-blocked/rail-blocked.ts";
import { inProgress, SAME_REASON, OUTAGES_OUTSIDE_PAUSE } from "./vue/pause-quota/line-of-the-pause.js";

// Les tons des pastilles de la peau (vue.css) : vert, jaune — l'orange de la maquette —, rouge, gris ; bleu, le calme de la
// pause de quota GitHub du compte (vue/pause-quota/, #3482).
export type Your = "vert" | "jaune" | "rouge" | "gris" | "bleu";
// Une ligne de l'accueil : ce qu'elle dit, sa pastille, et ce qui se lit au survol.
// `attend` : combien de décisions attendent le chef, absent quand aucune (la pastille « N awaiting you » de l'accueil, #2912).
export type LineOfProject = { nom: string; ton: Your; dit: string; survol: string; attend?: number };
// Une station a aussi `phrase` : son état en une phrase, en tête de sa page (#877) — « online · 2 cooks
// running », « offline for 12 min ». Ni sa machine, ni sa version, ni ses projets.
// `raison` : une station installée qui ne cuit pas encore dit pourquoi, en une phrase qui nomme le geste (stations/reason.ts, #1758).
// `note` : sous la phrase, une station en ligne qui ne fait la cuisine d'aucun projet dit en une phrase si c'est normal.
// `plafond` : ce que le `status` d'un projet dit de son plafond de cooks (cap.ts) ;
// `reglable` : un projet que l'app lit nomme son plafond, la page peut donc le régler.
export type LineOfStation = { id: string; nom: string; ton: Your; dit: string; phrase: string; survol: string; note?: string; raison?: ReasonOfStation; plafond?: CapSeen; reglable?: true; appels?: CallsGithub };
export type Health = { ton: Your; dit: string; survol: string };
// `stations` : absentes, la première lecture sur GitHub est en route.
// `plafonds` : par projet dont le `status` est lu, et par station qu'il nomme, le plafond de cooks de ce projet sur elle
// et ce qui la retient (ticket 1292) — la ligne de station de l'onglet Stations les dit et les règle.
export type CapsOfStation = { plafond: CapSeen };
export type Home = { projets: LineOfProject[]; stations?: LineOfStation[]; sante: Health; plafonds?: Record<string, Record<string, CapsOfStation>> };

// Un projet du fichier, tel que l'accueil le nomme : `servi` faux, aucune station ne le sert, et rien n'en est lu.
export type ProjectOfTheHome = { nom: string; servi: boolean };
// Ce que la dernière lecture de `faits` a donné d'un projet : ses faits, une box qui n'a pas été
// jointe, ou une box jointe qui n'a pas rendu ce que l'app lit.
export type ReadFacts = { a: string } & ({ faits: Facts } | { injoignable: true } | { illisible: true });
// Le dernier `status` lu d'un projet, son bloc `attend` mis à part.
export type StatusRead = { texte: string; attend?: string };

const s = (howMany: number) => (howMany > 1 ? "s" : "");
// Une durée que la box écrit (runtime/src/etat.ts, `duree`) — « 40 s », « 12 min », « 3 h 05 », « 2 j » —, dans les mots de l'app.
const enEnglish = (duration: string) => duration.replace(/ j$/, " d");

// --- Un projet -------------------------------------------------------------------

// Ce qui retient la cuisine, d'après les lignes de tête de `status` (alerts.ts lit les mêmes).
function causes(status: string): string[] {
  return headsOf(status).flatMap(({ titre: title, valeur: value }) => {
    if (KITCHEN.includes(title) && /disjoncteur OUVERT|breaker OPEN/.test(value)) return ["breaker open"];
    if (title === "stations") return ["no station declared"];
    if (CONNECTION.includes(title)) return ["Max connection down"];
    if (title === "setup" && /^(?:BLOQUÉ|BLOCKED)(?![\p{L}\p{N}_])/u.test(value)) return ["project setup blocked"];
    return [];
  });
}
const baseRed = (status: string | undefined) => status !== undefined && headsOf(status).some(({ titre: title, valeur: value }) => title === "base" && /^(?:ROUGE|RED)(?![\p{L}\p{N}_])/u.test(value));
// Le ticket qui répare la base rouge, quand `status` le dit en tête (runtime/src/etat.ts, `RIEN_NE_CUIT`),
// en anglais ou en français (#928).
const repair = (status: string | undefined): number | undefined => {
  const [, english, french] = /^(?:nothing cooks: base red since .*, repair #(\d+) in progress|rien ne cuit : base rouge depuis .*, réparation #(\d+) en cours)$/m.exec(status ?? "") ?? [];
  const ticket = english ?? french;
  return ticket === undefined ? undefined : Number(ticket);
};

// Ce qui bloque le projet, le plus grave d'abord : rien ne le débloque sans le chef.
function blockers(facts: Facts, status: string | undefined): string[] {
  const red = baseRed(status) ? [repair(status) === undefined ? "base red" : `base red · #${repair(status)} being repaired`] : [];
  switch (facts.etat) {
    case "éteinte":
      return ["runtime stopped", ...red];
    case "arrêtée":
      return ["kitchen stopped", ...red];
    case "retenue": {
      // Sans `status` lu, la cause n'est pas dite : la cuisine l'est, retenue.
      const readEntries = status === undefined ? [] : causes(status);
      return red.length + readEntries.length === 0 ? ["kitchen held"] : [...red, ...readEntries];
    }
    default:
      return red;
  }
}

// Depuis quand la plus ancienne décision attend le chef : la tête du bloc `attend` (runtime/src/attend.ts, `decrireAttentes`),
// en français ou en anglais (`awaiting   2 decisions await the chef — the oldest for 3 d`, #927).
const since = (awaiting: string | undefined): string | undefined => {
  const [, duration] = /^(?:attend +\d+ décisions? attend(?:ent)? le chef(?: — la plus ancienne)? depuis|awaiting +\d+ decisions? awaits? the chef — (?:the oldest )?for) (.+)$/m.exec(awaiting ?? "") ?? [];
  return duration === undefined ? undefined : enEnglish(duration.trim());
};

// Ce qui attend le chef : combien de décisions, depuis quand ; et, quand toute la cuisine les attend, que rien ne cuit d'ici là.
function awaiting(facts: Facts, status: StatusRead | undefined): string[] {
  const howMany = facts.compteurs.attend;
  if (howMany === 0) return [];
  const duration = since(status?.attend);
  const said = `${howMany} decision${s(howMany)} await${howMany === 1 ? "s" : ""} you${duration === undefined ? "" : `, for ${duration}`}`;
  return [facts.urgence == null ? said : `${said} — nothing cooks until then`];
}

// Ce qui cuit : les tickets de ses cooks — la réparation de la base est déjà dite —, sinon ce qui est à la pass.
function cooked(facts: Facts, repaired: number | undefined): string[] {
  const tickets = facts.cooks?.map(({ ticket }) => ticket).filter((ticket) => ticket !== repaired);
  if (tickets === undefined) return facts.compteurs.auTravail > 0 ? [`${facts.compteurs.auTravail} at work`] : [];
  if (tickets.length > 2) return [`${tickets.length} cooks at work`];
  if (tickets.length > 0) return [`${tickets.map((ticket) => `#${ticket}`).join(" and ")} cooking`];
  return facts.compteurs.aLaPass > 0 ? [`${facts.compteurs.aLaPass} at the pass`] : [];
}

export function lineOfProject(project: ProjectOfTheHome, readOne: ReadFacts | undefined, status: StatusRead | undefined): LineOfProject {
  const { nom: name } = project;
  // Le rail bloqué (vue/rail-blocked/, #3358) : des tickets qu'aucun manager ne prend — aussi quand aucune station ne le
  // sert, puisque c'est sa cause. Il bloque le projet, en tête de sa ligne ; sa phrase entière au survol.
  // Pendant la pause de quota GitHub du compte (vue/pause-quota/, #3482), le projet dit seulement qu'il est en pause pour la
  // même raison, d'une pastille calme : son rail bloqué n'en est pas un — sauf une panne que la pause n'explique pas.
  const enPause = readOne !== undefined && "faits" in readOne && inProgress(readOne.faits.pauseQuota, Date.parse(readOne.faits.lu));
  const blockedRead = readOne !== undefined && "faits" in readOne ? blockedOf(readOne.faits.railBloque) : undefined;
  const railBlocked = enPause && blockedRead !== undefined && !OUTAGES_OUTSIDE_PAUSE.includes(blockedRead.cause) ? undefined : blockedRead;
  if (!project.servi && railBlocked === undefined) return { nom: name, ton: "gris", dit: "no station: nothing is read", survol: "no station serves this project yet — open it to see what is missing" };
  if (readOne === undefined) return { nom: name, ton: "gris", dit: "first read in progress…", survol: "the app reads every project's station every 30 s" };
  if ("injoignable" in readOne) return { nom: name, ton: "rouge", dit: "station unreachable", survol: `its station did not answer at ${hour(readOne.a)} — the app tries again every 30 s; open it to see why` };
  if ("illisible" in readOne) return { nom: name, ton: "gris", dit: "not read: its station does not answer as the app expects", survol: `tried at ${hour(readOne.a)} — open it to see what its station returned` };
  const { faits: facts } = readOne;
  const blocking = [...(railBlocked === undefined ? [] : [saysALHome(railBlocked, Date.parse(facts.lu))]), ...blockers(facts, status?.texte)];
  const expected = awaiting(facts, status);
  // La dérive se lit dans les lignes `drift` de `status` : un mot sur la ligne, ce qu'elle dit au survol.
  // Elle ne change pas la pastille — rien n'attend le chef, rien ne bloque.
  const drift = status === undefined ? [] : driftOf(status.texte);
  const enPauseOnly = enPause && blocking.length === 0;
  const parties = [...blocking, ...(enPauseOnly ? [SAME_REASON] : []), ...expected, ...cooked(facts, repair(status?.texte))];
  const said = parties.length === 0 ? "nothing cooking, nothing waits for you" : parties.join(" · ");
  return {
    nom: name,
    ton: blocking.length > 0 ? "rouge" : expected.length > 0 ? "jaune" : enPauseOnly ? "bleu" : "vert",
    dit: drift.length === 0 ? said : `${said} · drifting`,
    survol: `read at ${hour(readOne.a)} — ${railBlocked === undefined ? "" : `${railBlocked.phrase} — `}${drift.length === 0 ? "" : `reliability drifting: ${drift.join(" · ")} — `}open it to act`,
    ...(facts.compteurs.attend > 0 ? { attend: facts.compteurs.attend } : {}),
  };
}

// --- Une station -----------------------------------------------------------------

// Un projet ouvert dans l'app dont la cuisine tourne sur une autre station : `station` la nomme.
export type KitchenElsewhere = { projet: string; station: string };

// Ce que la station dit des cuisines portées ailleurs, quand c'est l'ordinateur de l'app : « your 3 projects cook on parade-box ».
function kitchensElsewhere(elsewhere: readonly KitchenElsewhere[]): string {
  const stations = [...new Set(elsewhere.map(({ station }) => station))];
  return `your ${elsewhere.length === 1 ? "project cooks" : `${elsewhere.length} projects cook`} on ${stations.join(", ")}`;
}

export const NOT_KITCHEN_NOT = "does not cook";

// La ligne d'une station qui ne cuisine pas : son état, et la mention. Jamais de cooks.
function lineOfPhone(station: StationVue, hover: string): LineOfStation {
  const { id, nom: name } = station;
  const enLine = station.etat === "en-ligne";
  return {
    id,
    nom: name,
    ton: enLine ? "vert" : "gris",
    dit: [station.dit, NOT_KITCHEN_NOT].join(" · "),
    ...(enLine ? {} : { raison: reasonOf("hors-ligne", name) }),
    phrase: `${station.dit} · ${NOT_KITCHEN_NOT}`,
    survol: hover,
    ...(enLine ? { note: "A phone: it runs no cook, and is never offered to run a project's cooks." } : {}),
  };
}

// `cooks` : ceux que les projets disent en cours sur elle ;
// `ailleurs` : si c'est l'ordinateur de l'app, ses projets ouverts dont la cuisine tourne sur une autre station.
export function lineOfStation(station: StationVue, cooks: number, elsewhere: readonly KitchenElsewhere[] = []): LineOfStation {
  const { id, nom: name } = station;
  const hover = [station.machine, station.version === "" ? "" : `version ${station.version}`].filter((part) => part !== "").join(" · ");
  const withoutKitchen = station.projets.length === 0;
  // Un téléphone (#1158) ne fait tourner aucun cook : sa ligne le dit, et il n'a aucun projet à attendre.
  if (station.cuisine === false) return lineOfPhone(station, hover);
  const projects = withoutKitchen ? "no project" : station.projets.join(", ");
  if (station.etat !== "en-ligne") return { id, nom: name, ton: "gris", dit: [station.dit, ...(station.etat === "illisible" ? [] : [projects])].join(" · "), phrase: station.dit, raison: reasonOf(station.etat === "illisible" ? "illisible" : "hors-ligne", name), survol: hover === "" ? "its state on GitHub cannot be read — open it to see why" : hover };
  const max = station.pannes.some(({ sujet: subject }) => subject === "connexion-max");
  const update = station.pannes.some(({ sujet: subject }) => subject === "mise-a-jour");
  const done = [...(max ? ["Max connection lost"] : []), ...(update ? ["update failed"] : []), ...(cooks > 0 ? [`${cooks} cook${s(cooks)}`] : [])];
  return {
    id,
    nom: name,
    ton: max ? "rouge" : update ? "jaune" : "vert",
    dit: [station.dit, ...(done.length === 0 ? ["idle"] : done), withoutKitchen ? "runs no kitchen" : projects].join(" · "),
    phrase: `${station.dit} · ${cooks === 0 ? "no cook running" : `${cooks} cook${s(cooks)} running`}`,
    ...(withoutKitchen && elsewhere.length === 0 ? { raison: reasonOf("sans-projet", name) } : {}),
    survol: withoutKitchen && elsewhere.length > 0 ? [hover, kitchensElsewhere(elsewhere)].filter((part) => part !== "").join(" · ") : hover,
    ...(withoutKitchen
      ? {
          note:
            elsewhere.length > 0
              ? `Normal: this computer drives your projects, whose kitchens run on ${[...new Set(elsewhere.map(({ station }) => station))].join(", ")} — giving it one would add a place for their cooks to run, nothing requires it.`
              : "Normal: a station that runs no kitchen simply waits — giving it a project would let it cook that project, nothing requires it.",
        }
      : {}),
  };
}

// --- La ligne de santé -------------------------------------------------------------

// L'état d'une des deux choses que la ligne dit : bon, en panne — et ce qui ne va pas, en une phrase —, ou pas su.
type State = { bon: true } | { panne: string[] } | { pas: string };

// Ce que les blocs `attend` des projets disent du jeton et de la session Max (runtime/src/attend.ts) : une entrée qui ne porte pas de ticket.
// Le bloc se lit en français ou en anglais (`token  for …`, #927).
function maxOfBlocks(blocks: readonly string[], now: number): string[] {
  return blocks.flatMap((block) =>
    block.split("\n").flatMap((line) => {
      const [, what, said = ""] = /^ {2}(jeton|token|session) {2}(?:depuis|for) \S.*? {2}(.*)$/.exec(line) ?? [];
      if (what === "session") return [/^(?:renouvellement|Max session renewal)/.test(said) ? "Max: session renewal failed" : "Max: session about to expire"];
      if (what !== "jeton" && what !== "token") return [];
      if (/ÉCHU|EXPIRED/.test(said)) return ["Max: token expired, to redo"];
      const [, deadline] = /(?:il échoit le|it expires on) (\S+?),? /.exec(said) ?? [];
      const days = deadline === undefined ? Number.NaN : Math.ceil((Date.parse(deadline) - now) / 86_400_000);
      return [Number.isFinite(days) ? `Max: token to redo within ${Math.max(days, 0)} d` : "Max: token's expiry unknown"];
    }),
  );
}

function ofMax(stations: readonly StationVue[] | undefined, blocks: readonly string[], now: number): State {
  const lost = (stations ?? []).filter(({ max }) => max === "perdue").map(({ nom: name }) => name);
  const outages = [...new Set([...(lost.length === 0 ? [] : [`Max: connection lost on ${lost.join(", ")}`]), ...maxOfBlocks(blocks, now)])];
  if (outages.length > 0) return { panne: outages };
  if ((stations ?? []).some(({ max }) => max === "connectee")) return { bon: true };
  return { pas: stations === undefined ? "your stations are not read yet" : "no online station says how its Max connection is" };
}

// Ce qu'une lecture ratée sur GitHub dit, dans les mots de l'app : jamais ce que `gh` a répondu.
function asGitHub(without: string, limit: SeenOfStations["limite"]): string {
  if (limit !== undefined || LIMIT.test(without)) return `GitHub limits calls${limit?.reprise == null ? "" : `, back around ${hourShort(limit.reprise)}`}`;
  if (/gave no answer within/.test(without)) return "GitHub does not answer";
  if (/is not on this computer/.test(without)) return "GitHub: its tool is missing on this computer";
  if (/auth|log ?in|credentials|HTTP 401/i.test(without)) return "GitHub: this computer is not signed in";
  if (/error connecting|could not resolve|network|timeout/i.test(without)) return "GitHub cannot be reached";
  return "GitHub could not be read";
}

function ofGitHub(stations: SeenOfStations | undefined, projects: SeenOfProjects | undefined): State {
  if (stations === undefined) return { pas: "the first reading of your stations on GitHub is in progress" };
  const outages = [...new Set([...(stations.sans === undefined ? [] : [asGitHub(stations.sans, stations.limite)]), ...(projects?.sans === undefined ? [] : [asGitHub(projects.sans, undefined)])])];
  return outages.length === 0 ? { bon: true } : { panne: outages };
}

export function health(stations: SeenOfStations | undefined, projects: SeenOfProjects | undefined, blocks: readonly string[], now: number): Health {
  const states = [["Max", ofMax(stations?.stations, blocks, now)], ["GitHub", ofGitHub(stations, projects)]] as const;
  const said = states.flatMap(([name, state]) => ("bon" in state ? [`${name} ✓`] : "panne" in state ? state.panne : [`${name} ?`])).join("  ·  ");
  const hover = [
    "Max: what your online stations publish of their connection, and what your projects' stations say of its token",
    "GitHub: your stations are read there every 30 s",
    ...states.flatMap(([name, state]) => ("pas" in state ? [`${name} not checked: ${state.pas}`] : [])),
  ].join("\n");
  const your = states.some(([, state]) => "panne" in state) ? "rouge" : states.every(([, state]) => "bon" in state) ? "vert" : "gris";
  return { ton: your, dit: said, survol: hover };
}

// --- Ce qui est tenu ---------------------------------------------------------------

// `locale` : le gist de la station de cet ordinateur, nul quand l'app n'en a pas (un poste sur un téléphone).
export type OptionsHome = { projets: () => readonly ProjectOfTheHome[]; locale?: () => string | null; maintenant?: () => number };

// Les dernières lectures de chaque projet et des stations, tenues par le process principal, et
// l'accueil qui s'en dessine. Chaque réception rend l'accueil à redessiner — rien, quand il dit la
// même chose qu'avant : rien ne bouge. Un `status` que plus rien ne rafraîchit est lâché : la
// ligne redit alors ce que `faits` seul en dit.
export function holdHome({ projets: projects, locale = () => null, maintenant: now = Date.now }: OptionsHome) {
  const facts = new Map<string, ReadFacts>();
  const statuses = new Map<string, StatusRead>();
  let stations: SeenOfStations | undefined;
  let projectsOfStations: SeenOfProjects | undefined;
  let said: string | undefined;

  const seenOne = (): Home => {
    const list = projects();
    const readOnes = list.map(({ nom: name }) => facts.get(name)).flatMap((readOne) => (readOne !== undefined && "faits" in readOne ? [readOne.faits] : []));
    const cooks = (station: string) => readOnes.reduce((total, { cooks = [] }) => total + cooks.filter((cook) => cook.station === station).length, 0);
    // Les projets ouverts ici dont la cuisine tourne sur une autre station : celle qui porte son suivi, à défaut une autre qui le porte.
    const elsewhereOf = (locale_: string): KitchenElsewhere[] =>
      list.flatMap(({ nom: name }) => {
        const tracked = projectsOfStations?.projets.find((project) => project.nom === name)?.suiviPar;
        const scope = (tracked !== undefined && tracked.id !== locale_ ? tracked.nom : undefined) ?? stations?.stations.find(({ id, projets: doors }) => id !== locale_ && doors.includes(name))?.nom;
        return scope === undefined ? [] : [{ projet: name, station: scope }];
      });
    const here = locale();
    const caps = [...statuses.values()].map(({ texte: text }) => capsOf(text));
    // Ce que dit le premier projet lu qui nomme la station : un plafond se règle pour tous, et ils disent le même.
    const first = <T>(saidOnes: readonly Map<string, T>[], station: string) => saidOnes.find((readOnes) => readOnes.has(station))?.get(station);
    // Les appels de la box à GitHub : ceux que publie le premier projet lu qui nomme la station et dont le runtime les donne.
    const callsOf = (station: string): CallsGithub | undefined => {
      for (const [name, { texte: text }] of statuses) {
        const readOne = facts.get(name);
        if (readOne !== undefined && "faits" in readOne && readOne.faits.appelsGithub !== undefined && capsOf(text).has(station)) return readOne.faits.appelsGithub;
      }
      return undefined;
    };
    const detail = (station: StationVue): Partial<LineOfStation> => {
      const cap = first(caps, station.nom);
      const calls = callsOf(station.nom);
      return { ...(cap === undefined ? {} : { plafond: cap, reglable: true as const }), ...(calls === undefined ? {} : { appels: calls }) };
    };
    const capsOfProjects = Object.fromEntries(
      [...statuses].map(([name, { texte: text }]) => [name, Object.fromEntries([...capsOf(text)].map(([station, cap]) => [station, { plafond: cap }]))]),
    );
    return {
      projets: list.map((project) => lineOfProject(project, facts.get(project.nom), statuses.get(project.nom))),
      ...(Object.keys(capsOfProjects).length === 0 ? {} : { plafonds: capsOfProjects }),
      ...(stations === undefined ? {} : { stations: stations.stations.map((station) => ({ ...lineOfStation(station, cooks(station.nom), station.id === here ? elsewhereOf(station.id) : []), ...detail(station) })) }),
      sante: health(
        stations,
        projectsOfStations,
        [...statuses.values()].flatMap(({ attend: awaiting }) => (awaiting === undefined ? [] : [awaiting])),
        now(),
      ),
    };
  };
  // L'accueil, s'il a changé depuis le dernier rendu.
  const change = (): Home | undefined => {
    const fresh = seenOne();
    const text = JSON.stringify(fresh);
    if (text === said) return undefined;
    said = text;
    return fresh;
  };

  return {
    vu: seenOne,
    // Les projets dont le `status` lu nomme le plafond de cette station : ce sont leurs box qui reçoivent son réglage.
    projetsDe: (station: string): string[] => [...statuses].filter(([, { texte: text }]) => capsOf(text).has(station)).map(([name]) => name),
    // Le fichier des projets a changé : leurs lignes suivent.
    relire: change,
    // Une lecture de `faits`.
    // Hors ligne (#1818), la ligne garde ce qui a été lu en dernier : sa station n'y est pour rien.
    faits(reading: Reading): Home | undefined {
      const { projet: project, a } = reading;
      if (isOutsideLine(reading)) return undefined;
      if ("erreur" in reading) facts.set(project, reading.atteinte ? { a, illisible: true } : { a, injoignable: true });
      else {
        const readOne = understand(reading.sorties.find(({ commande: command }) => command === FACTS)?.texte ?? "");
        facts.set(project, "informe" in readOne ? { a, illisible: true } : { a, faits: readOne });
      }
      return change();
    },
    // Une lecture de `status`, son bloc `attend` mis à part. Ratée, elle ne dit plus rien ; hors ligne, rien n'en change (#1818).
    status(shownOne: Shown): Home | undefined {
      if (isOutsideLine(shownOne)) return undefined;
      const text = "erreur" in shownOne ? undefined : shownOne.sorties.find(({ commande: command }) => command === "status")?.texte;
      if ("erreur" in shownOne || text === undefined) statuses.delete(shownOne.projet);
      else statuses.set(shownOne.projet, { texte: text, ...(shownOne.attend === undefined ? {} : { attend: shownOne.attend }) });
      return change();
    },
    // La veille de `status` ne lit plus que ces projets : le `status` des autres n'est plus rafraîchi.
    veiller(readOnes: readonly string[]): Home | undefined {
      for (const project of statuses.keys()) if (!readOnes.includes(project)) statuses.delete(project);
      return change();
    },
    // La barre est reposée : `faits` va être relu pour chacun.
    oublier(): Home | undefined {
      facts.clear();
      return change();
    },
    stations(readEntries: SeenOfStations): Home | undefined {
      stations = readEntries;
      return change();
    },
    projetsDesStations(readOnes: SeenOfProjects): Home | undefined {
      projectsOfStations = readOnes;
      return change();
    },
  };
}
