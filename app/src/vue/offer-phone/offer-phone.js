// @ts-check
// L'offre du téléphone, juste après le premier ticket servi (ticket 3303) : sur la page du premier projet du chef — celui
// que sa station a ajouté le plus tôt —, une fois son premier ticket servi, une ligne dit « Brigade can call you on your
// phone when it needs you ». Acceptée, elle montre sur place le lien de l'app Android — l'`apkUrl` de la dernière version
// publiée, lu par le process principal (update/android.ts), ou la page des versions s'il ne se lit pas — et « Sign
// in with the same GitHub account » : depuis le ticket 2500, le téléphone n'a pas de code d'appairage, il se connecte au même
// compte GitHub. Déclinée, ou son lien suivi, elle ne revient plus : le choix est gardé dans le stockage de la vue
// (`localStorage`). Un téléphone déjà connecté au compte GitHub du chef ne la laisse pas paraître : l'app Android pose
// sa trace dans un gist du compte (phone-connected.ts), que le process principal lit ; tant que cette lecture n'a pas
// dit qu'aucun téléphone n'est connecté — pas encore faite, ou illisible —, l'offre ne se montre pas. Ce module ne touche
// pas `document`.

import { buttonAction } from "../bricks.js";
import { lineError } from "../components/line-error/line-error.js";
import { RETRY } from "../lexicon.js";

/** @typedef {import("../bricks.js").Fabrique} Fabrique */
/** @typedef {{ nom: string, delai?: import("../../projects/request.ts").Delay }} ProjectRead */
/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} Storage */
/** @typedef {{ etape: "offerte" } | { etape: "lecture" } | { etape: "lien", lien: string } | { etape: "illisible" }} State */

export const KEY_OF_THE_OFFER = "brigade.offre-telephone";
export const OFFER = "Brigade can call you on your phone when it needs you";
export const ACCEPT = "set up my phone";
export const DECLINE = "no thanks";
export const READING = "Finding the Android app…";
export const DOWNLOAD = "download the Android app";
export const SAME_ACCOUNT = "Sign in with the same GitHub account";
export const UNREADABLE = "The link to the Android app cannot be read right now.";
// Une lecture de la trace du téléphone qui n'a pas dit « connecté » se refait au plus tôt après ce délai.
export const REREAD_MS = 5 * 60_000;

// Le premier projet du chef — parmi les projets lus, celui dont l'ajout est le plus ancien —, si son premier ticket est
// servi ; sinon rien. Un projet sans délai publié (ticket 1401) ne compte pas : son ajout ne se sait pas.
/** @param {readonly ProjectRead[]} projects @returns {string | undefined} */
export function firstProjectServed(projects) {
  const dates = projects.flatMap(({ nom: name, delai: delay }) => (delay === undefined ? [] : [{ nom: name, delai: delay, ajout: Date.parse(delay.ajouteLe) }])).filter(({ ajout: addition }) => !Number.isNaN(addition));
  const first = dates.reduce((/** @type {(typeof dates)[number] | undefined} */ early, readOne) => (early === undefined || readOne.ajout < early.ajout ? readOne : early), undefined);
  return first !== undefined && first.delai.serviLe !== null ? first.nom : undefined;
}

