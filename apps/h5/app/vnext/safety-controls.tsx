"use client";

import React, { useRef, useState } from "react";
import type {
  VnextConsentListResponse,
  VnextContinuousUseResponse,
  VnextOwnedSafetyCaseResponse,
  VnextSafetyCaseListResponse,
} from "@erliu/shared-contracts/vnext-experience";
import {
  ExperienceApiError,
  acknowledgeContinuousUse,
  appealSafetyCase,
  evaluateContinuousUse,
  exitExperience,
  listConsents,
  listSafetyCases,
  withdrawConsent,
} from "../lib/experience-api";
import { consentPurposeCopy, publicErrorCopy, safetyCaseCopy } from "./experience-copy";
import styles from "./experience-view.module.css";

interface SafetyControlsProps {
  reminder: VnextContinuousUseResponse | null;
  onReminderChange(reminder: VnextContinuousUseResponse | null): void;
  onProjectionRefresh(): Promise<boolean>;
  onExited(): void;
}

type ResourceLoadState = "idle" | "loading" | "ready" | "failed";
type ProjectionRecoveryResource = "consent" | "safety";

function errorMessage(error: unknown) {
  if (error instanceof ExperienceApiError) {
    const copy = publicErrorCopy(error.code, error.recovery);
    return `${copy.title}。${copy.body}`;
  }
  return "系统暂时无法完成这个动作，请稍后重试。";
}

