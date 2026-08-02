"use client";

import React from "react";
import { OpsCaseDeskView } from "../_components/ops-case-desk-view";

export function RightsView() {
  return (
    <OpsCaseDeskView
      testId="ops-rights-page"
      title="权利服务工单"
      eyebrow="Rights Service"
      description="把风险 reviewer、导出链和后续登记辅助动作串成一个可追溯的权利服务台，而不是散落的导出 case。"
      caseType="risk_review"
      queueLabel="权利服务"
      checklist={[
        "确认命中的风险点、素材引用和历史导出是否一致。",
        "输出 approve / warn / block / request_info，并回流通知真源。",
      ]}
    />
  );
}
