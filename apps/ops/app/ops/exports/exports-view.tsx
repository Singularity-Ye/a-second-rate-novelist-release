"use client";

import React from "react";
import { OpsCaseDeskView } from "../_components/ops-case-desk-view";

export function ExportsView() {
  return (
    <OpsCaseDeskView
      testId="ops-exports-page"
      title="人工导出复核台"
      eyebrow="Export Desk"
      description="把 warn / block / 无显式标识申请和人工导出判断收敛成一个 reviewer 可操作的台面。"
      caseType="export_review"
      queueLabel="导出复核"
      checklist={[
        "核对导出目的、显式标识方式和证据包是否一致。",
        "必要时回到故事 360、用户 360 和通知真源继续追查。",
      ]}
    />
  );
}
