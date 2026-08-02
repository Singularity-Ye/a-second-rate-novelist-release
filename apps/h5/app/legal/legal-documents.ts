export type LegalDocumentSlug = "terms" | "privacy" | "aigc";

export const LEGAL_DOCUMENTS: Array<{
  slug: LegalDocumentSlug;
  title: string;
  version: string;
  summary: string;
  bullets: string[];
}> = [
  {
    slug: "terms",
    title: "服务协议",
    version: "2026-04-03",
    summary: "平台提供创作、治理、导出与举报处理服务，不替代法律意见或版权结论。",
    bullets: [
      "平台提供创作、治理、导出、举报与通知服务，不替代法律意见。",
      "用户对下载、传播、公开发布和商业使用承担责任，平台承担治理和留痕责任。",
      "举报、风险审核、导出例外申请和申诉会保留最小必要证据与通知记录。",
    ],
  },
  {
    slug: "privacy",
    title: "隐私政策",
    version: "2026-04-03",
    summary: "所有故事、输入和参考资产默认私密，仅在运行、治理与申诉所需范围内最小必要调阅。",
    bullets: [
      "默认私密：故事、聊天输入、参考资产和房间投影默认不公开。",
      "最小必要留存：仅保留运行、申诉、导出和治理所需记录。",
      "治理与申诉中的调阅只覆盖必要对象，不扩散到无关内容。",
    ],
  },
  {
    slug: "aigc",
    title: "作品标识说明",
    version: "2026-04-03",
    summary: "生成内容默认附带作品标识与创作背景说明；无显式标识仅能走审批留痕流程。",
    bullets: [
      "站内阅读、导出和外发默认保留作品标识与创作背景说明。",
      "无显式标识导出必须走用户确认、风险审核和不少于 180 天留痕。",
      "若发现标识、口径或导出材料异常，可通过统一举报入口提交求助。",
    ],
  },
];
