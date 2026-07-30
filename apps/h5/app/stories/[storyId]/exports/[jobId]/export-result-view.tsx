"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ExportArtifactView, ExportJobDetailResponse } from "@erliu/shared-contracts";
import { useAccountSurfaceSession } from "../../../../lib/account-surface-session";
import { fetchExportJobDetail } from "../../../../lib/export-rights-api";
import {
  AccountRecoveryStateCard,
  ControlActionRow,
  ControlSection,
  ControlStaticCell,
  ControlStrip,
  withAccountQuery,
} from "../../../../profile/account/control-plane-kit";

const statusLabels: Record<string, string> = {
  blocked: "已阻断",
  queued: "已进入队列",
  generating: "正在处理",
  partial_failed: "部分成功",
  succeeded: "已完成",
};

const riskLabels: Record<string, string> = {
  pass: "可继续使用",
  warn: "带风险提示",
  block: "不可出站",
};

const labelModeLabels: Record<string, string> = {
  embedded_notice: "默认嵌入标识",
  label_waiver_requested: "无显式标识留痕",
};

const labelDecisionLabels: Record<string, string> = {
  default_embedded: "默认安全标识",
  waiver_pending: "等待无显式标识申请补齐",
  waiver_submitted: "无显式标识申请已留痕",
};

const issueCopy: Record<string, string> = {
  "CMP-004": "这次结果碰到了不适合直接带出的内容，需要先回到故事里处理。",
  "CMP-005": "当前版本涉及需要补充说明的情况，下载前请先确认协议与目标渠道。",
};

function jobStatusLabel(value: string) {
  return statusLabels[value] ?? "处理中";
}

function riskLabel(value: string) {
  return riskLabels[value] ?? "需留意";
}

function labelModeLabel(value: string) {
  return labelModeLabels[value] ?? "默认标识";
}