export function SafetyControls({
  reminder,
  onReminderChange,
  onProjectionRefresh,
  onExited,
}: SafetyControlsProps) {
  const [expanded, setExpanded] = useState(false);
  const [consents, setConsents] = useState<VnextConsentListResponse>([]);
  const [safetyCases, setSafetyCases] = useState<VnextSafetyCaseListResponse>([]);
  const [consentLoadState, setConsentLoadState] = useState<ResourceLoadState>("idle");
  const [safetyLoadState, setSafetyLoadState] = useState<ResourceLoadState>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmConsentId, setConfirmConsentId] = useState<string | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [appealCaseId, setAppealCaseId] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [projectionRecovery, setProjectionRecovery] =
    useState<ProjectionRecoveryResource | null>(null);
  const operationEpoch = useRef(0);

  const loadControls = async () => {
    const epoch = ++operationEpoch.current;
    setLoading(true);
    setError(null);
    setConsentLoadState("loading");
    setSafetyLoadState("loading");
    const [consentResult, safetyResult] = await Promise.allSettled([
      listConsents(),
      listSafetyCases(),
    ]);
    if (operationEpoch.current !== epoch) return epoch;
    const failures: string[] = [];
    if (consentResult.status === "fulfilled") {
      setConsents(consentResult.value);
      setConsentLoadState("ready");
    } else {
      setConsentLoadState("failed");
      failures.push(`处理选择暂时无法读取：${errorMessage(consentResult.reason)}`);
    }
    if (safetyResult.status === "fulfilled") {
      setSafetyCases(safetyResult.value);
      setSafetyLoadState("ready");
    } else {
      setSafetyLoadState("failed");
      failures.push(`安全决定暂时无法读取：${errorMessage(safetyResult.reason)}`);
    }
    setError(failures.length > 0 ? failures.join(" ") : null);
    setLoading(false);
    return epoch;
  };

  const toggleControls = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    setSuccess(null);
    if (nextExpanded) {
      void loadControls();
    }
  };

  const acknowledgeReminder = async () => {
    if (reminder?.status !== "pending") return;
    const epoch = ++operationEpoch.current;
    setLoading(true);
    setError(null);
    try {
      await acknowledgeContinuousUse(
        reminder.receiptId,
        reminder.receiptVersion,
      );
      onReminderChange(null);
      setSuccess("提醒已确认。你可以继续，也可以随时退出。");
      try {
        const nextReminder = await evaluateContinuousUse();
        onReminderChange(nextReminder);
      } catch {
        setError("提醒已经确认，但下次提醒时间暂时无法读取。系统不会把它伪装成成功读取。");
      }
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      if (operationEpoch.current === epoch) setLoading(false);
    }
  };

  const confirmWithdrawal = async () => {
    const consent = consents.find((item) => item.id === confirmConsentId);
    if (!consent) return;
    const epoch = ++operationEpoch.current;
    setLoading(true);
    setError(null);
    try {
      await withdrawConsent(consent.id, consent.version);
    } catch (nextError) {
      setError(errorMessage(nextError));
      if (operationEpoch.current === epoch) setLoading(false);
      return;
    }
    if (operationEpoch.current !== epoch) return;
    setConfirmConsentId(null);
    setSuccess(`已撤回“${consentPurposeCopy(consent.purpose)}”。`);
    setConsentLoadState("loading");
    let projectionRefreshed = false;
    try {
      projectionRefreshed = await onProjectionRefresh();
    } catch {
      // Treat an unexpected callback rejection as a failed canonical refresh.
    }
    if (!projectionRefreshed) {
      if (operationEpoch.current === epoch) {
        setConsentLoadState("failed");
        setProjectionRecovery("consent");
        setLoading(false);
      }
      return;
    }
    if (operationEpoch.current === epoch) {
      setProjectionRecovery(null);
      await loadControls();
    }
  };

  const submitAppeal = async (safetyCase: VnextOwnedSafetyCaseResponse) => {
    if (appealReason.trim().length === 0) {
      setError("请先说明你认为需要复核的地方。");
      return;
    }
    const epoch = ++operationEpoch.current;
    setLoading(true);
    setError(null);
    try {
      await appealSafetyCase(
        safetyCase.safetyCaseId,
        safetyCase.version,
        appealReason.trim(),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
      if (operationEpoch.current === epoch) setLoading(false);
      return;
    }
    if (operationEpoch.current !== epoch) return;
    setAppealCaseId(null);
    setAppealReason("");
    setSuccess("申诉已提交，系统会保留处理记录。");
    setSafetyLoadState("loading");
    let projectionRefreshed = false;
    try {
      projectionRefreshed = await onProjectionRefresh();
    } catch {
      // Treat an unexpected callback rejection as a failed canonical refresh.
    }
    if (!projectionRefreshed) {
      if (operationEpoch.current === epoch) {
        setSafetyLoadState("failed");
        setProjectionRecovery("safety");
        setLoading(false);
      }
      return;
    }
    if (operationEpoch.current === epoch) {
      setProjectionRecovery(null);
      await loadControls();
    }
  };

  const retryProjectionRecovery = async () => {
    const resource = projectionRecovery;
    if (!resource) return;
    const epoch = ++operationEpoch.current;
    setLoading(true);
    let projectionRefreshed = false;
    try {
      projectionRefreshed = await onProjectionRefresh();
    } catch {
      // Keep the explicit recovery visible until canonical refresh succeeds.
    }
    if (operationEpoch.current !== epoch) return;
    if (!projectionRefreshed) {
      if (resource === "consent") {
        setConsentLoadState("failed");
      } else {
        setSafetyLoadState("failed");
      }
      setLoading(false);
      return;
    }
    setProjectionRecovery(null);
    await loadControls();
  };

  const confirmImmediateExit = async () => {
    const epoch = ++operationEpoch.current;
    setLoading(true);
    setError(null);
    try {
      await exitExperience();
      onExited();
    } catch (nextError) {
      setError(errorMessage(nextError));
      if (operationEpoch.current === epoch) setLoading(false);
    }
  };

  return (
    <aside className={styles.safetyRail} aria-label="边界与退出">
      {reminder?.status === "pending" ? (
        <div className={styles.reminder} role="alert">
          <strong>你已经连续使用了一段时间</strong>
          <p>这是系统提醒。可以停一停，也可以立即退出；不会由小韩劝你留下。</p>
          <div className={styles.inlineActions}>
            {confirmExit ? (
              <>
                <button disabled={loading} onClick={() => void confirmImmediateExit()} type="button">
                  确认立即退出
                </button>
                <button className={styles.ghostButton} onClick={() => setConfirmExit(false)} type="button">
                  继续留在当前页
                </button>
              </>
            ) : (
              <>
                <button disabled={loading} onClick={() => void acknowledgeReminder()} type="button">
                  我知道了
                </button>
                <button className={styles.ghostButton} onClick={() => setConfirmExit(true)} type="button">
                  立即退出
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <button
        aria-expanded={expanded}
        className={styles.utilityButton}
        onClick={toggleControls}
        type="button"
      >
        边界、处理选择与退出
      </button>

      {expanded ? (
        <div className={styles.safetyPanel}>
          <div className={styles.panelHeading}>
            <div>
              <span>系统责任</span>
              <h2>你的边界由系统执行</h2>
            </div>
            <button className={styles.textButton} disabled={loading} onClick={() => void loadControls()} type="button">
              刷新
            </button>
          </div>
          <p>
            小韩是 AI 服务。你的故事默认私密；停止处理、申诉和退出不会被人格化文案拦住。
          </p>

          <section aria-labelledby="vnext-consent-heading" className={styles.controlGroup}>
            <h3 id="vnext-consent-heading">处理选择</h3>
            {consentLoadState === "failed" ? (
              <p>处理选择暂时无法读取，请刷新重试。</p>
            ) : null}
            {consents.length === 0 && consentLoadState === "ready" ? (
              <p>当前没有可撤回的处理选择。</p>
            ) : null}
            {consentLoadState === "ready" ? consents.map((consent) => (
              <div className={styles.controlRow} key={consent.id}>
                <div>
                  <strong>{consentPurposeCopy(consent.purpose)}</strong>
                  <small>{consent.kind === "optional" ? "可选" : "维持当前服务所需"}</small>
                </div>
                {consent.status === "active" ? (
                  confirmConsentId === consent.id ? (
                    <div>
                      <small>
                        {consent.kind === "required"
                          ? "撤回后，依赖这项处理的创作会停止。"
                          : "撤回可选用途不会阻止你管理已有内容。"}
                      </small>
                      <div className={styles.inlineActions}>
                        <button disabled={loading} onClick={() => void confirmWithdrawal()} type="button">
                          确认撤回
                        </button>
                        <button className={styles.textButton} onClick={() => setConfirmConsentId(null)} type="button">
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className={styles.ghostButton} onClick={() => setConfirmConsentId(consent.id)} type="button">
                      撤回
                    </button>
                  )
                ) : (
                  <span className={styles.statusText}>已撤回</span>
                )}
              </div>
            )) : null}
          </section>

          <section aria-labelledby="vnext-safety-heading" className={styles.controlGroup}>
            <h3 id="vnext-safety-heading">安全决定与申诉</h3>
            {safetyLoadState === "failed" ? (
              <p>安全决定暂时无法读取，请刷新重试。</p>
            ) : null}
            {safetyCases.length === 0 && safetyLoadState === "ready" ? (
              <p>当前没有需要处理的安全决定。</p>
            ) : null}
            {safetyLoadState === "ready" ? safetyCases.map((safetyCase) => {
              const copy = safetyCaseCopy(safetyCase);
              return (
                <div className={styles.caseRow} key={safetyCase.safetyCaseId}>
                  <div>
                    <strong>{copy.action}</strong>
                    <p>{copy.urgency} · {copy.status}</p>
                  </div>
                  {safetyCase.status === "open" ? (
                    appealCaseId === safetyCase.safetyCaseId ? (
                      <div className={styles.appealForm}>
                        <label htmlFor="vnext-appeal-reason">说明需要复核的地方</label>
                        <textarea
                          id="vnext-appeal-reason"
                          maxLength={2000}
                          onChange={(event) => setAppealReason(event.target.value)}
                          value={appealReason}
                        />
                        <div className={styles.inlineActions}>
                          <button disabled={loading} onClick={() => void submitAppeal(safetyCase)} type="button">
                            提交申诉
                          </button>
                          <button className={styles.textButton} onClick={() => setAppealCaseId(null)} type="button">
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className={styles.ghostButton} onClick={() => setAppealCaseId(safetyCase.safetyCaseId)} type="button">
                        申请复核
                      </button>
                    )
                  ) : null}
                </div>
              );
            }) : null}
          </section>

          <section aria-labelledby="vnext-exit-heading" className={styles.controlGroup}>
            <h3 id="vnext-exit-heading">立即退出</h3>
            <p>退出会停止当前互动和仍在等待的创作任务，并清除本次会话 cookie。</p>
            {confirmExit ? (
              <div className={styles.inlineActions}>
                <button disabled={loading} onClick={() => void confirmImmediateExit()} type="button">
                  确认立即退出
                </button>
                <button className={styles.textButton} onClick={() => setConfirmExit(false)} type="button">
                  继续留在当前页
                </button>
              </div>
            ) : (
              <button className={styles.dangerButton} onClick={() => setConfirmExit(true)} type="button">
                立即退出
              </button>
            )}
          </section>
        </div>
      ) : null}

      {loading ? <p aria-live="polite" className={styles.srOnly}>系统正在处理</p> : null}
      {success ? <p aria-live="polite" className={styles.successMessage}>{success}</p> : null}
      {projectionRecovery ? (
        <div className={styles.errorMessage} role="alert">
          <p>
            {projectionRecovery === "consent"
              ? "撤回已完成，但页面状态刷新失败。"
              : "申诉已提交，但页面状态刷新失败。"}
            请重新同步页面状态后再继续。
          </p>
          {error ? <p>{error}</p> : null}
          <button
            className={styles.ghostButton}
            disabled={loading}
            onClick={() => void retryProjectionRecovery()}
            type="button"
          >
            重新同步页面状态
          </button>
        </div>
      ) : error ? (
        <p className={styles.errorMessage} role="alert">{error}</p>
      ) : null}
    </aside>
  );
}
