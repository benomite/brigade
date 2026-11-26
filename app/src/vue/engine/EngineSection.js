// @ts-check
// La section « Engine » de la page d'une station (ticket 3746, épique 3518) : sur quoi ses cooks tournent — l'abonnement
// Claude, une clé d'API de Claude ou Codex —, la clé quand elle en demande une, et le moteur de secours, ou aucun. Chaque
// réglage est une rangée de réglage (composants/setting, ticket 2920) avec la marque de son niveau (« this computer ») : il
// vit sur la machine, jamais dans le dépôt. Un contrôle s'applique dès qu'il change — pas de « Save » —, par le geste
// d'écriture des réglages de la station (settings-de-la-station.ts), puis la section se relit : ce qui est gardé est ce qui
// se montre à la réouverture. La clé se tape dans un champ masqué ; une fois gardée, elle ne revient jamais à l'écran : la
// rangée dit seulement qu'elle l'est. Sur une autre station (`lectureSeule`), la section dit en une ligne que cela se
// règle sur son ordinateur.
// La section ne touche ni `document` ni le pont : la coque (station/page/StationPage.js) lui donne une fabrique et
// `contexte.reglages`, qui lit et écrit.

import { survol } from "../briques.js";
import { lineError } from "../composants/line-error/line-error.js";
import { ditDuSetting, rangeeDeSetting } from "../composants/setting/setting.js";
import { READ, NON_ATTEINT } from "../lexique.js";
import { niveauDe } from "../niveaux.js";
import { appliquer, RIEN_N_A_CHANGE } from "../station/page/appliquer.js";
import { A_CLE, estUnEngine, MOTEURS, MOTS, nameDe, PAR_DEFAUT, secoursPossibles } from "./moteurs.js";

/** @typedef {import("../briques.js").Fabrique} Fabrique */
/** @typedef {import("../composants/setting/setting.js").Dit} Dit */
/** @typedef {{ refus: string, detail?: string }} Refusal */
/**
 * Ce que la station garde de son moteur : `engine` et `fallbackEngine` — absents, l'abonnement et aucun —, et si une clé
 * d'API est gardée (`apiKey`), jamais la clé elle-même.
 * @typedef {{ engine?: string, fallbackEngine?: string | null, apiKey?: boolean }} Lus
 */
/** @typedef {{ engine?: string, fallbackEngine?: string | null, apiKey?: string }} Changement */
/** @typedef {{ lire(): Promise<Lus | Refusal>, ecrire?(changement: Changement): Promise<{ fait: string } | Refusal> }} Port */

const INDISPONIBLE = NON_ATTEINT("its engine");
const SANS_READ = "this app does not read it";
const AUTRE_STATION = "not available for this station";
const SUR_SON_ORDINATEUR = "its engine is read and changed on its own computer";

/** @param {Fabrique} doc @param {string} balise @param {string} texte @param {string} [classe] */
function avec(doc, balise, texte, classe) {
  const pose = doc.createElement(balise);
  pose.textContent = texte;
  if (classe !== undefined) pose.className = classe;
  return pose;
}

// Une liste de moteurs : chacun son nom, la valeur gardée choisie.
/** @param {Fabrique} doc @param {string} libelle @param {{ cle: string, nom: string }[]} choice @param {string} choisi */
function liste(doc, libelle, choice, choisi) {
  const select = doc.createElement("select");
  select.ariaLabel = libelle;
  select.append(
    ...choice.map(({ cle, nom: name }) => {
      const option = avec(doc, "option", name);
      option.value = cle;
      option.selected = cle === choisi;
      return option;
    }),
  );
  select.value = choisi;
  return select;
}

