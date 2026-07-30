import type { FormalSceneId } from "./scene-manifest";

/**
 * Human-facing activity names are kept in the life system, while the formal
 * route runtime exposes only the IDs authored by the current 3001 snapshot.
 * These aliases are lookup-only and must never be injected into scene.routes.
 */
export type PublishedLifeSceneId = Exclude<FormalSceneId, "bathroom-private">;

export const lifeRouteAliases: Readonly<Record<PublishedLifeSceneId, Readonly<Record<string, string>>>> = {
  study: {
    "study-seat-to-door": "seat-to-door",
    "study-door-to-seat": "door-to-seat",
    "study-seat-to-kitchen": "seat-to-kitchen",
    "study-kitchen-to-seat": "kitchen-to-seat",
    "study-door-to-kitchen": "door-to-kitchen",
    "study-kitchen-to-door": "kitchen-to-door",
  },
  bedroom: {
    "bedroom-to-bed": "custom-1",
    "bedroom-bed-to-door": "custom-2",
    "bedroom-to-record": "door-to-bed",
    "bedroom-record-to-door": "bed-to-door",
    "bedroom-bed-to-record": "custom-3",
    "bedroom-record-to-bed": "custom-4",
    "bedroom-to-lounge": "door-to-lounge",
    "bedroom-lounge-to-door": "lounge-to-door",
    "bedroom-bed-to-lounge": "custom-5",
    "bedroom-lounge-to-bed": "custom-6",
  },
  "dining-kitchen": {
    "dining-entry-to-counter": "entry-to-counter",
    "dining-counter-to-entry": "counter-to-entry",
    "dining-counter-to-table": "counter-to-table",
    "dining-table-to-counter": "table-to-counter",
    "dining-entry-to-table": "entry-to-table",
    "dining-table-to-entry": "table-to-entry",
  },
  entrance: {
    "entrance-to-mailbox": "entrance-to-mailbox",
    "mailbox-to-entrance": "mailbox-to-entrance",
    "entrance-to-postcard-rack": "entrance-to-postcard-rack",
    "postcard-rack-to-entrance": "postcard-rack-to-entrance",
    "entrance-to-coat-rack": "entrance-to-coat-rack",
    "coat-rack-to-entrance": "coat-rack-to-entrance",
    "entrance-to-outside": "entrance-to-outside",
    "outside-to-entrance": "outside-to-entrance",
  },
  "terrace-greenery": {
    "terrace-to-bench": "entry-to-bench",
    "terrace-bench-to-entry": "bench-to-entry",
    "terrace-to-turtle": "entry-to-turtle-pond",
    "terrace-turtle-to-entry": "turtle-pond-to-entry",
    "terrace-to-telescope": "entry-to-telescope",
    "terrace-telescope-to-entry": "telescope-to-entry",
  },
  attic: {
    "attic-to-archive": "stair-to-archive",
    "attic-archive-to-stair": "archive-to-stair",
    "attic-to-draft-desk": "stair-to-draft-desk",
    "attic-draft-desk-to-stair": "draft-desk-to-stair",
  },
};

export function resolveLifeRouteAlias(sceneId: FormalSceneId, routeId: string): string | undefined {
  if (sceneId === "bathroom-private") return undefined;
  return lifeRouteAliases[sceneId]?.[routeId];
}
