"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  ExperienceAction,
  ExperienceProjection,
  ExperiencePublicErrorCode,
  ExperienceRecoveryAction,
  VnextContinuousUseResponse,
  VnextSessionAdmissionManifest,
} from "@erliu/shared-contracts/vnext-experience";
import {
  ExperienceApiError,
  acceptExperienceAdmission,
  bootstrapExperienceSession,
  evaluateContinuousUse,
  readExperienceDraft,
  readExperienceProjection,
  subscribeContinuousUseOffer,
  submitExperienceAction,
  type SubmitExperienceActionInput,
} from "../lib/experience-api";
import { SafetyControls } from "./safety-controls";
import {
  EXPERIENCE_STATE_COPY,
  VNEXT_PRODUCT_PROMISE,
  publicErrorCopy,
} from "./experience-copy";
import styles from "./experience-view.module.css";

type ViewPhase = "booting" | "admission" | "active" | "exited";
type CorrectionMode = "replace" | "append" | "clarification";

type VisibleErrorSource =
  | "admission"
  | "projection"
  | "draft"
  | "submit"
  | "reminder";

interface CorrectionBasis {
  readonly mode: CorrectionMode;
  readonly basedOnVersionId: string;
  readonly understandingVersionId: string;
}

interface VisibleError {
  source: VisibleErrorSource;
  code: ExperiencePublicErrorCode;
  recovery: ExperienceRecoveryAction;
}

interface LastAction {
  readonly input: SubmitExperienceActionInput;
  readonly preSubmitProjection: ExperienceProjection | null;
}

type UnknownSubmitState = "unknown";

function toVisibleError(
  error: unknown,
  source: VisibleErrorSource,
): VisibleError {
  if (error instanceof ExperienceApiError) {
    return { source, code: error.code, recovery: error.recovery };
  }
  return {
    source,
    code: "temporarily_unavailable",
    recovery: "return_later",
  };
}

function actionByCode<TCode extends ExperienceAction["code"]>(
  projection: ExperienceProjection,
  code: TCode,
): Extract<ExperienceAction, { code: TCode }> | null {
  const actions = [
    ...(projection.primaryAction ? [projection.primaryAction] : []),
    ...projection.secondaryActions,
  ];
  return (actions.find((action) => action.code === code) ?? null) as
    | Extract<ExperienceAction, { code: TCode }>
    | null;
}

function isActiveWritingState(status: ExperienceProjection["status"]) {
  return status === "listening" || status === "writing" || status === "revising";
}

function admissionManifestKey(manifest: VnextSessionAdmissionManifest) {
  return JSON.stringify([
    manifest.audienceMode,
    manifest.inputPolicy,
    manifest.admissionPolicyVersion,
    manifest.aiIdentityNoticeVersion,
    manifest.serviceTermsVersion,
    manifest.privacyNoticeVersion,
  ]);
}

function correctionBasisFor(
  nextProjection: ExperienceProjection,
  mode: CorrectionMode,
): CorrectionBasis | null {
  const understanding = nextProjection.understanding;
  const correctionAction = actionByCode(nextProjection, "correct_understanding");
  if (
    understanding === null ||
    correctionAction === null ||
    !("basedOnVersionId" in correctionAction)
  ) {
    return null;
  }
  return {
    mode,
    basedOnVersionId: correctionAction.basedOnVersionId,
    understandingVersionId: understanding.versionId,
  };
}

function correctionBasisMatches(
  nextProjection: ExperienceProjection,
  basis: CorrectionBasis,
) {
  const current = correctionBasisFor(nextProjection, basis.mode);
  return (
    current !== null &&
    current.basedOnVersionId === basis.basedOnVersionId &&
    current.understandingVersionId === basis.understandingVersionId
  );
}

