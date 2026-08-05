import React, { type CSSProperties } from "react";
import type {
  NovelistRoutePoint,
  NovelistSceneInteraction,
} from "./scene-manifest";
import styles from "./novelist-room.module.css";

type SceneInteractionsProps = {
  interactions: readonly NovelistSceneInteraction[];
  routePoints: readonly NovelistRoutePoint[];
  stateByInteractionId: Readonly<Record<string, string>>;
  actorPosition: { x: number; y: number };
};

function pointForInteraction(
  interaction: NovelistSceneInteraction,
  pointsById: ReadonlyMap<string, NovelistRoutePoint>,
): NovelistRoutePoint | undefined {
  return pointsById.get(interaction.anchorPointId);
}

/**
 * Scene-owned assets deliberately render in their own layer. They are not
 * folded into the character sprite or the scene master, so a later state
 * change can swap a coat/mail/postcard without regenerating a composite.
 */
export function SceneInteractions({
  interactions,
  routePoints,
  stateByInteractionId,
  actorPosition,
}: SceneInteractionsProps) {
  if (interactions.length === 0) return null;
  const pointsById = new Map(routePoints.map((point) => [point.id, point]));

  return (
    <div
      className={styles.sceneInteractionsLayer}
      data-testid="scene-interactions-layer"
      aria-hidden="true"
    >
      {interactions.flatMap((interaction) => {
        const stateId = stateByInteractionId[interaction.id] ?? interaction.initialStateId;
        const state = interaction.states.find((candidate) => candidate.id === stateId)
          ?? interaction.states[0];
        if (!state) return [];
        const anchor = pointForInteraction(interaction, pointsById);
        return state.visibleAssetIds.flatMap((assetId) => {
          const asset = interaction.assets.find((candidate) => candidate.id === assetId);
          if (!asset) return [];
          const attachedToActor = asset.mode === "actor" || state.actorAssetId === asset.id;
          const x = attachedToActor ? actorPosition.x : asset.position?.x ?? anchor?.x ?? 0;
          const y = attachedToActor ? actorPosition.y : asset.position?.y ?? anchor?.y ?? 0;
          const offsetX = `${asset.offset.x * 100}%`;
          const offsetY = `${asset.offset.y * 100}%`;
          return [
            <span
              key={`${interaction.id}:${state.id}:${asset.id}`}
              className={`${styles.sceneInteractionAsset} ${attachedToActor ? styles.sceneInteractionAssetActor : styles.sceneInteractionAssetScene}`}
              data-interaction-id={interaction.id}
              data-state-id={state.id}
              data-asset-id={asset.id}
              data-asset-mode={asset.mode}
              data-empty={!asset.src}
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                zIndex: asset.zIndex,
                "--interaction-scale": asset.scale,
                "--interaction-offset-x": offsetX,
                "--interaction-offset-y": offsetY,
              } as CSSProperties}
            >
              {asset.src ? <img src={asset.src} alt="" draggable={false} /> : null}
            </span>,
          ];
        });
      })}
    </div>
  );
}
