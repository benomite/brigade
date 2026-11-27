// @ts-check
// Les GitHub Apps de la station de cet ordinateur, dans Settings, sous cette machine (ticket 2317, épique 2313) : le
// chef remet à la station l'App ID et la clé privée de l'App de chaque rôle — cook, pass, manager —, un rôle à la fois.
// Une ligne d'en-tête dit que les clés restent sur cette station ; puis une ligne par rôle : son état, `configured` ou
// `not configured`, et son contrôle — l'App ID, la clé (collée, ou lue du fichier .pem choisi). Chaque ligne est la
// rangée de réglage de l'app (components/setting, ticket 2920) : pas de « save », l'App se range dès que son contrôle
// change — le `change` d'un des deux champs, ou un .pem choisi — une fois la clé écrite ; l'App ID est jugé alors.
//
// La clé n'est jamais rendue : l'écran ne la reçoit d'aucune lecture — la station dit seulement si elle l'a —, et une
// fois rangée, elle quitte l'état de l'écran et son champ se vide. Lue d'un fichier, elle n'est pas écrite dans le
// champ : seul le nom du fichier se lit.
//
// Ce qui ne se range pas ne part pas : un App ID vide (ou qui n'en a pas la forme) ou une clé qui n'est pas une clé
// privée PEM se disent sous leur champ, et rien n'est écrit. Le reste est vérifié par la station, qui range l'App
// (runtime/src/identites-stations.ts, `rangerApp`) : son refus se dit sous la ligne, en une ligne, sa suite au survol.
//
// `tenirLesIdentites` garde l'état de l'écran et ses gestes ; `poserLesIdentites` le dessine. Ni l'un ni l'autre ne
// touche `document` : la vue leur donne une fabrique (bricks.js).

import { buttonAction, hover } from "./bricks.js";
import { lineError } from "./components/line-error/line-error.js";
import { saysOfSetting, rowOfSetting } from "./components/setting/setting.js";
import { THIS_COMPUTER, RECORDING, NOT_REACHED, READING } from "./lexicon.js";

/** @typedef {import("./bricks.js").Fabrique} Fabrique */
/** @typedef {"cook" | "pass" | "manager"} Role */
/**
 * Ce que la station a de chaque rôle : l'ID de son App, et si sa clé est là — jamais la clé (`appsRangees`).
 * @typedef {{ role: Role, id: string | null, cle: boolean }} AppOfRole
 */
/** @typedef {{ apps: AppOfRole[] } | { refus: string }} ReadOfApps */
/** @typedef {{ rangee: { role: string, id: string } } | { refus: string }} RenderedOfCleanup */
/**
 * Ce que l'écran demande au process principal. Absents, ou `appsDeLaStation` qui ne rend rien : cet appareil n'a pas
 * de station (un téléphone), et rien ne se pose.
 * @typedef {{
 *   appsDeLaStation?(): Promise<ReadOfApps | undefined>,
 *   rangerUneApp?(role: Role, id: string, key: string): Promise<RenderedOfCleanup>,
 * }} BridgeOfIdentities
 */
/**
 * Ce que le chef a saisi pour un rôle. `fichier` : le nom du .pem dont la clé a été lue ; `erreurId`, `erreurCle` :
 * ce qui est dit sous chaque champ ; `refus` : ce que la station a refusé ; `rangee` : elle vient de la ranger.
 * @typedef {{ id: string, cle: string, fichier?: string, erreurId?: string, erreurCle?: string, refus?: { ligne: string, detail: string }, attendCle?: boolean, enCours: boolean, rangee: boolean }} Input
 */
/** @typedef {{ lecture?: ReadOfApps, saisies: Record<Role, Input> }} StateOfIdentities */
/**
 * @typedef {{
 *   saisirId(role: Role, text: string): void,
 *   saisirCle(role: Role, text: string): void,
 *   choisirLeFichier(role: Role, name: string, text: string): void,
 *   enregistrer(role: Role): void,
 * }} ActionsOfIdentities
 */

/** @type {readonly Role[]} */
export const ROLES = ["cook", "pass", "manager"];

// Les mots de l'écran.
export const TITLE = "GitHub Apps";
export const GUARD = "The keys stay on this station: they are never sent to the repository.";
export const HELP =
  "Each role acts on GitHub under its own App, created once on your GitHub account. Give this station each App's ID and private key: projects it opens from then on act under them. Nothing is copied to the project, its state or its backups.";
