// @ts-check
// L'écran d'appairage de l'app Android (le ticket 1161, épique 1151) : le premier écran d'une
// installation neuve. Ce qu'on attend du chef, en tête, en une phrase ; dessous, l'adresse de sa
// station et le code qu'elle montre, à taper — ou son QR, qui porte les deux, à scanner d'un bouton.
// « pair » envoie le code au guichet de la station (runtime/src/telephone/guichet.ts), par le pont :
// appairé, l'app passe à ses projets ; refusé — un code faux, expiré, déjà servi —, une ligne le dit
// sous les champs, ce que la station en a dit au survol, et le chef retape ; la station injoignable,
// la ligne le dit aussi, plutôt qu'un écran qui attend sans fin. Pendant l'envoi, la ligne dit qu'on
// attend la station, et les deux gestes sont inactifs.
// Le téléphone se présente sous un nom de station tiré de son modèle (`pixel-8`) : si une station qui
// cuit le porte déjà, il réessaie une fois sous `pixel-8-phone`, le code restant valable.
// Ce module ne touche pas `document` et ne joint rien : il reçoit de quoi créer un élément
// (briques.js) et le pont, et rend la section qu'il tient.

import { boutonAction, lectureIndisponible, survol } from "../briques.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../pont.d.ts").ReponseDuGuichet} Reponse */
/** @typedef {import("../pont.d.ts").LectureDuQr} LectureDuQr */
/** @typedef {import("../pont.d.ts").DemandeDuTelephone} Demande */
/** @typedef {{ appairerLeTelephone(demande: Demande): Promise<Reponse>, scannerLeQr(): Promise<LectureDuQr> }} PontDuTelephone */

export const TITRE = "Link this phone to your projects";
export const ATTENDU = "Type the code your station shows, or scan its QR.";
export const AIDE = "A running station shows a pairing code, and its QR, for fifteen minutes. A code pairs one phone, once. Paired, this phone is one of your stations — one that does not cook.";
export const ADRESSE = "Your station's address";
export const CODE = "Pairing code";
export const APPAIRER = "pair";
export const SCANNER = "scan the QR";
// Ce qui suffixe le nom du téléphone quand son modèle est déjà le nom d'une station qui cuit.
const SUFFIXE = "-phone";

// Le contenu d'un QR de station : `brigade://pair?code=…&url=…` (runtime/src/telephone/appairage.ts,
// `contenuDuQr`) — le code, et l'adresse du guichet quand la station la connaît. Null si ce n'en est pas un.
// Il est lu sans `URL` : une WebView d'avant Chrome 130 ne lit pas l'hôte d'une adresse `brigade:`.
/** @param {string} texte @returns {{ code: string, adresse: string | null } | null} */
export function lireLeQr(texte) {
  const [, requete] = /^brigade:\/\/pair\/?\?([^#]*)/i.exec(texte.trim()) ?? [];
  if (requete === undefined) return null;
  const parametres = new URLSearchParams(requete);
  const code = parametres.get("code")?.trim() ?? "";
  if (code === "") return null;
  const ecrite = parametres.get("url");
  return { code, adresse: ecrite === null ? null : adresseDuGuichet(ecrite) };
}

// L'adresse tapée — `192.168.1.20:7010`, avec ou sans `http://` — telle que le pont la joint :
// `http://192.168.1.20:7010`. Null si ce n'est pas une adresse http(s).
/** @param {string} tapee @returns {string | null} */
export function adresseDuGuichet(tapee) {
  const ecrite = tapee.trim();
  if (ecrite === "") return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(ecrite) ? ecrite : `http://${ecrite}`);
  } catch {
    return null;
  }
  return (url.protocol === "http:" || url.protocol === "https:") && url.hostname !== "" ? url.origin : null;
}

