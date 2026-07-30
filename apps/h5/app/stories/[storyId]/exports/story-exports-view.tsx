"use client";

import React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  ExportCapabilitiesResponse,
  ExportFormat,
  ExportLabelMode,
  LabelWaiverRequestResponse,
  RiskCheckResponse,
  StoryExportsListResponse,
} from "@erliu/shared-contracts";
import {
  createExportJob,
  createRiskCheck,
  fetchExportCapabilities,
  fetchStoryExports,
  submitLabelWaiverRequest,
} from "../../../lib/export-rights-api";
import { buildFeedbackHref } from "../../../lib/beta-ops-links";
import { useAccountSurfaceSession } from "../../../lib/account-surface-session";
import { buildReportHref } from "../../../lib/reporting-case-links";
import {
  AccountRecoveryStateCard,
  ControlSection,
  ControlStaticCell,
  ControlStrip,
  withAccountQuery,
} from "../../../profile/account/control-plane-kit";
import { FRONTSTAGE_LOADING, toFrontstageErrorCopy } from "../../../lib/frontstage-copy";

const purposeOptions = [
  {
    value: "personal_reading",
    label: "自己阅读",
    eyebrow: "个人留存",
    description: "带走一份随时能回看的稿子，默认保留显式标识和证据包。",
  },
  {
    value: "sharing",
    label: "分享",
    eyebrow: "发给熟人",
    description: "适合发给朋友或共创伙伴，保留平台标识和基础风险提示。",
  },
  {
    value: "submission",
    label: "投稿",
    eyebrow: "重点流程",
    description: "先跑风险检查，再确认标识策略和作品说明，适合投编辑或工作室。",
  },
  {
    value: "commercial_evaluation",
    label: "商业评估",
    eyebrow: "高风险场景",
    description: "生成更完整的权利服务包，帮助你在商业评估前先看清风险。",
  },
  {
    value: "registration_assist",
    label: "登记辅助",
    eyebrow: "材料整理",
    description: "把导出文件、作品说明和证据包一并整理，便于后续站外登记。",
  },
] as const;

const formatLabels: Record<ExportFormat, string> = {
  docx: "DOCX",
  epub: "EPUB",
  pdf: "PDF",
  md: "Markdown",
  txt: "TXT",
};

const statusLabels: Record<string, string> = {
  blocked: "已阻断",
  queued: "已进入队列",
  generating: "正在处理",
  partial_failed: "部分成功",
  succeeded: "已完成",
};

const riskLabels: Record<string, string> = {
  pass: "可继续",
  warn: "需要你确认",
  block: "已阻断",
};

const waiverStatusLabels: Record<string, string> = {
  pending_user_consent: "等待最终确认",
  queued: "已进入队列",
  under_review: "正在核对",
  approved: "已通过",
  rejected: "未通过",
};

const requiredActionLabels: Record<string, string> = {
  submit_label_waiver: "先完成无显式标识申请",
  keep_embedded_notice: "先保留默认合规标识",
  attach_evidence_pack: "先补齐证据包",
};

const targetChannelLabels: Record<string, string> = {
  private_workshop: "私密工作坊提交流转",
};

const issueCopy: Record<string, string> = {
  "CMP-004": "命中了第三方 IP 或禁导对象，必须先回去处理。",
  "CMP-005": "无显式标识导出需要额外确认，建议先保留默认标识。",
};

const LABEL_WAIVER_CONSENT_VERSION = "m3-label-waiver-v1";

const waiverAcknowledgementOptions = [
  {
    code: "ack-download-distribution-responsibility",
    label: "我确认下载、发布或商业使用责任由我承担",
    description: "平台负责服务治理，你对下载、传播和使用承担责任。",
  },
  {
    code: "ack-platform-rights-service-only",
    label: "我理解平台提供的是作品权利服务，不是版权承诺",
    description: "平台不会承诺版权归属、登记必过或替代法律意见。",
  },
  {
    code: "ack-180-day-retention",
    label: "我同意按协议版本留痕保存不少于 180 天",
    description: "本次例外申请会记录协议版本、目标渠道和关键确认内容。",
  },
] as const;

