import type { GameCatalogEntry } from '@/lib/game-catalog'

/**
 * A catalog in which one routed, registered game is still `in-development`.
 *
 * #873 released Liar's Party and Sketch & Guess, and with them the last entry that was
 * unreleased AND routed AND a key of `GAME_LOBBIES_ROUTES`. Every rule this project has
 * about an unreleased game runs through exactly that combination: /games must not link it,
 * `isTemporarilyUnavailableGameType` must hold it back, `getPublicRegisteredGameTypes` must
 * leave it out, and `ENABLE_IN_DEVELOPMENT_GAMES` must be what promotes it. The two entries
 * still `in-development` - `fake-artist` and `telephone-doodle` - carry no `route` (#975)
 * and are not in the route map, so pointing those assertions at them produces subjects that
 * cannot exist: the suites went quiet instead of red.
 *
 * So the subject is the shape rather than a game. This takes the catalog as it ships and
 * hands back a copy with one entry's availability wound back, which is the state the same
 * entry was in until 2026-09-20 - nothing invented, and nothing that stops being true the
 * next time a game ships. What it must not do is answer the question under test: promotion,
 * the route map and the availability filters all stay the product's own.
 *
 * `route` is not stripped and `lobbyCreateConfig` is not removed, because those two fields
 * plus `gameType` are exactly what makes an entry promotable, and a promotable entry is the
 * thing #1054's flag has to be able to act on.
 */
export const HELD_BACK_GAME_ID = 'liars-party'
export const HELD_BACK_GAME_TYPE = 'liars_party'
export const HELD_BACK_LOBBIES_ROUTE = '/games/liars-party/lobbies'
export const HELD_BACK_DETAIL_HREF = '/games/liars-party'

export function heldBackCatalog(catalog: readonly GameCatalogEntry[]): GameCatalogEntry[] {
  const subject = catalog.find((game) => game.id === HELD_BACK_GAME_ID)

  // Loud rather than empty. A fixture that quietly finds no subject is the failure this
  // whole file exists to undo, so it throws instead of handing back a catalog that has
  // nothing unreleased in it.
  if (subject === undefined) {
    throw new Error(`held-back fixture: no catalog entry with id ${HELD_BACK_GAME_ID}`)
  }
  if (subject.gameType !== HELD_BACK_GAME_TYPE || subject.route !== HELD_BACK_LOBBIES_ROUTE) {
    throw new Error(
      `held-back fixture: ${HELD_BACK_GAME_ID} no longer carries ${HELD_BACK_GAME_TYPE} at ` +
        `${HELD_BACK_LOBBIES_ROUTE}, so it cannot stand for a routed unreleased game`
    )
  }
  if (subject.lobbyCreateConfig === undefined) {
    throw new Error(`held-back fixture: ${HELD_BACK_GAME_ID} has no lobbyCreateConfig to promote`)
  }

  return catalog.map((game) =>
    game.id === HELD_BACK_GAME_ID
      ? ({ ...game, availability: 'in-development' } as GameCatalogEntry)
      : { ...game }
  )
}