// Ce que l'écran dit d'une adresse : son hôte et son port, sans le protocole.
/** @param {string} adresse */
const hoteDe = (adresse) => adresse.replace(/^https?:\/\//, "");

// Ce que le téléphone dit de lui en s'appairant, lu dans le user agent de sa WebView
// (`Linux; Android 14; Pixel 8 Build/…; wv`) : son nom de station — des minuscules, des chiffres et des
// tirets, `pixel-8` —, et sa machine, telle que la liste des stations l'affiche (`Android 14 · Pixel 8`).
// Un user agent qui tait le modèle donne `android`.
/** @param {string} userAgent @returns {{ nom: string, machine: string }} */
export function presentationDuTelephone(userAgent) {
  const [, version = "", ecrit = ""] = /Android\s*([\d.]*)\s*;\s*([^;)]*)/.exec(userAgent) ?? [];
  const modele = ecrit.replace(/\s*Build\/.*$/, "").trim();
  const connu = modele.length > 1 && modele !== "wv";
  const nom = connu
    ? modele
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";
  const machine = [`Android${version === "" ? "" : ` ${version}`}`, ...(connu ? [modele] : [])].join(" · ");
  return { nom: nom === "" ? "android" : nom, machine };
}

// Ce que l'écran dit de la réponse du guichet : `appaire`, ou une ligne et son détail au survol —
// `code` quand c'est le code qu'il faut changer, `injoignable` quand la station ne répond pas.
/** @param {Reponse} reponse @param {string} adresse @returns {{ etat: "appaire", station: string } | { etat: "code" | "injoignable" | "refuse", ligne: string, detail: string }} */
export function issueDe(reponse, adresse) {
  if (reponse.paired) return { etat: "appaire", station: reponse.station };
  const { reason, said } = reponse;
  if (reason === "inconnu") return { etat: "code", ligne: "Wrong code: check it on your station, then type it again.", detail: said };
  if (reason === "expire") return { etat: "code", ligne: "This code has expired: ask your station for a new one.", detail: said };
  if (reason === "utilise") return { etat: "code", ligne: "This code was already used: ask your station for a new one.", detail: said };
  if (reason === "essais") return { etat: "code", ligne: "Too many wrong codes: wait a few minutes, then try again.", detail: said };
  if (reason === "injoignable") return { etat: "injoignable", ligne: `Your station does not answer at ${hoteDe(adresse)}.`, detail: `${said} — check that the station is running, and that this phone is on its network.` };
  return { etat: "refuse", ligne: "The station refused to pair this phone.", detail: said };
}

// Un champ et son libellé, sous la forme du formulaire d'ajout.
/** @param {Fabrique} doc @param {string} id @param {string} libelle @param {string} exemple */
function champ(doc, id, libelle, exemple) {
  const etiquette = doc.createElement("label");
  etiquette.htmlFor = id;
  etiquette.textContent = libelle;
  const saisie = doc.createElement("input");
  saisie.id = id;
  saisie.placeholder = exemple;
  saisie.autocomplete = "off";
  saisie.spellcheck = false;
  return { etiquette, saisie };
}