// L'offre tenue pour la vue. `lire` : le lien de l'app Android, par le pont. `ouvrir` : l'ouvre dans le navigateur.
// `connecte` : la trace d'un téléphone connecté, par le pont — `{ connecte: boolean }`, ou autre chose quand elle ne se
// lit pas. Un stockage absent ou illisible ne la montre pas : sans lui, un refus ne se garderait pas, et elle reviendrait
// à chaque lancement. Une trace de refus qui ne s'écrit pas la range quand même jusqu'à la fermeture de l'app.
/** @param {{ stockage: Storage | undefined, lire: () => Promise<unknown>, connecte: () => Promise<unknown>, ouvrir: (link: string) => void, rendre: () => void, maintenant?: () => string, horloge?: () => number }} options */
export function holdTheOffer({ stockage: storage, lire: read, connecte: connected, ouvrir: open, rendre: render, maintenant: now = () => new Date().toISOString(), horloge: clock = Date.now }) {
  /** @type {State} */
  let state = { etape: "offerte" };
  let rowHere = false;
  // Ce que la dernière lecture de la trace du téléphone a dit, et quand ; une lecture en cours.
  /** @type {{ dit: "connecte" | "absent" | "illisible", le: number } | undefined} */
  let phone;
  let enRead = false;
  const readThePhone = async () => {
    enRead = true;
    let readOne;
    try {
      readOne = await connected();
    } catch {
      readOne = undefined;
    }
    const said = typeof readOne === "object" && readOne !== null && "connecte" in readOne && typeof readOne.connecte === "boolean" ? (readOne.connecte ? "connecte" : "absent") : "illisible";
    phone = { dit: said, le: clock() };
    enRead = false;
    render();
  };
  /** @param {"declinee" | "suivie"} comment */
  const tidy = (comment) => {
    rowHere = true;
    try {
      storage?.setItem(KEY_OF_THE_OFFER, JSON.stringify({ [comment]: now() }));
    } catch {
      // Voir plus haut : rangée pour ce lancement.
    }
    render();
  };
  const accept = async () => {
    state = { etape: "lecture" };
    render();
    let readOne;
    try {
      readOne = await read();
    } catch {
      readOne = undefined;
    }
    state = typeof readOne === "string" && /^https:\/\/\S+$/.test(readOne) ? { etape: "lien", lien: readOne } : { etape: "illisible" };
    render();
  };
  return {
    get etat() {
      return state;
    },
    rangee() {
      if (rowHere || storage === undefined) return true;
      try {
        return storage.getItem(KEY_OF_THE_OFFER) !== null;
      } catch {
        return true;
      }
    },
    // Vrai : l'offre peut paraître — ni rangée, ni un téléphone connecté, et la dernière lecture a dit qu'il n'y en a
    // aucun. Sans réponse encore, ou une réponse vieille de `RELIRE_MS` qui n'a pas dit « connecté », la trace est relue.
    montrable() {
      if (this.rangee() || phone?.dit === "connecte") return false;
      if (!enRead && (phone === undefined || clock() - phone.le >= REREAD_MS)) void readThePhone();
      return phone?.dit === "absent";
    },
    accepter: () => void accept(),
    decliner: () => tidy("declinee"),
    /** @param {string} link */
    suivre(link) {
      open(link);
      tidy("suivie");
    },
  };
}

// La ligne de l'offre, à l'état donné.
/** @param {Fabrique} doc @param {State} state @param {{ accepter: () => void, decliner: () => void, suivre: (link: string) => void }} action */
export function setTheOffer(doc, state, action) {
  const line = doc.createElement("div");
  line.className = "offre-telephone gestes";
  line.dataset.etape = state.etape;
  const said = doc.createElement("span");
  said.className = "phrase";
  said.textContent = OFFER;
  line.append(said);
  if (state.etape === "offerte") line.append(buttonAction(doc, ACCEPT, action.accepter, { recommande: true }));
  if (state.etape === "lecture") {
    const reading = doc.createElement("span");
    reading.className = "lecture";
    reading.textContent = READING;
    line.append(reading);
  }
  if (state.etape === "lien") {
    const link = doc.createElement("a");
    link.className = "lien-apk";
    link.href = state.lien;
    link.textContent = DOWNLOAD;
    link.title = state.lien;
    link.addEventListener("click", (/** @type {{ preventDefault?: () => void }} */ event) => {
      event?.preventDefault?.();
      action.suivre(state.lien);
    });
    const account = doc.createElement("span");
    account.className = "meme-compte";
    account.textContent = SAME_ACCOUNT;
    line.append(link, account);
  }
  if (state.etape === "illisible") line.append(lineError(doc, UNREADABLE, "", { classe: "erreur", balise: "span" }), buttonAction(doc, RETRY, action.accepter));
  line.append(buttonAction(doc, DECLINE, action.decliner, { sorte: "discret" }));
  return line;
}