export const NAME = (/** @type {Role} */ role) => `${role} App`;
/** @type {Readonly<Record<Role, string>>} */
export const ROLE_SAYS = {
  cook: "opens the cooks' pull requests",
  pass: "claims, labels, judges and merges the deliveries",
  manager: "qualifies and splits the issues, and keeps the rail",
};
export const CONFIGURE = "configured";
export const NOT_CONFIGURE = "not configured";
export const APP = (/** @type {string} */ id) => `App ${id}`;
export const WITHOUT_KEY = "no key stored";
export const FIELD_ID = "App ID";
export const FIELD_KEY = "paste the private key, or choose its .pem file";
export const CHOOSE = "choose the .pem file";
export const CHOSEN = (/** @type {string} */ file) => `${file} chosen`;
export { RECORDING };
export const ROW = "stored: its key is not shown again";
export const KEY_EXPECTED = "not applied yet: an App ID is stored with its private key — paste it, or choose its .pem file";
export const WITHOUT_ID = "nothing was written: enter the App's ID";
export const NOT_ONE_ID = "nothing was written: an App ID is the number on the App's page (or its Client ID)";
export const NOT_ONE_KEY = "nothing was written: this is not a private key — give the .pem file downloaded from the App's page";
export const UNREADABLE = NOT_REACHED("this station's Apps");
export const UNREACHABLE = NOT_REACHED(`${THIS_COMPUTER}'s station`);

// L'App ID tel que la station l'accepte : son « App ID », un nombre, ou son « Client ID » (identites.ts, `ID_D_APP`).
const SHAPE_OF_ID = /^[A-Za-z0-9.]+$/;
// Une clé privée PEM : son en-tête, un corps, et le pied du même type. Ce que la station en lit est vérifié chez elle.
const SHAPE_OF_KEY = /^\s*-----BEGIN ([A-Z0-9 ]*)PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END \1PRIVATE KEY-----\s*$/;

export const isOneKey = (/** @type {string} */ text) => SHAPE_OF_KEY.test(text);

// Un refus de la station en une ligne : sa première proposition ; ce qui suit son tiret, au survol.
/** @param {string} refusal */
export function refusalSays(refusal) {
  const [line = refusal, ...suite] = refusal.split(" — ");
  return { ligne: `nothing was written: ${line.replace(/^brigade: /, "")}`, detail: suite.join(" — ") };
}

/** @returns {Input} */
const empty = () => ({ id: "", cle: "", enCours: false, rangee: false });

/** @param {ReadOfApps | undefined} reading @param {Role} role */
const appOf = (reading, role) => (reading !== undefined && "apps" in reading ? reading.apps.find((app) => app.role === role) : undefined);