// L'écran, tenu : ses champs sont posés une fois — ce que le chef tape ne se perd pas d'un état à
// l'autre —, et seuls la ligne d'issue et l'état des gestes changent. `apres` : appairé, ce que la vue
// fait ensuite — passer aux projets.
/** @param {HTMLElement} lieu @param {Fabrique} doc @param {{ pont: PontDuTelephone, userAgent: string, apres: (station: string) => void }} options */
export function tenirAppairage(lieu, doc, { pont, userAgent, apres }) {
  const formulaire = doc.createElement("form");
  formulaire.className = "appairage";
  formulaire.noValidate = true;
  const titre = doc.createElement("h2");
  titre.textContent = TITRE;
  titre.append(survol(doc, AIDE));
  const attendu = doc.createElement("p");
  attendu.className = "attendu";
  attendu.textContent = ATTENDU;
  const adresse = champ(doc, "adresse-guichet", ADRESSE, "like 192.168.1.20:7010");
  const code = champ(doc, "code-telephone", CODE, "like 7KQ2-M9XD");
  // Ce qui manque à un champ : une ligne sous lui, et rien ne part.
  const manque = doc.createElement("p");
  manque.className = "refus-champ";
  manque.ariaLive = "polite";
  const boutonAppairer = boutonAction(doc, APPAIRER, () => void envoyer(), { recommande: true });
  const boutonScanner = boutonAction(doc, SCANNER, () => void scanner());
  const gestes = doc.createElement("div");
  gestes.className = "gestes-appairage";
  gestes.append(boutonAppairer, boutonScanner);
  // Où en est l'appairage : l'attente de la station, ou ce qui l'a refusé.
  const issue = doc.createElement("div");
  issue.className = "issue-appairage";
  issue.ariaLive = "polite";
  formulaire.append(titre, attendu, adresse.etiquette, adresse.saisie, code.etiquette, code.saisie, manque, gestes, issue);
  formulaire.addEventListener("submit", (/** @type {{ preventDefault(): void }} */ evenement) => {
    evenement.preventDefault();
    void envoyer();
  });
  lieu.replaceChildren(formulaire);

  let enCours = false;
  /** @param {boolean} valeur */
  const occuper = (valeur) => {
    enCours = valeur;
    for (const groupe of [boutonAppairer, boutonScanner]) groupe.firstChild.disabled = valeur;
  };
  /** @param {any[]} poses */
  const dire = (...poses) => issue.replaceChildren(...poses);
  /** @param {"adresse" | "code" | null} quel @param {string} texte */
  const signaler = (quel, texte) => {
    manque.textContent = texte;
    adresse.saisie.ariaInvalid = quel === "adresse" ? "true" : "false";
    code.saisie.ariaInvalid = quel === "code" ? "true" : "false";
  };

  async function envoyer() {
    if (enCours) return;
    const joint = adresseDuGuichet(adresse.saisie.value);
    const tape = code.saisie.value.trim();
    if (joint === null) {
      signaler("adresse", adresse.saisie.value.trim() === "" ? "Type your station's address, like 192.168.1.20:7010." : "This is not an address: type it like 192.168.1.20:7010.");
      dire();
      return adresse.saisie.focus();
    }
    if (tape === "") {
      signaler("code", "Type the code your station shows.");
      dire();
      return code.saisie.focus();
    }
    signaler(null, "");
    occuper(true);
    const attente = doc.createElement("p");
    attente.className = "attente";
    attente.textContent = `Waiting for your station at ${hoteDe(joint)}…`;
    dire(attente);
    const { nom, machine } = presentationDuTelephone(userAgent);
    /** @param {string} sous */
    const demander = async (sous) => {
      try {
        return await pont.appairerLeTelephone({ adresse: joint, code: tape, nom: sous, machine });
      } catch (erreur) {
        return /** @type {Reponse} */ ({ paired: false, reason: "injoignable", said: erreur instanceof Error ? erreur.message : String(erreur) });
      }
    };
    let reponse = await demander(nom);
    if (!reponse.paired && reponse.reason === "nom-pris") reponse = await demander(`${nom}${SUFFIXE}`);
    occuper(false);
    const lue = issueDe(reponse, joint);
    if (lue.etat === "appaire") {
      dire();
      return apres(lue.station);
    }
    const ligne = lectureIndisponible(doc, lue.ligne, lue.detail);
    ligne.dataset.etat = lue.etat;
    dire(ligne);
    if (lue.etat === "code") code.saisie.focus();
  }

  // Le QR lu remplit les deux champs, et part aussitôt : il porte tout ce qu'il faut. Sans adresse, il
  // garde celle qui est tapée.
  async function scanner() {
    if (enCours) return;
    /** @type {LectureDuQr} */
    let lecture;
    try {
      lecture = await pont.scannerLeQr();
    } catch (erreur) {
      lecture = { refus: erreur instanceof Error ? erreur.message : String(erreur) };
    }
    if ("annule" in lecture) return;
    if ("refus" in lecture) return void dire(lectureIndisponible(doc, "The QR could not be read: type the code instead.", lecture.refus));
    const lu = lireLeQr(lecture.lu);
    if (lu === null) return void dire(lectureIndisponible(doc, "This QR is not a pairing code from a station.", lecture.lu));
    code.saisie.value = lu.code;
    if (lu.adresse !== null) adresse.saisie.value = hoteDe(lu.adresse);
    await envoyer();
  }

  return { formulaire };
}

// Appairé : une ligne, en tête des projets, qui dit à quelle station — ce que cela fait, au survol.
/** @param {Fabrique} doc @param {string} station */
export function poserAppaire(doc, station) {
  const ligne = doc.createElement("p");
  ligne.className = "appaire";
  const nom = doc.createElement("code");
  nom.className = "mono";
  nom.textContent = station;
  ligne.append("This phone is paired with ", nom, ".", survol(doc, `${station} lists it among your stations, as one that does not cook.`));
  return ligne;
}
