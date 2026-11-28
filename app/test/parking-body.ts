// The comment that parks a ticket, as the old runtime wrote it (frozen: the runtime that wrote it is gone, the app still reads it).
export function parkingBody(parking: { what: string; who: string; followUp: string; fact?: string }): string {
  const brand = JSON.stringify(parking).replace(/>/g, "\\u003e");
  const until = parking.fact !== undefined ? parking.fact : `${parking.followUp.slice(0, 10)} ${parking.followUp.slice(11, 16)} UTC`;
  return [`<!-- brigade:parked ${brand} -->`, `**PARKED: waits for ${parking.who}.** ${parking.what}`, "", `- **who**: ${parking.who}`, `- **for what**: ${parking.what}`, `- **until**: ${until}`].join("\n");
}
