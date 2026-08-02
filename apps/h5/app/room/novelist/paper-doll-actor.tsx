"use client";

import React from "react";
import type { NovelistActorAsset, NovelistActorMode } from "./scene-manifest";
import styles from "./novelist-room.module.css";

export function PaperDollActor({ mode, asset, visible = true }: { mode: NovelistActorMode; asset: NovelistActorAsset; visible?: boolean }) {
  return (
    <div className={`${styles.actorAnchor} ${styles[`actorAnchor--${mode}`]}`} data-testid="novelist-actor" data-mode={mode} data-visible={visible}>
      <div className={styles.paperActor}>
        {asset.src ? (
          <img className={styles.paperActorImage} src={asset.src} alt={asset.alt} />
        ) : (
          <div aria-label="圆底纸板人偶素材预览">
            <span className={styles.paperActor__head} aria-hidden="true" />
            <span className={styles.paperActor__body} aria-hidden="true" />
            <span className={styles.paperActor__base} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