// L'état de l'écran et ses gestes. `rendre` : l'état a changé, l'écran se redessine. Une saisie ne le redessine pas :
// le champ tient déjà ce que le chef tape.
/** @param {{ pont: BridgeOfIdentities, rendre: () => void }} options */
export function holdTheIdentities({ pont: bridge, rendre: render }) {
  /** @type {StateOfIdentities | undefined} */
  let state;
  let tour = 0;

  /** @returns {StateOfIdentities} */
  const fresh = () => ({ saisies: { cook: empty(), pass: empty(), manager: empty() } });

  // Ce que la station a de chaque rôle. Une lecture qui ne rend rien : pas de station ici, l'écran se retire.
  async function read() {
    const itsOwn = ++tour;
    if (typeof bridge.appsDeLaStation !== "function") {
      state = undefined;
      return render();
    }
    /** @type {ReadOfApps | undefined} */
    const readEntry = await bridge.appsDeLaStation().catch((error) => ({ refus: error instanceof Error ? error.message : String(error) }));
    if (itsOwn !== tour) return;
    if (readEntry === undefined) state = undefined;
    else {
      state ??= fresh();
      state.lecture = readEntry;
      // L'App ID rangé préremplit son champ tant que le chef n'en tape pas un autre : il n'a rien de secret.
      for (const role of ROLES) {
        const input = state.saisies[role];
        const id = appOf(readEntry, role)?.id ?? null;
        if (input.id === "" && id !== null) input.id = id;
      }
    }
    render();
  }

  /** @param {Role} role @param {Partial<Input>} change */
  function change(role, change) {
    if (state === undefined) return;
    const input = state.saisies[role];
    Object.assign(input, change);
    input.rangee = false;
    delete input.refus;
  }

  return {
    /** @returns {StateOfIdentities | undefined} */
    get etat() {
      return state;
    },
    lire: read,
    /** @type {ActionsOfIdentities} */
    gestes: {
      saisirId(role, text) {
        change(role, { id: text });
        if (state !== undefined) delete state.saisies[role].erreurId;
      },
      // Collée, la clé remplace celle d'un fichier choisi.
      saisirCle(role, text) {
        change(role, { cle: text });
        if (state === undefined) return;
        delete state.saisies[role].fichier;
        delete state.saisies[role].erreurCle;
      },
      choisirLeFichier(role, name, text) {
        change(role, { cle: text, fichier: name });
        if (state === undefined) return;
        delete state.saisies[role].erreurCle;
        render();
      },
      enregistrer(role) {
        if (state === undefined) return;
        const input = state.saisies[role];
        if (input.enCours) return;
        const id = input.id.trim();
        // Sans clé, rien ne se range : un App ID qui n'est pas celui que la station a déjà le dit sous la ligne, plutôt
        // que de rester sans effet en silence ; un champ vidé n'a rien à ranger.
        if (input.cle.trim() === "") {
          input.attendCle = id !== "" && id !== (appOf(state.lecture, role)?.id ?? "");
          return render();
        }
        delete input.attendCle;
        delete input.refus;
        input.rangee = false;
        if (id === "") input.erreurId = WITHOUT_ID;
        else if (!SHAPE_OF_ID.test(id)) input.erreurId = NOT_ONE_ID;
        else delete input.erreurId;
        if (!isOneKey(input.cle)) input.erreurCle = NOT_ONE_KEY;
        else delete input.erreurCle;
        if (input.erreurId !== undefined || input.erreurCle !== undefined || typeof bridge.rangerUneApp !== "function") return render();
        input.enCours = true;
        render();
        void bridge
          .rangerUneApp(role, id, input.cle)
          .catch((error) => ({ refus: `${UNREACHABLE} — ${error instanceof Error ? error.message : String(error)}` }))
          .then((rendered) => {
            input.enCours = false;
            if ("refus" in rendered) input.refus = refusalSays(rendered.refus);
            else {
              // Rangée, la clé quitte l'écran : son champ se vide, et rien ne la redira.
              input.cle = "";
              delete input.fichier;
              input.id = rendered.rangee.id;
              input.rangee = true;
              const reading = state?.lecture;
              if (reading !== undefined && "apps" in reading) reading.apps = ROLES.map((other) => (other === role ? { role, id: rendered.rangee.id, cle: true } : (appOf(reading, other) ?? { role: other, id: null, cle: false })));
            }
            render();
          });
      },
    },
  };
}

// Chaque classe est posée en clair, `className = "…"` : la peau ne vise que des classes que la vue pose, et son test
// les lit ainsi (skin.test.ts).
/** @param {Fabrique} doc @param {string} balise @param {string} [text] */
function created(doc, balise, text) {
  const element = doc.createElement(balise);
  if (text !== undefined) element.textContent = text;
  return element;
}

/** @param {Fabrique} doc @param {string} text */
function errorUnder(doc, text) {
  return lineError(doc, text, "", { classe: "dit refus" });
}

// Un rôle est configuré quand la station a son App et sa clé.
/** @param {ReadOfApps | undefined} reading @param {Role} role */
const isConfigure = (reading, role) => {
  const app = appOf(reading, role);
  return app !== undefined && app.id !== null && app.cle;
};

// L'état d'un rôle : `configured` — l'ID dit à côté —, `not configured` sinon.
/** @param {Fabrique} doc @param {ReadOfApps | undefined} reading @param {Role} role */
function stateOfRole(doc, reading, role) {
  if (reading === undefined) return [created(doc, "span", READING)];
  if ("refus" in reading) return [created(doc, "span", "–")];
  const app = appOf(reading, role);
  const ready = isConfigure(reading, role);
  const word = created(doc, ready ? "strong" : "span", ready ? CONFIGURE : NOT_CONFIGURE);
  if (ready) word.className = "configuree";
  else word.className = "pas-configuree";
  word.dataset.etat = ready ? "configured" : "not-configured";
  const value = [word];
  if (app?.id != null) value.push(created(doc, "small", ready ? APP(app.id) : `${APP(app.id)} · ${WITHOUT_KEY}`));
  return [...value, hover(doc, `The ${role} App ${ROLE_SAYS[role]}.`)];
}

