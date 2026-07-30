"use client";

import React from "react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { BranchDetailResponse } from "@erliu/shared-contracts";
import { acceptMergeProposal, createMergeProposal, fetchBranchDetail } from "../../../../lib/branch-api";

const mergeModeCards = [
  {
    value: "selective_patch",
    title: "挑选片段并回主线",
    description: "适合只把局部灵感并回去，不整体替换。",
  },
  {
    value: "replace",
    title: "整段替换主线",
    description: "当这条支线已经明显优于当前正文时使用。",
  },
  {
    value: "keep_parallel",
    title: "先保留平行线",
    description: "不急着并回主线，先把它留作备用版本。",
  },
];

function branchTypeLabel(branchType: string) {
  switch (branchType) {
    case "alt_ending":
    case "what_if":
      return "换个版本看看";
    case "alt_pov":
    case "alt_voice":
      return "换一个视角重走";
    case "repair_line":
    case "rewrite_path":
      return "修掉这条意难平";
    default:
      return branchType;
  }
}

function rightsModeLabel(rightsMode: BranchDetailResponse["branch"]["rights_mode"]) {
  switch (rightsMode) {
    case "private_sandbox":
      return "只留在私人沙盒";
    case "original_adaptation":
      return "保留转译出口";
    case "export_blocked":
      return "先禁用导出";
    default:
      return rightsMode;
  }
}

export function BranchDetailView() {
  const params = useParams<{ storyId: string; branchId: string }>();
  const [detail, setDetail] = useState<BranchDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetStoryVersionId, setTargetStoryVersionId] = useState("");
  const [mergeMode, setMergeMode] = useState<"replace" | "selective_patch" | "keep_parallel">("selective_patch");
  const [selectedSections, setSelectedSections] = useState("opening");
  const [proposalState, setProposalState] = useState<string | null>(null);
  const [acceptState, setAcceptState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadDetail() {
    try {
      const nextDetail = await fetchBranchDetail({
        story_id: params.storyId,
        branch_id: params.branchId,
      });
      setDetail(nextDetail);
      setTargetStoryVersionId((current) => current || nextDetail.branch.anchor_ref.chapter_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to load branch detail");
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [params.branchId, params.storyId]);

  async function handleCreateProposal() {
    if (!targetStoryVersionId || !detail || submitting) {
      return;
    }

    setSubmitting(true);
    setProposalState(null);

    try {
      const result = await createMergeProposal({
        branch_id: params.branchId,
        target_story_version_id: targetStoryVersionId,
        merge_mode: mergeMode,
        client_request_id: `proposal-${Date.now()}`,
        ...(mergeMode === "selective_patch"
          ? {
              selected_sections: selectedSections
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((label) => ({ label })),
            }
          : {}),
      });
      setProposalState(result.status);
      await loadDetail();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to create merge proposal");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAcceptProposal(proposalId: string) {
    if (!targetStoryVersionId || submitting) {
      return;
    }

    setSubmitting(true);
    setAcceptState(null);

    try {
      const result = await acceptMergeProposal({
        branch_id: params.branchId,
        proposal_id: proposalId,
        target_story_version_id: targetStoryVersionId,
        client_request_id: `accept-proposal-${Date.now()}`,
      });
      setAcceptState(result.status);
      await loadDetail();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to accept merge proposal");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface branch-detail-surface" data-testid="branch-detail-page">
      {error ? <p>{error}</p> : null}
      {!detail && !error ? <p>Loading branch detail...</p> : null}

      {detail ? (
        <div className="branch-detail-layout">
          <div className="branch-detail-main">
            <section className="hero-card branch-detail-hero" data-testid="branch-summary">
              <p className="hero-card__eyebrow">Branch Detail</p>
              <h1>分支详情</h1>
              <div className="branch-detail-tags">
                <span>{branchTypeLabel(detail.branch.branch_type)}</span>
                <span>{detail.branch.merge_status}</span>
              </div>
              <p>{detail.branch.goal}</p>
            </section>

            <section className="panel-card branch-diff-card" data-testid="branch-diff-summary">
              <p className="panel-card__eyebrow">Diff Summary</p>
              <h2>差异摘要</h2>
              <p>当前共有 {detail.diff_summary.changed_sections} 个关键片段发生变化。</p>
              <p>{detail.diff_summary.summary}</p>
              <article className="branch-preview-card">
                <strong>正文预览</strong>
                <p>{detail.branch.body_text}</p>
              </article>
            </section>

            <section className="panel-card branch-proposal-card" data-testid="branch-proposal-actions">
              <p className="panel-card__eyebrow">Merge Proposal</p>
              <h2>决定它和主线的关系</h2>
              <div className="branch-choice-grid">
                {mergeModeCards.map((item) => (
                  <button
                    key={item.value}
                    className="branch-choice-card"
                    data-selected={mergeMode === item.value}
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setMergeMode(item.value as "replace" | "selective_patch" | "keep_parallel");
                    }}
                  >
                    <span>{item.title}</span>
                    <strong>{item.description}</strong>
                  </button>
                ))}
              </div>
              <label>
                目标主线版本
                <input
                  aria-label="目标主线版本"
                  value={targetStoryVersionId}
                  disabled={submitting}
                  onChange={(event) => {
                    setTargetStoryVersionId(event.target.value);
                  }}
                />
              </label>
              <label>
                选区标签
                <input
                  aria-label="选区标签"
                  value={selectedSections}
                  disabled={submitting || mergeMode !== "selective_patch"}
                  onChange={(event) => {
                    setSelectedSections(event.target.value);
                  }}
                />
              </label>
              <button type="button" disabled={submitting || !targetStoryVersionId} onClick={() => void handleCreateProposal()}>
                提交合并建议
              </button>
              {proposalState ? <p data-testid="branch-proposal-state">{proposalState}</p> : null}
              {acceptState ? <p data-testid="branch-accept-state">{acceptState}</p> : null}
            </section>
          </div>

          <aside className="branch-detail-sidebar">
            <section className="panel-card branch-rights-card" data-testid="branch-rights-summary">
              <p className="panel-card__eyebrow">Rights</p>
              <h2>权利边界</h2>
              <p>{rightsModeLabel(detail.rights_summary.rights_mode)}</p>
              <p>{detail.rights_summary.export_allowed ? "当前允许进入导出链" : "当前会被导出链显式拦住"}</p>
              <p>来源锚点：{detail.branch.anchor_ref.chapter_id}</p>
            </section>

            <section className="panel-card branch-merge-list-card" data-testid="branch-merge-proposals">
              <p className="panel-card__eyebrow">Existing Proposals</p>
              <h2>已经存在的合并建议</h2>
              <ul className="branch-proposal-list">
                {detail.merge_proposals.map((item) => (
                  <li key={item.proposal_id}>
                    <strong>
                      {item.status} · {item.merge_mode}
                    </strong>
                    <p>{item.selected_sections.map((section) => section.label).join(" / ") || "整段并回"}</p>
                    {item.status === "draft" ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleAcceptProposal(item.proposal_id)}
                      >
                        接受这份建议
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