/** @param {Fabrique} doc @param {{ station: { nom: string }, lectureSeule: boolean, reglages?: Port }} context */
export function poserSection(doc, context) {
  const racine = doc.createElement("div");
  racine.className = "moteur-de-la-station";
  const port = context.lectureSeule ? undefined : context.reglages;
  // Ce que le dernier changement a rendu, sous son réglage — un seul parle à la fois.
  /** @type {Record<string, Dit | undefined>} */
  let dits = {};

  const lire = async () => {
    /** @type {Lus | Refusal} */
    const lus = context.lectureSeule
      ? { refus: AUTRE_STATION, detail: SUR_SON_ORDINATEUR }
      : port === undefined
        ? { refus: INDISPONIBLE, detail: SANS_READ }
        : await port.lire().catch((/** @type {unknown} */ e) => ({ refus: INDISPONIBLE, detail: e instanceof Error ? e.message : String(e) }));
    if ("refus" in lus) return racine.replaceChildren(lineError(doc, lus.refus, lus.detail ?? ""));
    racine.replaceChildren(...lines(lus));
  };

  /** @param {string} cle @param {any} rangee @param {any[]} controles @param {Changement} changement */
  const ecrire = async (cle, rangee, controles, changement) => {
    const dit = await appliquer(doc, rangee, controles, () => port?.ecrire?.(changement) ?? { refus: RIEN_N_A_CHANGE, detail: "this app cannot write it" });
    dits = { [cle]: dit };
    await lire();
  };

  /** @param {Lus} lus */
  function lines(lus) {
    const modifiable = port?.ecrire !== undefined;
    const engine = lus.engine ?? PAR_DEFAUT;
    const secours = lus.fallbackEngine ?? null;
    const connu = estUnEngine(engine);

    // Le moteur : les trois, dans une liste. Choisir celui du secours le retire du secours, dans le même changement.
    const rangeeEngine = rangeeDeSetting(doc, {
      nom: MOTS.moteur,
      cle: "moteur",
      niveau: niveauDe(doc, "moteur"),
      valeur: [avec(doc, "strong", connu ? nameDe(engine) : MOTS.inconnu(engine)), survol(doc, MOTS.aideMoteur)],
      dessous: ditDuSetting(doc, dits.moteur),
    });
    if (modifiable) {
      const choice = liste(doc, "Choose the engine", connu ? [...MOTEURS] : [{ cle: engine, nom: MOTS.inconnu(engine) }, ...MOTEURS], engine);
      choice.addEventListener("change", () => {
        const voulu = String(choice.value);
        if (voulu !== engine) void ecrire("moteur", rangeeEngine, [choice], voulu === secours ? { engine: voulu, fallbackEngine: null } : { engine: voulu });
      });
      rangeeEngine.children[2].append(choice);
    }

    // La clé, quand le moteur ou son secours en demande une : un champ masqué, vidé après chaque envoi.
    const rangees = [rangeeEngine];
    if (engine === A_CLE || secours === A_CLE) {
      const gardee = lus.apiKey === true;
      const rangeeCle = rangeeDeSetting(doc, {
        nom: MOTS.cle,
        cle: "cle-api",
        niveau: niveauDe(doc, "moteur"),
        valeur: [avec(doc, "span", gardee ? `${MOTS.masque} ${MOTS.cleGardee}` : MOTS.cleAbsente, gardee ? "cle-gardee" : "cle-absente"), survol(doc, MOTS.aideCle)],
        dessous: ditDuSetting(doc, dits.cle),
      });
      if (modifiable) {
        const champ = doc.createElement("input");
        champ.type = "password";
        champ.autocomplete = "off";
        champ.spellcheck = false;
        champ.value = "";
        champ.placeholder = gardee ? MOTS.remplacerLaCle : MOTS.saisirLaCle;
        champ.ariaLabel = MOTS.cle;
        champ.addEventListener("change", () => {
          const voulu = String(champ.value).trim();
          champ.value = "";
          if (voulu !== "") void ecrire("cle", rangeeCle, [champ], { apiKey: voulu });
        });
        rangeeCle.children[2].append(champ);
      }
      rangees.push(rangeeCle);
    }

    // Le secours : aucun, ou l'un des deux autres moteurs.
    const rangeeSecours = rangeeDeSetting(doc, {
      nom: MOTS.secours,
      cle: "secours",
      niveau: niveauDe(doc, "moteur"),
      valeur: [avec(doc, "strong", secours === null ? MOTS.aucun : nameDe(secours)), survol(doc, MOTS.aideSecours)],
      dessous: ditDuSetting(doc, dits.secours),
    });
    if (modifiable) {
      const choice = liste(doc, "Choose the fallback engine", [{ cle: "", nom: MOTS.aucun }, ...secoursPossibles(engine)], secours ?? "");
      choice.addEventListener("change", () => {
        const voulu = String(choice.value) === "" ? null : String(choice.value);
        if (voulu !== secours) void ecrire("secours", rangeeSecours, [choice], { fallbackEngine: voulu });
      });
      rangeeSecours.children[2].append(choice);
    }
    rangees.push(rangeeSecours);
    return rangees;
  }

  racine.append(avec(doc, "p", READ, "dit"));
  return lire().then(() => racine);
}