type WaiverAcknowledgementCode = (typeof waiverAcknowledgementOptions)[number]["code"];

const defaultWaiverAcknowledgements: Record<WaiverAcknowledgementCode, boolean> = {
  "ack-download-distribution-responsibility": false,
  "ack-platform-rights-service-only": false,
  "ack-180-day-retention": false,
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "待生成";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPurposeLabel(value: string) {
  return purposeOptions.find((item) => item.value === value)?.label ?? value;
}

function getRequiredActionLabel(value: string) {
  return requiredActionLabels[value] ?? "先补齐这一项";
}

function getIssueHeadline(code: string) {
  return issueCopy[code] ?? "这项风险还没处理完";
}

function getIssueHint(code: string, hint?: string | null) {
  if (!hint) {
    return null;
  }

  if (issueCopy[code] === hint) {
    return null;
  }

  return hint;
}

function getTargetChannelLabel(value: string) {
  return targetChannelLabels[value] ?? "当前提交渠道";
}

export function StoryExportsView() {
  const params = useParams<{ storyId: string }>();
  const session = useAccountSurfaceSession(`/stories/${params.storyId}/exports`, {
    issueTokenForLegacyAccount: true,
  });
  const queryString = session.queryString;
  const token = session.token;
  const [capabilities, setCapabilities] = useState<ExportCapabilitiesResponse | null>(null);
  const [exports, setExports] = useState<StoryExportsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riskCheck, setRiskCheck] = useState<RiskCheckResponse | null>(null);
  const [exportPurpose, setExportPurpose] = useState<string>("submission");
  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(["docx", "pdf"]);
  const [branchIds, setBranchIds] = useState("");
  const [assetRefs, setAssetRefs] = useState("");
  const [labelMode, setLabelMode] = useState<ExportLabelMode>("embedded_notice");
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [includeRightsStatement, setIncludeRightsStatement] = useState(true);
  const [includeSubmissionStatement, setIncludeSubmissionStatement] = useState(true);
  const [exportState, setExportState] = useState<string | null>(null);
  const [latestJobId, setLatestJobId] = useState("");
  const [waiverJustification, setWaiverJustification] = useState("用于灰度提交流转。");
  const [waiverState, setWaiverState] = useState<string | null>(null);
  const [waiverReceipt, setWaiverReceipt] = useState<LabelWaiverRequestResponse | null>(null);
  const [waiverAcknowledgements, setWaiverAcknowledgements] = useState(defaultWaiverAcknowledgements);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const waiverChecklistSatisfied = Object.values(waiverAcknowledgements).every(Boolean);

  async function loadExports() {
    const [nextCapabilities, nextExports] = await Promise.all([
      fetchExportCapabilities(params.storyId),
      fetchStoryExports(params.storyId),
    ]);

    setCapabilities(nextCapabilities);
    setExports(nextExports);

    setSelectedFormats((current) => {
      const intersection = current.filter((item) => nextCapabilities.allowed_formats.includes(item));
      if (intersection.length > 0) {
        return intersection;
      }

      return nextCapabilities.allowed_formats.slice(0, Math.min(2, nextCapabilities.allowed_formats.length));
    });

    if (!latestJobId && nextExports.jobs[0]) {
      setLatestJobId(nextExports.jobs[0].job_id);
    }
  }

  useEffect(() => {
    loadExports().catch((reason) => {
      setError(toFrontstageErrorCopy(reason, "这次权利服务页还没打开，请稍后再试一次。"));
    });
  }, [params.storyId]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface exports-surface" data-testid="story-exports-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  function resetFlowStates() {
    setRiskCheck(null);
    setExportState(null);
    setWaiverState(null);
    setWaiverReceipt(null);
    setRiskAcknowledged(false);
  }

  function toggleFormat(format: ExportFormat) {
    setSelectedFormats((current) => {
      if (current.includes(format)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((item) => item !== format);
      }

      return [...current, format];
    });
    resetFlowStates();
  }

  async function handleRiskCheck() {
    setSubmitting(true);
    setError(null);

    try {
      const result = await createRiskCheck({
        story_id: params.storyId,
        export_purpose: exportPurpose,
        branch_ids: branchIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        asset_refs: assetRefs
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        label_mode_requested: labelMode,
        include_submission_statement: includeSubmissionStatement,
      });
      setRiskCheck(result);
      setRiskAcknowledged(result.result === "pass");
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次风险检查还没跑完，请稍后再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateExport() {
    if (!riskCheck) {
      setError("请先完成风险检查。");
      return;
    }

    if (riskCheck.result === "block") {
      setError("这次风险检查已经拦住了导出，请先回到故事里处理阻断项。");
      return;
    }

    if (riskCheck.result === "warn" && !riskAcknowledged) {
      setError("请先确认你已理解这些风险，再继续导出。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await createExportJob({
        story_id: params.storyId,
        export_purpose: exportPurpose,
        formats: selectedFormats,
        chapter_range: {
          mode: "all",
        },
        branch_ids: branchIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        include_evidence: includeEvidence,
        include_rights_statement: includeRightsStatement,
        label_mode_preference: labelMode,
        risk_check_id: riskCheck.risk_check_id,
        risk_acknowledged: riskCheck.result === "pass" ? true : riskAcknowledged,
        client_request_id: `export-${Date.now()}`,
      });
      setExportState(result.status);
      setLatestJobId(result.job_id);
      await loadExports();
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次导出还没提交成功，请稍后再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitWaiver() {
    if (!latestJobId) {
      setError("请先生成导出任务。");
      return;
    }

    if (labelMode !== "label_waiver_requested") {
      setError("请先切到无显式标识申请模式。");
      return;
    }

    if (!waiverChecklistSatisfied) {
      setError("请先完成协议确认，再提交无显式标识申请。");
      return;
    }

    if (!waiverJustification.trim()) {
      setError("请先补充申请说明，再提交留痕申请。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await submitLabelWaiverRequest({
        story_id: params.storyId,
        export_job_id: latestJobId,
        justification: waiverJustification,
        target_channel: "private_workshop",
        user_acknowledgements: waiverAcknowledgementOptions
          .filter((item) => waiverAcknowledgements[item.code])
          .map((item) => item.code),
      });
      setWaiverState(result.status);
      setWaiverReceipt(result);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次无显式标识申请还没提交成功，请稍后再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface exports-surface" data-testid="story-exports-page">
      {error ? (
        <section className="story-cell exports-inline-state" data-testid="story-exports-error">
          <p className="story-section__eyebrow">导出提醒</p>
          <p>{error}</p>
        </section>
      ) : null}

      {!capabilities || !exports ? (
        <section className="story-cell exports-inline-state">
          <p>{FRONTSTAGE_LOADING.export}</p>
        </section>
      ) : null}

      {capabilities && exports ? (
        <>
          <section className="story-section control-hero exports-summary" data-testid="story-exports-capabilities">
            <div className="story-section__header">
              <p className="story-section__eyebrow">作品权利服务</p>
              <h1 className="story-section__title">作品权利服务</h1>
              <p className="story-section__copy">
                先明确用途，再跑风险检查、补齐标识和证据包。平台提供的是权利服务，不是版权承诺，也不会把你丢进字段结果页。
              </p>
            </div>
            <ControlStrip
              items={[
                {
                  label: "当前状态",
                  value: capabilities.export_allowed ? "当前可导出" : "当前被阻断",
                },
                {
                  label: "剩余导出",
                  value: `${capabilities.quota.remaining_exports_this_period} 次`,
                },
                {
                  label: "证据包额度",
                  value: `${capabilities.quota.rights_pack_remaining} 份`,
                },
                {
                  label: "默认用途",
                  value: getPurposeLabel(exportPurpose),
                },
              ]}
            />
            <ul className="tag-row">
              <li>允许格式：{capabilities.allowed_formats.map((item) => formatLabels[item]).join(" / ")}</li>
            </ul>
            <p className="surface-meta">导出总览以权利服务为准，不以单一按钮为中心。</p>
            <div className="f9-link-grid">
              <Link
                href={`/stories/${params.storyId}${queryString ? `?${queryString}` : ""}`}
              >
                回到故事中枢
              </Link>
              <Link
                href={buildReportHref({
                  surface: "export",
                  account_token: session.accountToken,
                  story_id: params.storyId,
                  target_type: "export_job",
                  target_id: exports.jobs[0]?.job_id ?? params.storyId,
                  target_label: "作品权利服务",
                  token,
                })}
              >
                举报与求助
              </Link>
              <Link
                href={buildFeedbackHref({
                  surface: "export",
                  account_token: session.accountToken,
                  story_id: params.storyId,
                  target_type: "export_job",
                  target_id: exports.jobs[0]?.job_id ?? params.storyId,
                  target_label: "作品权利服务",
                  token,
                })}
              >
                反馈与求助
              </Link>
              <Link href="/legal/terms">服务协议</Link>
              <Link href="/legal/aigc">作品标识说明</Link>
            </div>
          </section>

          <div className="exports-layout">
            <section className="story-section exports-wizard" data-testid="story-exports-actions">
              <div className="story-section__header">
                <p className="story-section__eyebrow">四步向导</p>
                <h2 className="story-section__title">按顺序走完 4 步权利服务向导</h2>
                <p className="story-section__copy">先定用途，再选格式，接着看风险，最后把导出和留痕一起提交。</p>
              </div>
              <div className="exports-step-grid exports-wizard-list">
                <article className="story-cell exports-step-card exports-wizard-step">
                  <p className="exports-step-card__eyebrow">第一步</p>
                  <h2>用途</h2>
                  <p>先说明你想把这本书带去哪里，系统会据此调整风险和标识要求。</p>
                  <div className="exports-choice-grid">
                    {purposeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className="exports-choice-card"
                        data-selected={exportPurpose === option.value}
                        disabled={submitting}
                        onClick={() => {
                          setExportPurpose(option.value);
                          resetFlowStates();
                        }}
                      >
                        <span>{option.eyebrow}</span>
                        <strong>{option.label}</strong>
                        <p>{option.description}</p>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="story-cell exports-step-card exports-wizard-step">
                  <p className="exports-step-card__eyebrow">第二步</p>
                  <h2>内容与格式</h2>
                  <p>默认导出整本故事；先把最常用的格式和附件选齐。</p>
                  <div className="exports-format-grid">
                    {capabilities.allowed_formats.map((format) => (
                      <button
                        key={format}
                        type="button"
                        className="exports-format-pill"
                        data-selected={selectedFormats.includes(format)}
                        disabled={submitting}
                        onClick={() => {
                          toggleFormat(format);
                        }}
                      >
                        {formatLabels[format]}
                      </button>
                    ))}
                  </div>
                  <div className="exports-toggle-list">
                    <label>
                      <input
                        type="checkbox"
                        checked={includeEvidence}
                        disabled={submitting}
                        onChange={(event) => {
                          setIncludeEvidence(event.target.checked);
                          resetFlowStates();
                        }}
                      />
                      附带证据包
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={includeRightsStatement}
                        disabled={submitting}
                        onChange={(event) => {
                          setIncludeRightsStatement(event.target.checked);
                          resetFlowStates();
                        }}
                      />
                      附带作品说明
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={includeSubmissionStatement}
                        disabled={submitting}
                        onChange={(event) => {
                          setIncludeSubmissionStatement(event.target.checked);
                          resetFlowStates();
                        }}
                      />
                      附带投稿说明
                    </label>
                  </div>
                </article>

                <article className="story-cell exports-step-card exports-wizard-step">
                  <p className="exports-step-card__eyebrow">第三步</p>
                  <h2>风险与标识</h2>
                  <p>先看风险，再决定是否保留默认作品标识，或申请无显式标识版本。</p>
                  <div className="exports-label-grid">
                    <button
                      type="button"
                      className="exports-label-card"
                      data-selected={labelMode === "embedded_notice"}
                      disabled={submitting}
                      onClick={() => {
                        setLabelMode("embedded_notice");
                        resetFlowStates();
                      }}
                    >
                      <strong>默认合规标识</strong>
                      <p>适合自己阅读、分享和大多数正式外发场景，平台会保留必要说明。</p>
                    </button>
                    <button
                      type="button"
                      className="exports-label-card"
                      data-selected={labelMode === "label_waiver_requested"}
                      disabled={submitting}
                      onClick={() => {
                        setLabelMode("label_waiver_requested");
                        resetFlowStates();
                      }}
                    >
                      <strong>准备申请无显式标识</strong>
                      <p>只在你确认用户义务后提供，并保留不少于 6 个月的协议留痕。</p>
                    </button>
                  </div>
                  {riskCheck ? (
                    <div className="exports-risk-panel" data-testid="story-exports-risk-check">
                      <p className="exports-risk-panel__eyebrow">风险结果</p>
                      <strong>{riskLabels[riskCheck.result]}</strong>
                      <p>有效期至 {formatDateTime(riskCheck.valid_until)}</p>
                      {riskCheck.issues.length > 0 ? (
                        <ul className="exports-issue-list">
                          {riskCheck.issues.map((item) => (
                            <li key={`${item.code}-${item.object_ref?.ref_id ?? "story"}`}>
                              <strong>{getIssueHeadline(item.code)}</strong>
                              {getIssueHint(item.code, item.resolution_hint) ? (
                                <span>{getIssueHint(item.code, item.resolution_hint)}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>这次检查没有阻断项，可以继续提交。</p>
                      )}
                      {riskCheck.required_actions.length > 0 ? (
                        <p>下一步：{riskCheck.required_actions.map((item) => getRequiredActionLabel(item)).join(" / ")}</p>
                      ) : null}
                      <p>
                        风险报告已生成：
                        <a href={riskCheck.risk_report.download_url}>下载风险回执</a>
                      </p>
                      {riskCheck.result === "warn" ? (
                        <label className="exports-risk-acknowledgement">
                          <input
                            type="checkbox"
                            aria-label="我已理解这些风险"
                            checked={riskAcknowledged}
                            disabled={submitting}
                            onChange={(event) => {
                              setRiskAcknowledged(event.target.checked);
                            }}
                          />
                          我已理解这些风险
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </article>

                <article className="story-cell exports-step-card exports-wizard-step">
                  <p className="exports-step-card__eyebrow">第四步</p>
                  <h2>提交</h2>
                  <p>确认本次导出的服务包内容，再发起异步任务。</p>
                  <div className="exports-preview-card">
                    <p>
                      本次用途：<strong>{getPurposeLabel(exportPurpose)}</strong>
                    </p>
                    <p>
                      导出格式：<strong>{selectedFormats.map((item) => formatLabels[item]).join(" / ")}</strong>
                    </p>
                    <p>
                      证据材料：<strong>{includeEvidence ? "附带证据包" : "仅导出稿件"}</strong>
                    </p>
                    <p>
                      标识策略：<strong>{labelMode === "embedded_notice" ? "默认合规标识" : "准备走无显式标识申请"}</strong>
                    </p>
                  </div>
                  <div className="story-intake-commission-actions">
                    <button type="button" disabled={submitting} onClick={() => void handleRiskCheck()}>
                      先跑风险检查
                    </button>
                    <button
                      type="button"
                      disabled={
                        submitting ||
                        !riskCheck ||
                        riskCheck.result === "block" ||
                        (riskCheck.result === "warn" && !riskAcknowledged)
                      }
                      onClick={() => void handleCreateExport()}
                    >
                      提交这次导出
                    </button>
                    <button type="button" className="secondary-button" disabled={submitting} onClick={() => void loadExports()}>
                      刷新状态
                    </button>
                  </div>
                  <label className="exports-textarea">
                    申请说明
                    <textarea
                      aria-label="申请说明"
                      value={waiverJustification}
                      disabled={submitting}
                      onChange={(event) => {
                        setWaiverJustification(event.target.value);
                      }}
                    />
                  </label>
                  {labelMode === "label_waiver_requested" ? (
                    <section className="story-cell exports-waiver-protocol" data-testid="story-exports-waiver-protocol">
                      <p className="story-section__eyebrow">协议确认</p>
                      <h3>无显式标识申请必须先完成用户确认</h3>
                      <p>
                        协议版本 {LABEL_WAIVER_CONSENT_VERSION}。本次申请会记录目标渠道、协议版本和你的确认内容，
                        留存不少于 180 天，并可回流到通知与审计链。
                      </p>
                      <ul className="exports-sidebar-list">
                        <li>
                          <strong>当前目标渠道</strong>
                          <span>{getTargetChannelLabel("private_workshop")}</span>
                        </li>
                        <li>
                          <strong>产品口径</strong>
                          <span>平台提供的是权利服务，不是版权承诺</span>
                        </li>
                        <li>
                          <strong>留痕周期</strong>
                          <span>留存不少于 180 天</span>
                        </li>
                      </ul>
                      <div className="exports-toggle-list">
                        {waiverAcknowledgementOptions.map((item) => (
                          <label key={item.code} className="exports-risk-acknowledgement">
                            <input
                              type="checkbox"
                              aria-label={item.label}
                              checked={waiverAcknowledgements[item.code]}
                              disabled={submitting}
                              onChange={(event) => {
                                setWaiverAcknowledgements((current) => ({
                                  ...current,
                                  [item.code]: event.target.checked,
                                }));
                              }}
                            />
                            <span>{item.label}</span>
                            <small>{item.description}</small>
                          </label>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  <button
                    type="button"
                    className="exports-waiver-button"
                    disabled={
                      submitting ||
                      !latestJobId ||
                      labelMode !== "label_waiver_requested" ||
                      !waiverChecklistSatisfied ||
                      !waiverJustification.trim()
                    }
                    onClick={() => void handleSubmitWaiver()}
                  >
                    申请无显式标识
                  </button>
                  {exportState ? (
                    <p className="surface-meta" data-testid="story-exports-create-state">
                      {statusLabels[exportState] ?? "导出请求已提交"}
                    </p>
                  ) : null}
                  {waiverState ? (
                    <p className="surface-meta" data-testid="story-exports-waiver-state">
                      已提交留痕申请 · {waiverStatusLabels[waiverState] ?? "已进入处理"}
                      {waiverReceipt
                        ? ` · ${waiverReceipt.consent_version} · ${waiverReceipt.waiver_request_id} · 留存至 ${formatDateTime(waiverReceipt.retained_until)}`
                        : ""}
                    </p>
                  ) : null}
                </article>
              </div>

              <details className="exports-advanced">
                <summary>高级对象范围</summary>
                <p>当前默认导出整本故事；如需精确控制，可补充特定分支或引用素材。</p>
                <label className="exports-textarea">
                  指定分支（可选，逗号分隔）
                  <textarea
                    aria-label="指定分支"
                    value={branchIds}
                    disabled={submitting}
                    onChange={(event) => {
                      setBranchIds(event.target.value);
                      resetFlowStates();
                    }}
                  />
                </label>
                <label className="exports-textarea">
                  指定资料引用（可选，逗号分隔）
                  <textarea
                    aria-label="指定资料引用"
                    value={assetRefs}
                    disabled={submitting}
                    onChange={(event) => {
                      setAssetRefs(event.target.value);
                      resetFlowStates();
                    }}
                  />
                </label>
              </details>
            </section>

            <aside className="exports-sidebar">
              <section className="story-cell exports-sidebar-cell">
                <p className="story-section__eyebrow">当前状态</p>
                <h2>本次权利服务会带走什么</h2>
                <ul className="exports-sidebar-list">
                  <li>导出文件</li>
                  <li>{includeEvidence ? "证据包" : "不附带证据包"}</li>
                  <li>{includeRightsStatement ? "作品说明模板" : "不附带作品说明"}</li>
                  <li>{includeSubmissionStatement ? "投稿说明" : "不附带投稿说明"}</li>
                </ul>
              </section>

              <section className="story-cell exports-sidebar-cell">
                <p className="story-section__eyebrow">最近风控</p>
                <h2>风险提醒</h2>
                {capabilities.latest_risk_summary ? (
                  <>
                    <p>{riskLabels[capabilities.latest_risk_summary.result] ?? "请先复核风险"}</p>
                    <p>有效期至 {formatDateTime(capabilities.latest_risk_summary.valid_until)}</p>
                    <ul className="exports-sidebar-list">
                      {capabilities.latest_risk_summary.issue_codes.map((item) => (
                        <li key={item}>{issueCopy[item] ?? "还有一项风险待处理"}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>还没有最近一次风险摘要，建议先跑一遍检查再导出。</p>
                )}
              </section>

              <section className="story-cell exports-sidebar-cell">
                <p className="story-section__eyebrow">最近证据包</p>
                <h2>档案柜</h2>
                {capabilities.latest_evidence_pack_id ? (
                  <Link href={withAccountQuery(`/stories/${params.storyId}/evidence-packs/${capabilities.latest_evidence_pack_id}`, queryString)}>
                    查看最新证据包
                  </Link>
                ) : (
                  <p>还没有生成过证据包，首次导出时会自动整理一份。</p>
                )}
              </section>
            </aside>
          </div>

          <section className="story-section exports-history" data-testid="story-exports-list">
            <div className="story-section__header">
              <p className="story-section__eyebrow">最近导出</p>
              <h2 className="story-section__title">结果记录</h2>
            </div>
            {exports.jobs.length === 0 ? (
              <p>还没打包过这本书，可以直接从上面的向导开始。</p>
            ) : (
              <div className="story-cell-list story-cell-list--two exports-history-grid exports-history-list">
                {exports.jobs.map((item) => (
                  <Link
                    key={item.job_id}
                    className="story-cell story-cell--link exports-history-card exports-history-cell"
                    href={withAccountQuery(`/stories/${item.story_id}/exports/${item.job_id}`, queryString)}
                  >
                    <strong>
                      {statusLabels[item.status] ?? "已提交"}
                    </strong>
                    <span>
                      {getPurposeLabel(item.export_purpose)} · {item.requested_formats
                        .map((format) => formatLabels[format])
                        .join(" / ")}
                    </span>
                    <span>{formatDateTime(item.created_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <ControlSection
            eyebrow="未开放边界"
            title="这些更深层权利服务先明确保留位"
            description="人工审核增强版、模板库和试读版属于后续扩展，本轮不在导出主面伪装成已开放升级入口。"
          >
            <div className="control-cell-list">
              <ControlStaticCell
                title="人工审核增强版"
                value="后续增值服务"
                description="高价值稿件的人审增强仍是保留位，本轮只交付基础权利服务。"
                status="未开放"
                tone="reserved"
              />
              <ControlStaticCell
                title="协议 / 模板库"
                value="后续扩展"
                description="合作写作、授权、委托创作模板库暂未开放。"
                status="未开放"
                tone="reserved"
              />
              <ControlStaticCell
                title="分享试读版"
                value="后续扩展"
                description="只读试读链接不在当前首轮开放范围，避免被误当成已经可用的出站能力。"
                status="未开放"
                tone="reserved"
              />
            </div>
          </ControlSection>
        </>
      ) : null}
    </main>
  );
}
