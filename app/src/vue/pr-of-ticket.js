// @ts-check
// Une pull request se dit par son ticket (ticket 3716) : GitHub numérote issues et PR d'une seule suite, et la PR 3710
// du ticket 3709 se lit comme un ticket de plus. Partout où le chef lit une PR — rail, fiche, TODO, notifications,
// accueil —, elle se dit « PR of #<ticket> », jamais « #<pr> » ; son lien, lui, ouvre toujours la PR sur GitHub. Une PR
// sans ticket garde son numéro.

/** @param {number} ticket */
export const PR_OF_TICKET = (ticket) => `PR of #${ticket}`;

/**
 * Le texte, chaque « PR #<pr> » (ou « pull request #<pr> ») dit « the PR of #<ticket> » — « The » en tête de phrase. Sans
 * `pr`, toute PR que le texte nomme est celle du ticket : un texte qui ne parle que de sa livraison (la raison d'un renvoi).
 * @param {string} text @param {number} ticket @param {number} [pr]
 */
export function tellThePrParItsTicket(text, ticket, pr) {
  const number = pr === undefined ? "\\d+" : String(pr);
  const named = new RegExp(`(\\b[Tt]he\\s+)?\\b(?:PR|[Pp]ull request) #${number}(?!\\d)`, "g");
  return text.replace(named, (/** @type {string} */ _all, /** @type {string | undefined} */ _the, /** @type {number} */ rank) => {
    const enHead = /(?:^|[.!?]\s+)$/.test(text.slice(0, rank));
    return `${enHead ? "The" : "the"} ${PR_OF_TICKET(ticket)}`;
  });
}