function labelDecisionLabel(value: string) {
  return labelDecisionLabels[value] ?? "已留痕";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "待完成";
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

function artifactLabel(item: ExportArtifactView) {
  return `${item.format.toUpperCase()} · ${item.file_name}`;
}

function isExpired(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() < Date.now();
}

export function ExportResultView() {
  const params = useParams<{ storyId: string; jobId: string }>();
  const session = useAccountSurfaceSession(`/stories/${params.storyId}/exports/${params.jobId}`, {
    issueTokenForLegacyAccount: true,
  });
  const [detail, setDetail] = useState<ExportJobDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchExportJobDetail({
      story_id: params.storyId,
      job_id: params.jobId,
    })
      .then((nextDetail) => {
        setDetail(nextDetail);
      })
      .catch((reason) => {
        setError(reason instanceof Error && reason.message ? "结果暂时打不开，请稍后再试。" : "结果暂时打不开，请稍后再试。");
      });
  }, [params.jobId, params.storyId]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface export-result-surface" data-testid="export-result-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  return (
    <main className="surface export-result-surface" data-testid="export-result-page">
      {error ? <p>{error}</p> : null}
      {!detail && !error ? <p>正在查看导出结果...</p> : null}

      {detail ? (
        (() => {
          const queryString = session.queryString;
          const notificationHref = withAccountQuery("/notifications", queryString);
          const exportsHref = withAccountQuery(`/stories/${params.storyId}/exports`, queryString);
          const evidenceHref = detail.evidence_pack_id
            ? withAccountQuery(`/stories/${params.storyId}/evidence-packs/${detail.evidence_pack_id}`, queryString)
            : null;
          const hasExpiredArtifacts = detail.artifacts.some((item) => isExpired(item.expires_at));

          return (
            <>
              <section className="story-section control-hero">
                <p className="story-section__eyebrow">权利服务回执</p>
                <h1 className="story-section__title">{jobStatusLabel(detail.job.status)}</h1>
                <p className="story-section__copy">
                  这是一次作品权利服务回执。这里不只是告诉你结果好了没，而是把风险、标识、证据和后续补救路径一并说清楚。
                </p>
                <ControlStrip
                  items={[
                    {
                      label: "任务状态",
                      value: jobStatusLabel(detail.job.status),
                    },
                    {
                      label: "风险结论",
                      value: riskLabel(detail.control_result.verdict),
                    },
                    {
                      label: "标识方式",
                      value: labelModeLabel(detail.label_mode_effective),
                    },
                    {
                      label: "通知",
                      value: detail.job.notification_id ? "已送达" : "暂无通知",
                    },
                  ]}
                />
              </section>

              <div className="control-layout">
                <div className="control-main">
                  <ControlSection
                    eyebrow="服务回执"
                    title="这次结果不是死路，仍有恢复与补救路径"
                    description="导出结果页要告诉你：现在拿到了什么、哪里还有风险、下一步该怎么继续。"
                    testId="export-recovery-panel"
                  >
                    <div className="control-cell-list" data-testid="export-summary">
                      <ControlStaticCell
                        title="任务状态"
                        value={jobStatusLabel(detail.job.status)}
                        description={detail.job.status === "partial_failed" ? "有一部分文件先完成了，缺的那部分还能补。" : "这次结果已经保存，可以继续查看。"}
                        meta={`创建于 ${formatDateTime(detail.job.created_at)} · 完成于 ${formatDateTime(detail.job.finished_at)}`}
                        status={jobStatusLabel(detail.job.status)}
                        tone={detail.job.status === "partial_failed" ? "alert" : "live"}
                      />
                      <ControlStaticCell
                        title="恢复建议"
                        value={detail.job.status === "partial_failed" ? "先带走现有文件，再补齐缺失部分" : "当前结果可继续使用"}
                        description={
                          detail.job.status === "partial_failed"
                            ? "缺失的部分不会吞掉整次结果。先下载已成功文件，再回到导出页补齐。"
                            : "这次导出已完成，但仍保留通知和重新生成入口，方便你后续继续处理。"
                        }
                        meta={hasExpiredArtifacts ? "部分文件已过期，需要重新生成。" : "当前没有过期文件。"}
                        status={hasExpiredArtifacts ? "需要补救" : "已可继续"}
                        tone={hasExpiredArtifacts ? "alert" : "live"}
                      />
                    </div>
                    <ControlActionRow>
                      {detail.job.status === "partial_failed" ? (
                        <Link className="control-link-button" href={exportsHref}>
                          重新补齐缺失文件
                        </Link>
                      ) : null}
                      {hasExpiredArtifacts ? (
                        <Link className="control-link-button" href={exportsHref}>
                          重新生成结果
                        </Link>
                      ) : null}
                      {detail.job.notification_id && notificationHref ? (
                        <Link className="control-link-button" href={notificationHref}>
                          查看通知
                        </Link>
                      ) : null}
                    </ControlActionRow>
                  </ControlSection>

                  <ControlSection
                    eyebrow="可带走文件"
                    title="导出文件"
                    description="把真实可下载的文件和过期状态明确摆出来，不让你对失效链接碰运气。"
                    testId="export-artifacts"
                  >
                    <div className="control-cell-list">
                      {detail.artifacts.map((item) => {
                        const expired = isExpired(item.expires_at);

                        return (
                          <div key={item.artifact_id}>
                            <ControlStaticCell
                              title={artifactLabel(item)}
                              value={`${item.file_size_mb} MB`}
                              description={expired ? "下载链接已过期，请回导出中心重新生成。" : `有效期至 ${formatDateTime(item.expires_at)}`}
                              meta={expired ? `已过期 ${formatDateTime(item.expires_at)}` : "下载按钮会直接打开文件，不需要复制地址。"}
                              status={expired ? "已过期" : "可下载"}
                              tone={expired ? "alert" : "live"}
                            />
                            {!expired ? (
                              <ControlActionRow>
                                <a className="control-link-button" href={item.download_url}>
                                  下载 {item.format.toUpperCase()}
                                </a>
                              </ControlActionRow>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </ControlSection>

                  <ControlSection
                    eyebrow="说明与证据"
                    title="把权利服务材料一次说清楚"
                    description="风险报告、交付清单、作品说明和证据包都应该在这里直接看懂。"
                  >
                    <div className="control-cell-list">
                      {detail.rights_statement_url ? (
                        <ControlStaticCell
                          title="作品说明与标识"
                          description={`当前标识方式：${labelModeLabel(detail.label_mode_effective)}；决策状态：${labelDecisionLabel(detail.control_result.label_decision_state)}。`}
                          meta="下方按钮会直接打开作品说明，不需要再复制链接。"
                          status="已附带"
                          tone="live"
                        />
                      ) : (
                        <ControlStaticCell
                          title="作品说明与标识"
                          description="这次没有附带作品说明模板。"
                          status="未附带"
                          tone="soft"
                        />
                      )}
                      <ControlStaticCell
                        title="风险报告"
                        description={detail.risk_summary.issue_codes.length > 0 ? detail.risk_summary.issue_codes.map((item) => issueCopy[item] ?? item).join(" / ") : "未检测到额外风险项。"}
                        meta="下方按钮会直接打开风险报告，方便你留档或转给协作者。"
                        status={riskLabel(detail.control_result.verdict)}
                        tone={detail.control_result.verdict === "warn" ? "alert" : "live"}
                      />
                      <ControlStaticCell
                        title="交付清单"
                        description="交付清单说明这次权利服务具体产出了哪些材料。"
                        meta="下方按钮会直接打开交付清单。"
                        status="已附带"
                        tone="live"
                      />
                      <ControlStaticCell
                        title="留痕清单"
                        description="这份清单保留给追溯和归档，不作为面对用户的主叙事。"
                        meta="平台会保留留痕清单；需要核对时从下方按钮查看。"
                        status="已附带"
                        tone="soft"
                      />
                    </div>
                    <ControlActionRow>
                      {detail.rights_statement_url ? (
                        <a className="control-link-button" href={detail.rights_statement_url}>
                          查看作品说明
                        </a>
                      ) : null}
                      <a className="control-link-button" href={detail.risk_report.download_url}>
                        下载风险报告
                      </a>
                      <a className="control-link-button" href={detail.delivery_manifest.download_url}>
                        下载交付清单
                      </a>
                      <a className="control-link-button" href={detail.export_manifest.download_url}>
                        查看留痕清单
                      </a>
                      {evidenceHref ? (
                        <Link className="control-link-button" href={evidenceHref}>
                          查看证据包
                        </Link>
                      ) : null}
                    </ControlActionRow>
                    {detail.rights_statement_url ? (
                      <section data-testid="export-rights-statement">
                        <span>查看作品说明</span>
                      </section>
                    ) : null}
                    {evidenceHref ? (
                      <section data-testid="export-evidence-link">
                        <span>查看证据包</span>
                      </section>
                    ) : null}
                  </ControlSection>
                </div>

                <aside className="control-sidebar" data-testid="export-risk-summary">
                  <ControlSection
                    eyebrow="风险摘要"
                    title="导出结果"
                    description="结果页也继续提醒你：平台提供的是权利服务，不是版权承诺。"
                    testId="export-control-result"
                  >
                    <div className="control-cell-list">
                      <ControlStaticCell
                        title="风险结论"
                        value={riskLabel(detail.control_result.verdict)}
                        description={`实际标识方式：${labelModeLabel(detail.control_result.label_mode_effective)}`}
                        meta={`决策状态：${labelDecisionLabel(detail.control_result.label_decision_state)}`}
                        status={detail.control_result.required_actions.length > 0 ? detail.control_result.required_actions.join(" / ") : "无需额外动作"}
                        tone={detail.control_result.verdict === "warn" ? "alert" : "live"}
                      />
                      <ControlStaticCell
                        title="通知回流"
                        value={detail.job.notification_id ? "已送达通知" : "暂无通知"}
                        description={
                          notificationHref
                            ? "可直接回到通知里查看这次权利服务回流。"
                            : "当前页面没有账号信息，先不显示通知入口，避免你点到空页。"
                        }
                        status={notificationHref ? "可查看" : "需账号信息"}
                        tone={notificationHref ? "live" : "soft"}
                      />
                      <ControlStaticCell
                        title="后续能力"
                        value="仍在准备中"
                        description="一些更深的整理方式还在准备，本页先不把它们写成已开放入口。"
                        status="未开放"
                        tone="reserved"
                      />
                    </div>
                  </ControlSection>
                </aside>
              </div>
            </>
          );
        })()
      ) : null}
    </main>
  );
}
