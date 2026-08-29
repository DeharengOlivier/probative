/**
 * One wording for the one thing both inventories have to admit.
 *
 * The repository walk is bounded, by entry count and by depth, so that a
 * pathological tree cannot make the tool run for ever. A bound that stops
 * quietly would be worse than no bound: the pack would present a partial
 * inventory as a complete one, and a reader could not tell "there is none"
 * from "the walk never got there".
 *
 * @param {string} inventory the inventory the interruption affects
 * @returns {string}
 */
export function WALK_TRUNCATED_NOTE(inventory) {
  return `the repository walk stopped at its bounds before the end of the tree; the ${inventory} inventory may be incomplete`;
}
