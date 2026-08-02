"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { EvidencePackDetailResponse } from "@erliu/shared-contracts";
import { fetchEvidencePackDetail } from "../../../../lib/export-rights-api";
import {
  ControlSection,
  ControlStaticCell,
  ControlStrip,
} from "../../../../profile/account/control-plane-kit";

function recordTypeLabel(value: string) {
  switch (value) {
    case "risk_check":
      return "风险检查";
    case "export_ready":
      return "导出完成";
    case "rights_statement":
      return "作品说明";
    case "evidence_pack":
      return "留痕清单";
    case "artifact":
      return "导出文件";
    default:
      return "留痕记录";
  }
}

function formatDateTime(value: string) {
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

export function EvidencePackView() {
  const params = useParams<{ storyId: string; packId: string }>();
  const [detail, setDetail] = useState<EvidencePackDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvidencePackDetail({
      story_id: params.storyId,
      pack_id: params.packId,
    })
      .then((nextDetail) => {
        setDetail(nextDetail);
      })
      .catch((reason) => {
        setError(reason instanceof Error && reason.message ? "证据包暂时打不开，请稍后再试。" : "证据包暂时打不开，请稍后再试。");
      });
  }, [params.packId, params.storyId]);

  return (
    <main className="surface evidence-pack-surface" data-testid="evidence-pack-page">
      {error ? <p>{error}</p> : null}
      {!detail && !error ? <p>正在查看证据材料...</p> : null}

      {detail ? (
        <>
          <section className="story-section control-hero">
            <p className="story-section__eyebrow">证据材料</p>
            <h1 className="story-section__title">证据包详情</h1>
            <p className="story-section__copy">
              这里整理的是这次权利服务相关的关键留痕。它不是技术日志墙，而是给你带走、回看、登记辅助时用的材料。
            </p>
            <ControlStrip
              items={[
                {
                  label: "版本",
                  value: detail.manifest_version,
                },
                {
                  label: "记录数",
                  value: `${detail.record_count} 条`,
                },
                {
                  label: "证据包编号",
                  value: detail.pack_id,
                },
                {
                  label: "下载",
                  value: "留痕清单可直接带走",
                },
              ]}
            />
          </section>

          <div className="control-layout">
            <div className="control-main">
              <ControlSection
                eyebrow="关键留痕"
                title="把这次导出的时间线摆出来"
                description="从风险检查到文件生成，证据包应该让你顺着这条时间线看懂发生过什么。"
                testId="evidence-records"
              >
                <ol className="control-list">
                  {detail.records.map((item) => (
                    <li key={item.record_id}>
                      <strong>{item.label}</strong>
                      <span>
                        {recordTypeLabel(item.record_type)} · {formatDateTime(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ol>
              </ControlSection>
            </div>

            <aside className="control-sidebar">
              <ControlSection
                eyebrow="这份包能做什么"
                title="证据材料的使用方式"
                description="平台卖的是权利服务，所以证据包要解释用途，而不是只给一个下载链接。"
                testId="evidence-pack-summary"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title="留痕清单下载"
                    description="把完整留痕清单直接带走，后续用于回看、登记辅助或投稿补充材料。"
                    meta={detail.download_url}
                    status="可下载"
                    tone="live"
                  />
                  <ControlStaticCell
                    title="站外使用"
                    description="和作品说明、风险报告一起，用于站外登记或投稿时补充说明创作过程。"
                    status="已支持"
                    tone="live"
                  />
                </div>
              </ControlSection>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
