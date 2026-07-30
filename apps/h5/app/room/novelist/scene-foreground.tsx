import React from "react";

import {
  formalEcologySceneManifest,
  type FormalSceneId,
  type NovelistForegroundOcclusionPolicy,
} from "./scene-manifest";
import motionStyles from "./novelist-motion-actor.module.css";

type SceneForegroundOcclusionProps = {
  sceneId: FormalSceneId;
  foregroundOcclusionPolicy: NovelistForegroundOcclusionPolicy;
  layerModes?: Readonly<Record<string, "actor-front" | "obstacle-front">>;
  visible: boolean;
  children?: React.ReactNode;
};

/**
 * Transparent furniture layers are split by depth. The desk stays below the
 * actor after the route turn, while the near-side chair stays above the actor.
 */
export function SceneForegroundOcclusion({
  sceneId,
  foregroundOcclusionPolicy,
  layerModes,
  visible,
  children,
}: SceneForegroundOcclusionProps) {
  const layers = formalEcologySceneManifest.scenes[sceneId].foregroundLayers ?? [];
  const scenePolicyActive = visible && (
    (sceneId === "study" && foregroundOcclusionPolicy === "desk-foreground")
    || (sceneId === "bedroom" && foregroundOcclusionPolicy === "bedroom-foreground")
  );
  const layerModeFor = (layer: (typeof layers)[number]) => {
    if (!layerModes) return undefined;
    const keys = [
      layer.assetId,
      layer.layerRole === "chair-depth-occluder" ? "chair" : undefined,
      layer.layerRole === "desk-depth-occluder" ? "desk-table" : undefined,
      layer.layerRole === "bedroom-furniture-depth-occluder" ? "bed" : undefined,
    ].filter((key): key is string => Boolean(key));
    for (const key of keys) {
      if (layerModes[key]) return layerModes[key];
    }
    return layerModes["*"];
  };
  const activeLayerEntries = visible
    ? layers.filter((layer) => layer.approvedForRuntime && (
      layerModeFor(layer) !== "actor-front"
      && (layer.renderWhen === "always" || scenePolicyActive || layerModeFor(layer) === "obstacle-front")
    ))
    : [];
  const maskSources = activeLayerEntries.map((layer) => layer.src);
  const maskImage = maskSources.length > 0
    ? [
      "linear-gradient(#fff, #fff)",
      ...maskSources.map((source) => `url("${source}")`),
    ].join(", ")
    : undefined;
  const maskComposite = maskSources.map(() => "subtract").join(", ");
  const maskStyle = maskImage ? {
    maskImage,
    maskComposite,
    maskMode: "alpha",
    WebkitMaskImage: maskImage,
    WebkitMaskMode: "alpha",
  } as React.CSSProperties : undefined;

  return (
    <div
      className={motionStyles.foregroundOcclusionRoot}
      data-testid="scene-foreground-occlusion"
      data-scene-id={sceneId}
      data-visible={visible}
      data-foreground-policy={foregroundOcclusionPolicy}
      data-layer-count={maskSources.length}
      data-mask-enabled={Boolean(maskSources.length)}
      data-layer-modes={layerModes ? JSON.stringify(layerModes) : ""}
      data-mask-source-count={maskSources.length}
      data-visible-foreground="false"
      data-render-role="actor-occlusion-mask-only"
      data-foreground-sources={maskSources.join("|")}
      style={maskStyle}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}
