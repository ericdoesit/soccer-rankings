/**
 * Event names as sources write them, tidied for display. GotSport keeps whatever an organizer typed,
 * including emoji ("OSA Youth Summer Union Cup⚽🏆", GotSport event 45290); the organizer's own site
 * (osa-us.com) uses the plain name, so emoji are dropped: "OSA Youth Summer Union Cup".
 * Applied when the snapshot is built and wherever a source file's own event name is looked up, so
 * names keep matching. Idempotent.
 */
export function tidyEventName(name: string): string {
  return name.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, " ").replace(/\s{2,}/g, " ").trim();
}
