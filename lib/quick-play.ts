/**
 * How many total players a freshly-created quick-play lobby should have
 * after bot-filling. Ordinary matchmaking (forceSolo: false) targets
 * minPlayers as before. forceSolo (Play vs Bot) explicitly asks for a bot
 * opponent at a chosen difficulty — for solo-capable games (minPlayers: 1,
 * e.g. Yahtzee) minPlayers alone is already met by the human, which would
 * leave the player with zero bots despite picking a difficulty. Guarantee
 * at least one bot in that case.
 */
export function resolveBotTarget(minPlayers: number, forceSolo: boolean): number {
  return forceSolo ? Math.max(minPlayers, 2) : minPlayers
}