// Le contrôle d'un rôle : l'App ID, la clé — collée, ou lue du .pem choisi — ; chaque erreur sous son champ. Il
// s'applique à son `change` : `enregistrer` juge l'App ID et la clé, et range l'App — sans clé, il dit qu'elle manque.
/** @param {Fabrique} doc @param {Role} role @param {Input} input @param {ActionsOfIdentities} actions */
function form(doc, role, input, actions) {
  const apply = () => actions.enregistrer(role);
  const id = created(doc, "input");
  id.className = "mono app-id";
  id.type = "text";
  id.value = input.id;
  id.placeholder = FIELD_ID;
  id.ariaLabel = `App ID of the ${role} App`;
  id.spellcheck = false;
  id.autocomplete = "off";
  id.addEventListener("input", () => actions.saisirId(role, String(id.value)));
  id.addEventListener("change", () => {
    actions.saisirId(role, String(id.value));
    apply();
  });
  const lineId = created(doc, "div");
  lineId.className = "champ-id";
  lineId.append(id);
  if (input.erreurId !== undefined) lineId.append(errorUnder(doc, input.erreurId));

  const key = created(doc, "textarea");
  key.className = "mono cle";
  key.rows = 2;
  // Une clé lue d'un fichier ne s'écrit pas dans le champ : son nom se lit à côté.
  key.value = input.fichier === undefined ? input.cle : "";
  key.placeholder = FIELD_KEY;
  key.ariaLabel = `Private key of the ${role} App`;
  key.spellcheck = false;
  key.autocomplete = "off";
  key.addEventListener("input", () => actions.saisirCle(role, String(key.value)));
  key.addEventListener("change", () => {
    actions.saisirCle(role, String(key.value));
    apply();
  });
  const file = created(doc, "input");
  file.type = "file";
  file.accept = ".pem,application/x-pem-file";
  file.hidden = true;
  file.ariaLabel = `The ${role} App's .pem file`;
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    if (chosen === undefined) return;
    void chosen.text().then((/** @type {string} */ text) => {
      actions.choisirLeFichier(role, String(chosen.name), text);
      apply();
    });
    file.value = "";
  });
  const lineKey = created(doc, "div");
  lineKey.className = "champ-cle";
  lineKey.append(key, file);
  if (input.fichier !== undefined) {
    const named = created(doc, "small", CHOSEN(input.fichier));
    named.className = "mono fichier";
    lineKey.append(named);
  }
  if (input.erreurCle !== undefined) lineKey.append(errorUnder(doc, input.erreurCle));

  const actionsOfRole = created(doc, "div");
  actionsOfRole.className = "gestes-du-role";
  actionsOfRole.append(buttonAction(doc, CHOOSE, () => file.click()));
  // Tant que la station range, le contrôle attend.
  id.disabled = input.enCours;
  key.disabled = input.enCours;
  return [lineId, lineKey, actionsOfRole];
}

// L'écran : la ligne d'en-tête — où les clés restent —, puis une ligne par rôle.
/** @param {Fabrique} doc @param {StateOfIdentities} state @param {ActionsOfIdentities} actions */
export function setTheIdentities(doc, state, actions) {
  const root = created(doc, "div");
  root.className = "apps-github";
  root.ariaLive = "polite";
  const guard = created(doc, "span", GUARD);
  guard.className = "garde";
  const readEntry = state.lecture;
  const head = rowOfSetting(doc, { nom: TITLE, valeur: [guard, hover(doc, HELP)], controle: readEntry !== undefined && "refus" in readEntry ? [lineError(doc, UNREADABLE, readEntry.refus)] : [], classe: "tete" });
  root.append(head);
  for (const role of ROLES) {
    const input = state.saisies[role];
    // Ce que le dernier changement a rendu, sous la ligne : le rangement en route, l'App rangée, ou le refus.
    /** @type {import("./components/setting/setting.js").Says | undefined} */
    let said;
    if (input.enCours) said = { enCours: RECORDING };
    else if (input.refus !== undefined) said = { refus: input.refus.ligne, detail: input.refus.detail };
    else if (input.attendCle === true) said = { enCours: KEY_EXPECTED };
    else if (input.rangee) said = { fait: ROW };
    const line = rowOfSetting(doc, { nom: NAME(role), valeur: stateOfRole(doc, readEntry, role), controle: form(doc, role, input, actions), dessous: saysOfSetting(doc, said) });
    line.dataset.role = role;
    root.append(line);
  }
  return root;
}
