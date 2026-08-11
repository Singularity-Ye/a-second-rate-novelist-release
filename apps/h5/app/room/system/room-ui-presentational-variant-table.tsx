"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./room-ui-presentational-variant-table.module.css";

export type RoomUiPresentationalVariantCandidate = Readonly<{
  candidateId: string;
  candidateSetId: string;
  candidateSetVersion: number;
  ordinal: number;
  techniqueLabels: readonly string[];
  techniqueSummary: string;
  body: string;
  bodyHash: string;
  status: "pending" | "selected" | "rejected";
}>;

export type RoomUiPresentationalVariantTableProps = Readonly<{
  candidates: readonly RoomUiPresentationalVariantCandidate[];
  selectedPreviewId: string | null;
  selectingCandidateId?: string | null;
  onOpen(candidateId: string): void;
  onClose(): void;
  onSelect(candidateId: string): void;
}>;

const ordinalLabels = ["一", "二", "三"] as const;

function isNonEmpty(value: string) {
  return value.trim().length > 0;
}

function validatedCandidateSet(candidates: readonly RoomUiPresentationalVariantCandidate[]) {
  if (candidates.length !== 3) return null;

  const ordered = [...candidates].sort((left, right) => left.ordinal - right.ordinal);
  const [first] = ordered;
  if (!first) return null;
  const identityCount = new Set(ordered.map((candidate) => candidate.candidateId)).size;
  const ordinalKey = ordered.map((candidate) => candidate.ordinal).join(",");
  const sameSet = ordered.every(
    (candidate) =>
      candidate.candidateSetId === first.candidateSetId &&
      candidate.candidateSetVersion === first.candidateSetVersion,
  );
  const validFields = ordered.every(
    (candidate) =>
      isNonEmpty(candidate.candidateId) &&
      isNonEmpty(candidate.candidateSetId) &&
      Number.isInteger(candidate.candidateSetVersion) &&
      candidate.candidateSetVersion > 0 &&
      candidate.techniqueLabels.length >= 1 &&
      candidate.techniqueLabels.length <= 3 &&
      candidate.techniqueLabels.every(isNonEmpty) &&
      isNonEmpty(candidate.techniqueSummary) &&
      isNonEmpty(candidate.body) &&
      isNonEmpty(candidate.bodyHash),
  );

  if (identityCount !== 3 || ordinalKey !== "1,2,3" || !sameSet || !validFields) return null;
  return ordered;
}

function selectionLabel(status: RoomUiPresentationalVariantCandidate["status"]) {
  if (status === "selected") return "已采用此版";
  if (status === "rejected") return "该版本未采用";
  return "采用此版";
}