export function ExperienceView() {
  const [phase, setPhase] = useState<ViewPhase>("booting");
  const [manifest, setManifest] = useState<VnextSessionAdmissionManifest | null>(null);
  const [projection, setProjection] = useState<ExperienceProjection | null>(null);
  const [storyText, setStoryText] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visibleError, setVisibleError] = useState<VisibleError | null>(null);
  const [admissionChecks, setAdmissionChecks] = useState({
    ai: false,
    terms: false,
    synthetic: false,
  });
  const [reminder, setReminder] = useState<VnextContinuousUseResponse | null>(null);
  const [understandingCollapsed, setUnderstandingCollapsed] = useState(false);
  const [unknownSubmitState, setUnknownSubmitState] =
    useState<UnknownSubmitState | null>(null);
  const [safetyProjectionStale, setSafetyProjectionStale] = useState(false);
  const requestEpoch = useRef(0);
  const mounted = useRef(true);
  const understandingKey = useRef<string | null>(null);
  const correctionBasis = useRef<CorrectionBasis | null>(null);
  const mutationEpoch = useRef(0);
  const mutationInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const queuedRefreshPromise = useRef<Promise<boolean> | null>(null);
  const queuedRefreshResolve = useRef<((result: boolean) => void) | null>(null);
  const lastAction = useRef<LastAction | null>(null);
  const unknownSubmitStateRef = useRef<UnknownSubmitState | null>(null);

  const isCurrentEpoch = useCallback(
    (epoch: number) => mounted.current && requestEpoch.current === epoch,
    [],
  );
  const setOperationError = useCallback(
    (source: VisibleErrorSource, error: unknown) => {
      setVisibleError(toVisibleError(error, source));
    },
    [],
  );
  const clearOperationError = useCallback((source: VisibleErrorSource) => {
    setVisibleError((current) =>
      current?.source === source ? null : current,
    );
  }, []);

  const updateUnknownSubmitState = useCallback(
    (nextState: UnknownSubmitState | null) => {
      unknownSubmitStateRef.current = nextState;
      setUnknownSubmitState(nextState);
    },
    [],
  );

  const clearUnresolvedSubmit = useCallback(() => {
    // A bootstrap/admission result is a session boundary. Keep local text for
    // review, but never carry an old request id or retry lock across it.
    mutationEpoch.current += 1;
    mutationInFlight.current = false;
    lastAction.current = null;
    setPending(false);
    setSafetyProjectionStale(false);
    clearOperationError("submit");
    updateUnknownSubmitState(null);
  }, [clearOperationError, updateUnknownSubmitState]);

  const applyProjection = useCallback(
    (
      nextProjection: ExperienceProjection,
      clearProjectionError = true,
    ) => {
      const basisChanged =
        correctionBasis.current !== null &&
        !correctionBasisMatches(nextProjection, correctionBasis.current);
      if (basisChanged) {
        correctionBasis.current = null;
        setCorrectionMode(null);
        setCorrectionText("");
      }
      const nextUnderstandingKey = nextProjection.understanding
        ? `${nextProjection.understanding.statement}\u0000${nextProjection.understanding.clarificationQuestion ?? ""}`
        : null;
      if (understandingKey.current !== nextUnderstandingKey) {
        understandingKey.current = nextUnderstandingKey;
        setUnderstandingCollapsed(false);
      }
      setProjection(nextProjection);
      setPhase("active");
      if (unknownSubmitStateRef.current !== null) {
        setVisibleError({
          source: "submit",
          code: "temporarily_unavailable",
          recovery: "return_later",
        });
      } else if (basisChanged) {
        setVisibleError({
          source: "submit",
          code: "conflict",
          recovery: "refresh_projection",
        });
      } else if (clearProjectionError) {
        clearOperationError("projection");
      }
      setPaused(false);
      if (nextProjection.status !== "draft_ready") {
        setDraftBody(null);
      }
    },
    [clearOperationError],
  );

  const evaluateReminder = useCallback(
    async function evaluateReminderAttempt(
      expectedEpoch = requestEpoch.current,
      retryAttempt = 0,
    ) {
      try {
        const nextReminder = await evaluateContinuousUse();
        if (isCurrentEpoch(expectedEpoch)) {
          clearOperationError("reminder");
          setReminder(nextReminder);
        }
      } catch (error) {
        if (
          isCurrentEpoch(expectedEpoch) &&
          error instanceof ExperienceApiError &&
          error.recovery === "return_later" &&
          retryAttempt < 2
        ) {
          window.setTimeout(
            () => {
              if (isCurrentEpoch(expectedEpoch)) {
                void evaluateReminderAttempt(expectedEpoch, retryAttempt + 1);
              }
            },
            500 * (retryAttempt + 1),
          );
          return;
        }
        if (isCurrentEpoch(expectedEpoch) && error instanceof ExperienceApiError) {
          setOperationError("reminder", error);
        }
      }
    },
    [clearOperationError, isCurrentEpoch, setOperationError],
  );

  const loadSession = useCallback(async () => {
    // Session recovery starts a new boundary. Clear the old retry lock before
    // reading the manifest so a failed manifest read cannot reuse its request.
    clearUnresolvedSubmit();
    const epoch = ++requestEpoch.current;
    setPhase("booting");
    setManifest(null);
    clearOperationError("admission");
    setAdmissionChecks({ ai: false, terms: false, synthetic: false });
    try {
      const result = await bootstrapExperienceSession();
      if (!isCurrentEpoch(epoch)) return;
      clearOperationError("admission");
      if (result.status === "admission_required") {
        clearUnresolvedSubmit();
        setManifest(result.manifest);
        setPhase("admission");
        return;
      }
      clearUnresolvedSubmit();
      applyProjection(result.projection);
      void evaluateReminder(epoch);
    } catch (error) {
      if (!isCurrentEpoch(epoch)) return;
      setOperationError("admission", error);
      setPhase("admission");
    }
  }, [
    applyProjection,
    clearUnresolvedSubmit,
    clearOperationError,
    evaluateReminder,
    isCurrentEpoch,
    setOperationError,
  ]);

  const cancelQueuedRefresh = useCallback(() => {
    refreshQueued.current = false;
    const resolve = queuedRefreshResolve.current;
    queuedRefreshResolve.current = null;
    queuedRefreshPromise.current = null;
    resolve?.(false);
  }, []);

  useEffect(() => {
    return subscribeContinuousUseOffer((nextReminder) => {
      if (mounted.current) setReminder(nextReminder);
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadSession();
    return () => {
      mounted.current = false;
      requestEpoch.current += 1;
      cancelQueuedRefresh();
    };
  }, [cancelQueuedRefresh, loadSession]);

  const queueProjectionRefresh = useCallback(() => {
    if (!mounted.current) return Promise.resolve(false);
    refreshQueued.current = true;
    if (queuedRefreshPromise.current === null) {
      queuedRefreshPromise.current = new Promise<boolean>((resolve) => {
        queuedRefreshResolve.current = resolve;
      });
    }
    return queuedRefreshPromise.current;
  }, []);

  const refreshProjection = useCallback(async () => {
    if (!mounted.current) return false;
    if (mutationInFlight.current) return queueProjectionRefresh();
    const epoch = ++requestEpoch.current;
    clearOperationError("projection");
    try {
      const nextProjection = await readExperienceProjection();
      const shouldApply = mounted.current && requestEpoch.current === epoch;
      if (shouldApply) {
        applyProjection(nextProjection);
        clearOperationError("projection");
      }
      return shouldApply;
    } catch (error) {
      if (mounted.current && requestEpoch.current === epoch) {
        setOperationError("projection", error);
      }
      return false;
    }
  }, [applyProjection, clearOperationError, queueProjectionRefresh, setOperationError]);

  const refreshProjectionFromSafety = useCallback(async () => {
    if (mounted.current) setSafetyProjectionStale(true);
    const refreshed = await refreshProjection();
    if (mounted.current && refreshed) setSafetyProjectionStale(false);
    return refreshed;
  }, [refreshProjection]);

  const drainQueuedRefresh = useCallback(() => {
    if (!refreshQueued.current) return;
    if (!mounted.current) {
      cancelQueuedRefresh();
      return;
    }
    refreshQueued.current = false;
    const resolve = queuedRefreshResolve.current;
    queuedRefreshResolve.current = null;
    queuedRefreshPromise.current = null;
    void refreshProjection().then(
      (result) => resolve?.(result),
      () => resolve?.(false),
    );
  }, [cancelQueuedRefresh, refreshProjection]);

  useEffect(() => {
    if (
      phase !== "active" ||
      projection === null ||
      paused ||
      pending ||
      !isActiveWritingState(projection.status)
    ) {
      return;
    }
    const timer = window.setInterval(() => void refreshProjection(), 2_500);
    return () => window.clearInterval(timer);
  }, [phase, projection?.status, paused, pending, refreshProjection]);

  useEffect(() => {
    if (phase !== "active" || reminder?.status !== "not_due") return;
    const remaining = Date.parse(reminder.nextReminderAt) - Date.now();
    const delay = Math.max(250, Math.min(remaining, 2_147_000_000));
    const timer = window.setTimeout(() => void evaluateReminder(), delay);
    return () => window.clearTimeout(timer);
  }, [phase, reminder, evaluateReminder]);

  const enterRoom = async () => {
    if (
      manifest === null ||
      !admissionChecks.ai ||
      !admissionChecks.terms ||
      !admissionChecks.synthetic
    ) {
      setVisibleError({
        source: "admission",
        code: "invalid_request",
        recovery: "correct_request",
      });
      return;
    }
    setPending(true);
    clearOperationError("admission");
    const epoch = ++requestEpoch.current;
    try {
      const accepted = await acceptExperienceAdmission(manifest);
      if (isCurrentEpoch(epoch)) {
        applyProjection(accepted.projection);
        clearOperationError("admission");
        void evaluateReminder(epoch);
      }
    } catch (error) {
      if (isCurrentEpoch(epoch)) {
        if (
          error instanceof ExperienceApiError &&
          (error.recovery === "correct_request" ||
            error.recovery === "refresh_projection" ||
            error.recovery === "refresh_admission" ||
            (error.code === "compliance_blocked" && error.recovery === "none"))
        ) {
          try {
            const refreshed = await bootstrapExperienceSession();
            if (isCurrentEpoch(epoch)) {
              if (refreshed.status === "active") {
                applyProjection(refreshed.projection);
                clearOperationError("admission");
                void evaluateReminder(epoch);
                return;
              }
              if (
                error.recovery === "refresh_admission" ||
                error.recovery === "correct_request" ||
                error.recovery === "refresh_projection" ||
                admissionManifestKey(refreshed.manifest) !==
                  admissionManifestKey(manifest)
              ) {
                setManifest(refreshed.manifest);
                setAdmissionChecks({ ai: false, terms: false, synthetic: false });
                clearOperationError("admission");
                return;
              }
            }
          } catch {
            // Preserve the original public error when a recovery read is also unavailable.
          }
        }
        setOperationError("admission", error);
      }
    } finally {
      if (isCurrentEpoch(epoch)) setPending(false);
    }
  };

  const runExperienceAction = async (
    input: SubmitExperienceActionInput,
    preSubmitProjection: ExperienceProjection | null = projection,
    allowPendingRetry = false,
  ) => {
    if (mutationInFlight.current) return;
    if (safetyProjectionStale) {
      setVisibleError({
        source: "submit",
        code: "conflict",
        recovery: "refresh_projection",
      });
      return;
    }
    if (lastAction.current !== null && !allowPendingRetry) {
      setVisibleError({ source: "submit", code: "conflict", recovery: "retry_current_task" });
      return;
    }
    setPending(true);
    clearOperationError("submit");
    const epoch = ++requestEpoch.current;
    const mutationId = ++mutationEpoch.current;
    mutationInFlight.current = true;
    lastAction.current = { input, preSubmitProjection };
    try {
      const nextProjection = await submitExperienceAction(
        input,
        preSubmitProjection,
      );
      if (isCurrentEpoch(epoch)) {
        updateUnknownSubmitState(null);
        applyProjection(nextProjection, false);
        clearOperationError("submit");
        setStoryText("");
        setCorrectionText("");
        setCorrectionMode(null);
        lastAction.current = null;
      }
    } catch (error) {
      if (isCurrentEpoch(epoch)) {
        if (
          error instanceof ExperienceApiError &&
          error.recovery === "return_later"
        ) {
          updateUnknownSubmitState("unknown");
        } else {
          updateUnknownSubmitState(null);
        }
        setOperationError("submit", error);
        if (
          !(
            error instanceof ExperienceApiError &&
            error.recovery === "return_later"
          )
        ) {
          lastAction.current = null;
        }
      }
    } finally {
      const ownsMutation = mutationEpoch.current === mutationId;
      if (ownsMutation) {
        mutationInFlight.current = false;
      }
      if (isCurrentEpoch(epoch)) setPending(false);
      if (ownsMutation) drainQueuedRefresh();
    }
  };

  const submitStory = (event: React.FormEvent) => {
    event.preventDefault();
    if (storyText.trim().length === 0) {
      setVisibleError({
        source: "submit",
        code: "invalid_request",
        recovery: "correct_request",
      });
      return;
    }
    void runExperienceAction(
      { action: "submit_intent", text: storyText.trim() },
      projection,
    );
  };

  const openCorrectionForm = (mode: CorrectionMode) => {
    if (projection === null) {
      setVisibleError({ source: "submit", code: "conflict", recovery: "refresh_projection" });
      return;
    }
    const basis = correctionBasisFor(projection, mode);
    if (basis === null) {
      setVisibleError({ source: "submit", code: "conflict", recovery: "refresh_projection" });
      return;
    }
    correctionBasis.current = basis;
    setCorrectionText("");
    setCorrectionMode(mode);
  };

  const submitCorrection = (event: React.FormEvent) => {
    event.preventDefault();
    const basis = correctionBasis.current;
    if (projection === null || correctionText.trim().length === 0) {
      setVisibleError({
        source: "submit",
        code: "invalid_request",
        recovery: "correct_request",
      });
      return;
    }
    if (mutationLocked) {
      setVisibleError({ source: "submit", code: "conflict", recovery: "refresh_projection" });
      return;
    }
    if (basis === null || !correctionBasisMatches(projection, basis)) {
      correctionBasis.current = null;
      setCorrectionMode(null);
      setCorrectionText("");
      setVisibleError({
        source: "submit",
        code: "conflict",
        recovery: "refresh_projection",
      });
      return;
    }
    correctionBasis.current = null;
    void runExperienceAction({
      action: "correct_understanding",
      text: correctionText.trim(),
      basedOnVersionId: basis.basedOnVersionId,
    }, projection);
  };

  const openDraft = async () => {
    setPending(true);
    clearOperationError("draft");
    const epoch = ++requestEpoch.current;
    try {
      const draft = await readExperienceDraft();
      if (isCurrentEpoch(epoch)) {
        clearOperationError("draft");
        setDraftBody(draft.body);
      }
    } catch (error) {
      if (isCurrentEpoch(epoch)) {
        setOperationError("draft", error);
      }
    } finally {
      if (isCurrentEpoch(epoch)) setPending(false);
    }
  };

  const currentState = projection?.status ?? "unavailable";
  const stateCopy = EXPERIENCE_STATE_COPY[currentState];
  const correctionAction = projection
    ? actionByCode(projection, "correct_understanding")
    : null;
  const retryAction = projection ? actionByCode(projection, "retry_current_task") : null;
  const openDraftAction = projection ? actionByCode(projection, "open_draft") : null;
  const returnLaterAction = projection ? actionByCode(projection, "return_later") : null;
  const submitIntentAction = projection
    ? actionByCode(projection, "submit_intent")
    : null;
  const hasClarification = Boolean(projection?.understanding?.clarificationQuestion);
  const canConfirmLocally =
    projection?.status === "writing" &&
    projection.understanding !== null &&
    !hasClarification;
  const admissionReady = useMemo(
    () => admissionChecks.ai && admissionChecks.terms && admissionChecks.synthetic,
    [admissionChecks],
  );
  const mutationLocked =
    safetyProjectionStale ||
    (lastAction.current !== null && !mutationInFlight.current);
  const hasUnknownSubmitRecovery =
    unknownSubmitState !== null && lastAction.current !== null;
  const showUnknownSubmitRecovery = hasUnknownSubmitRecovery;
  const handleExited = useCallback(() => {
    mounted.current = false;
    requestEpoch.current += 1;
    correctionBasis.current = null;
    cancelQueuedRefresh();
    setPhase("exited");
    setProjection(null);
    setReminder(null);
    setSafetyProjectionStale(false);
    lastAction.current = null;
    mutationInFlight.current = false;
    updateUnknownSubmitState(null);
  }, [cancelQueuedRefresh, updateUnknownSubmitState]);

  if (phase === "exited") {
    return (
      <main className={styles.page} data-state="exited">
        <section className={styles.exitCard}>
          <span>会话已结束</span>
          <h1>互动和待执行任务已经停止</h1>
          <p>系统不会自动重新进入，也不会用挽留文案阻挡退出。现在可以安全关闭这个页面。</p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page} data-state={currentState}>
      <div aria-hidden="true" className={styles.roomScene}>
        <div className={styles.windowGlow} />
        <div className={styles.lamp} />
        <div className={styles.deskLine} />
      </div>

      <header className={styles.identityBar}>
        <div>
          <span className={styles.wordmark}>二流小说家</span>
          <span className={styles.aiBadge}>AI 服务 · 默认私密</span>
        </div>
        <p>内部合成内容体验；请勿输入真实个人信息</p>
      </header>

      <section className={styles.stage}>
        <div className={styles.promiseBlock}>
          <p className={styles.eyebrow}>PRIVATE NOVELIST · 深夜书房</p>
          <h1>{VNEXT_PRODUCT_PROMISE}</h1>
          <p>不需要先做画像，也不需要学提示词。先说出你脑中那一幕。</p>
        </div>

        {phase === "booting" ? (
          <section className={styles.statusPaper} aria-live="polite">
            <span className={styles.statusKicker}>正在确认房间状态</span>
            <h2>先核对服务真值，再让你落笔</h2>
            <p>这里不会用假 loading 或模板故事填补等待。</p>
          </section>
        ) : null}

        {phase === "admission" ? (
          <section className={styles.admissionPaper} aria-labelledby="vnext-admission-title">
            <span className={styles.statusKicker}>门口说明</span>
            <h2 id="vnext-admission-title">先把身份与边界说清楚</h2>
            <p>这是受控内部合成内容体验。小韩是 AI 服务，不是真人；当前不接收真实个人信息。</p>
            <label className={styles.checkRow}>
              <input
                checked={admissionChecks.ai}
                onChange={(event) => setAdmissionChecks((value) => ({ ...value, ai: event.target.checked }))}
                type="checkbox"
              />
              <span>我知道小韩是 AI 服务，而不是真人。</span>
            </label>
            <label className={styles.checkRow}>
              <input
                checked={admissionChecks.terms}
                onChange={(event) => setAdmissionChecks((value) => ({ ...value, terms: event.target.checked }))}
                type="checkbox"
              />
              <span>
                我已阅读并同意 <Link href="/legal/terms">服务说明</Link> 与 <Link href="/legal/privacy">隐私说明</Link>。
              </span>
            </label>
            <label className={styles.checkRow}>
              <input
                checked={admissionChecks.synthetic}
                onChange={(event) => setAdmissionChecks((value) => ({ ...value, synthetic: event.target.checked }))}
                type="checkbox"
              />
              <span>我只提交虚构、合成内容，不输入真实人物或私人信息。</span>
            </label>
            <button disabled={!admissionReady || pending || manifest === null} onClick={() => void enterRoom()} type="button">
              {pending ? "正在进入…" : "进入书房"}
            </button>
            {manifest === null ? <p className={styles.systemNote}>当前环境尚未提供有效准入说明。</p> : null}
          </section>
        ) : null}

        {phase === "active" && projection ? (
          <>
            <section className={styles.statusPaper} aria-labelledby="vnext-status-heading" aria-live="polite">
              <div className={styles.statusHeader}>
                <div>
                  <span className={styles.statusKicker}>{stateCopy.eyebrow}</span>
                  <h2 id="vnext-status-heading">{projection.headline}</h2>
                </div>
                <span className={styles.stateMark} aria-label="状态来自服务器投影" />
              </div>
              <p>{projection.body}</p>
              <p className={styles.sceneCopy}>{stateCopy.scene}</p>

              {projection.understanding && !understandingCollapsed ? (
                <section className={styles.understanding} aria-labelledby="vnext-understanding-heading">
                  <span>委托笺</span>
                  <h3 id="vnext-understanding-heading">我听懂的是……</h3>
                  <p>{projection.understanding.statement}</p>
                  {projection.understanding.clarificationQuestion ? (
                    <p className={styles.question}>
                      <strong>只确认这一件事：</strong>
                      {projection.understanding.clarificationQuestion}
                    </p>
                  ) : null}
                  {correctionAction || canConfirmLocally ? (
                    <div className={styles.inlineActions}>
                      {canConfirmLocally ? (
                        <button className={styles.ghostButton} onClick={() => setUnderstandingCollapsed(true)} type="button">
                  收起理解说明
                        </button>
                      ) : null}
                      {correctionAction ? (
                        <>
                          <button
                            className={styles.ghostButton}
                            disabled={mutationLocked}
                            onClick={() => openCorrectionForm(hasClarification ? "clarification" : "replace")}
                            type="button"
                          >
                            {hasClarification ? "回答这个问题" : "不是这个意思"}
                          </button>
                          {!hasClarification ? (
                            <button className={styles.textButton} disabled={mutationLocked} onClick={() => openCorrectionForm("append")} type="button">
                              再补一句
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {correctionMode ? (
                <form className={styles.correctionForm} onSubmit={submitCorrection}>
                  <label htmlFor="vnext-correction-text">
                    {correctionMode === "replace"
                      ? "重新说清你真正想看的方向"
                      : correctionMode === "append"
                        ? "再补一句会改变故事的线索"
                        : "回答这个决定性问题"}
                  </label>
                  <textarea
                    autoFocus
                    id="vnext-correction-text"
                    maxLength={50_000}
                    onChange={(event) => setCorrectionText(event.target.value)}
                    value={correctionText}
                  />
                  <div className={styles.inlineActions}>
                    <button
                      disabled={
                        pending ||
                        mutationLocked ||
                        correctionText.trim().length === 0
                      }
                      type="submit"
                    >
                      提交给系统重新理解
                    </button>
                    <button
                      className={styles.textButton}
                      onClick={() => {
                        correctionBasis.current = null;
                        setCorrectionMode(null);
                      }}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : null}

              <div className={styles.statusActions}>
                {retryAction && "basedOnVersionId" in retryAction ? (
                  <button
                    disabled={pending || mutationLocked}
                    onClick={() => void runExperienceAction({
                      action: "retry_current_task",
                      basedOnVersionId: retryAction.basedOnVersionId,
                    }, projection)}
                    type="button"
                  >
                    {retryAction.label}
                  </button>
                ) : null}
                {openDraftAction ? (
                  <button disabled={pending} onClick={() => void openDraft()} type="button">
                    {openDraftAction.label}
                  </button>
                ) : null}
                {returnLaterAction && isActiveWritingState(projection.status) && !paused ? (
                  <button className={styles.ghostButton} onClick={() => setPaused(true)} type="button">
                    停止自动刷新
                  </button>
                ) : null}
                {returnLaterAction && isActiveWritingState(projection.status) && paused ? (
                  <button className={styles.textButton} onClick={() => { setPaused(false); void refreshProjection(); }} type="button">
                    恢复自动刷新
                  </button>
                ) : null}
                {returnLaterAction && !isActiveWritingState(projection.status) ? (
                  <button className={styles.ghostButton} onClick={() => void refreshProjection()} type="button">
                    重新检查
                  </button>
                ) : null}
              </div>
            </section>

            {draftBody !== null ? (
              <article className={styles.manuscript} aria-labelledby="vnext-draft-heading">
                <span>未收下的稿件</span>
                <h2 id="vnext-draft-heading">小韩交来的第一页</h2>
                <p>{draftBody}</p>
              </article>
            ) : null}

            {projection.status === "available" && submitIntentAction ? (
              <form className={styles.storyInput} onSubmit={submitStory}>
                <label htmlFor="vnext-story-input">你脑中现在最想看的那一幕</label>
                <textarea
                  disabled={pending || mutationLocked}
                  id="vnext-story-input"
                  maxLength={50_000}
                  onChange={(event) => setStoryText(event.target.value)}
                  placeholder="例如：两个很克制的人，在世界结束前七天才承认彼此。"
                  value={storyText}
                />
                <div className={styles.inputFooter}>
                  <small>仅提交虚构、合成内容；不要写真实姓名、联系方式或私人经历。</small>
                  <button
                    disabled={pending || mutationLocked || storyText.trim().length === 0}
                    type="submit"
                  >
                    {pending ? "系统正在接收…" : "把这一句交给小韩"}
                  </button>
                </div>
              </form>
            ) : null}

            <SafetyControls
              onExited={handleExited}
              onProjectionRefresh={refreshProjectionFromSafety}
              onReminderChange={setReminder}
              reminder={reminder}
            />
          </>
        ) : null}

        {phase === "admission" && manifest === null && visibleError ? (
          <SafetyControls
            onExited={handleExited}
            onProjectionRefresh={refreshProjectionFromSafety}
            onReminderChange={setReminder}
            reminder={reminder}
          />
        ) : null}

        {(visibleError !== null || hasUnknownSubmitRecovery) ? (() => {
          const currentError: VisibleError = visibleError ?? {
            source: "submit",
            code: "temporarily_unavailable",
            recovery: "return_later",
          };
          const copy = showUnknownSubmitRecovery
            ? {
                title: "上一提交还没有确认",
                body: "请先重试上一提交。系统会继续使用同一请求，不会创建新的委托。",
                recovery: "先重试上一提交",
              }
            : publicErrorCopy(currentError.code, currentError.recovery);
          return (
            <div className={styles.errorMessage} role="alert">
              <strong>{copy.title}</strong>
              <p>{copy.body}</p>
              <span>{copy.recovery}</span>
              {currentError.source === "admission" &&
              currentError.recovery === "refresh_projection" &&
              !showUnknownSubmitRecovery ? (
                <button
                  className={styles.ghostButton}
                  onClick={() => void loadSession()}
                  type="button"
                >
                  刷新最新状态
                </button>
              ) : null}
              {currentError.source !== "admission" &&
              currentError.recovery === "refresh_projection" &&
              !showUnknownSubmitRecovery ? (
                <button
                  className={styles.ghostButton}
                  onClick={() => void refreshProjection()}
                  type="button"
                >
                  刷新最新状态
                </button>
              ) : null}
              {showUnknownSubmitRecovery ? (
                <button
                  className={styles.ghostButton}
                  onClick={() => {
                    const retry = lastAction.current;
                    if (retry) {
                      void runExperienceAction(
                        retry.input,
                        retry.preSubmitProjection,
                        true,
                      );
                    }
                  }}
                  type="button"
                >
                  先重试上一提交
                </button>
              ) : null}
              {currentError.source === "draft" &&
              currentError.recovery === "return_later" &&
              !showUnknownSubmitRecovery ? (
                <button className={styles.ghostButton} onClick={() => void openDraft()} type="button">
                  重新打开草稿
                </button>
              ) : null}
              {currentError.source === "projection" &&
              currentError.recovery === "return_later" &&
              !showUnknownSubmitRecovery ? (
                <button className={styles.ghostButton} onClick={() => void refreshProjection()} type="button">
                  刷新最新状态
                </button>
              ) : null}
              {currentError.source === "reminder" &&
              currentError.recovery === "return_later" &&
              !showUnknownSubmitRecovery ? (
                <button className={styles.ghostButton} onClick={() => void evaluateReminder()} type="button">
                  重新检查提醒
                </button>
              ) : null}
              {(currentError.recovery === "restore_session" ||
                currentError.recovery === "refresh_admission" ||
                (currentError.recovery === "return_later" && phase === "admission")) ? (
                <button className={styles.ghostButton} onClick={() => void loadSession()} type="button">
                  重新确认服务
                </button>
              ) : null}
            </div>
          );
        })() : null}
      </section>
    </main>
  );
}