export function RoomUiPresentationalVariantTable({
  candidates,
  selectedPreviewId,
  selectingCandidateId = null,
  onOpen,
  onClose,
  onSelect,
}: RoomUiPresentationalVariantTableProps) {
  const orderedCandidates = useMemo(() => validatedCandidateSet(candidates), [candidates]);
  const selectedCandidate =
    orderedCandidates?.find((candidate) => candidate.candidateId === selectedPreviewId) ?? null;
  const previewRef = useRef<HTMLDivElement>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (selectedCandidate === null) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, selectedCandidate]);

  useEffect(() => {
    if (!portalReady || selectedCandidate === null) return;
    previewRef.current?.focus();
  }, [portalReady, selectedCandidate]);

  if (orderedCandidates === null) {
    return (
      <section
        aria-label="三版写法候选"
        className={styles.table}
        data-testid="room-v6-variant-table"
        data-variant-state="unavailable"
      >
        <div className={styles.unavailable} role="status">
          三版写法尚未准备好
        </div>
      </section>
    );
  }

  const firstCandidate = orderedCandidates[0];
  if (!firstCandidate) return null;

  const preview =
    portalReady && selectedCandidate !== null
      ? createPortal(
          <div
            className={styles.previewOverlay}
            data-room-shortcut-scope="system-panel"
            data-testid="room-v6-variant-preview-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            <div
              aria-labelledby="room-v6-variant-preview-title"
              aria-modal="true"
              className={styles.previewPanel}
              data-candidate-id={selectedCandidate.candidateId}
              data-candidate-set-id={selectedCandidate.candidateSetId}
              data-candidate-set-version={selectedCandidate.candidateSetVersion}
              data-testid="room-v6-variant-preview"
              ref={previewRef}
              role="dialog"
              tabIndex={-1}
            >
              <header className={styles.previewHeader}>
                <div className={styles.previewHeading}>
                  <span>写法{ordinalLabels[selectedCandidate.ordinal - 1]}</span>
                  <strong id="room-v6-variant-preview-title">正文预览</strong>
                </div>
                <button
                  aria-label="关闭正文预览"
                  className={styles.closeButton}
                  data-testid="room-v6-variant-preview-close"
                  onClick={onClose}
                  type="button"
                >
                  ×
                </button>
              </header>

              <div className={styles.previewTechnique}>
                <div className={styles.techniqueLabels} aria-label="本版技法">
                  {selectedCandidate.techniqueLabels.map((label) => (
                    <span className={styles.techniqueLabel} key={label}>
                      {label}
                    </span>
                  ))}
                </div>
                <p>{selectedCandidate.techniqueSummary}</p>
              </div>

              <article
                className={styles.previewBody}
                data-scroll-region="internal"
                data-testid="room-v6-variant-preview-body"
                tabIndex={0}
              >
                {selectedCandidate.body}
              </article>

              <footer className={styles.previewFooter}>
                <span>完整正文仅在这里阅读；关闭预览不会采用版本。</span>
                <button
                  className={styles.selectButton}
                  data-testid="room-v6-variant-preview-select"
                  disabled={
                    selectedCandidate.status !== "pending"
                    || selectingCandidateId === selectedCandidate.candidateId
                  }
                  onClick={() => onSelect(selectedCandidate.candidateId)}
                  type="button"
                >
                  {selectingCandidateId === selectedCandidate.candidateId
                    ? "正在采用…"
                    : selectionLabel(selectedCandidate.status)}
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <section
      aria-label="三版写法候选"
      className={styles.table}
      data-candidate-set-id={firstCandidate.candidateSetId}
      data-candidate-set-version={firstCandidate.candidateSetVersion}
      data-testid="room-v6-variant-table"
      data-variant-state="ready"
    >
      <header className={styles.tableHeader}>
        <span>三种写法，同一份委托</span>
        <strong>先选牌，再读完整正文</strong>
        <p>卡面只展示技法与写作取向；点击任意一张打开正文预览。</p>
      </header>

      <div className={styles.cardDeck} data-testid="room-v6-variant-deck" role="list">
        {orderedCandidates.map((candidate) => {
          const ordinalLabel = ordinalLabels[candidate.ordinal - 1];
          return (
            <div className={styles.cardSlot} key={candidate.candidateId} role="listitem">
              <button
                aria-expanded={candidate.candidateId === selectedPreviewId}
                aria-haspopup="dialog"
                aria-label={`打开写法${ordinalLabel}正文：${candidate.techniqueLabels.join("、")}`}
                className={styles.variantCard}
                data-candidate-id={candidate.candidateId}
                data-candidate-set-version={candidate.candidateSetVersion}
                data-variant-status={candidate.status}
                data-testid={`room-v6-variant-card-${candidate.ordinal}`}
                onClick={() => onOpen(candidate.candidateId)}
                type="button"
              >
                <span className={styles.cardOrdinal} aria-hidden="true">
                  0{candidate.ordinal}
                </span>
                <span className={styles.cardKicker}>写法{ordinalLabel}</span>
                <strong className={styles.cardTitle}>{candidate.techniqueLabels.join(" · ")}</strong>
                <span className={styles.cardRule} aria-hidden="true" />
                <span className={styles.cardSummary}>{candidate.techniqueSummary}</span>
                <span className={styles.cardFoot}>
                  <span>{candidate.status === "pending" ? "待选择" : selectionLabel(candidate.status)}</span>
                  <span>展开正文 ↗</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {preview}
    </section>
  );
}
