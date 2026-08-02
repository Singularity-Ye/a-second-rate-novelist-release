import type {
  PersonaSnapshotStatus,
  PersonaSurfaceState,
  ReferenceAssetView,
  RoomVisualTokensView,
} from "@erliu/shared-contracts";

export const FRONTSTAGE_ENTRY_ERROR = "这次入口没接稳，回到上一页再进一次就好。";
export const FRONTSTAGE_ACCOUNT_ERROR = "这页还没接上你的账号信息，回到上一页再进一次就好。";

export const FRONTSTAGE_LOADING = {
  assets: "正在把你的书架整理出来……",
  chapter: "正在翻开这一章……",
  chat: "我先把这次对话接回桌前……",
  evidence: "正在把这次留痕材料摊开……",
  export: "正在把这次权利服务回执整理出来……",
  notifications: "正在把房间邮箱整理出来……",
  persona: "我先把最近的状态收拢给你……",
  profile: "正在把你的这页整理出来……",
  profileConfirmation: "我先把这版理解整理出来……",
  report: "正在把这份求助入口准备好……",
  room: "房间正在把桌面和灯光整理给你……",
} as const;

export const FRONTSTAGE_BANNED_TERMS = [
  "Private Novelist",
  "Web H5",
  "Launch Tracking",
  "room-stage",
  "room snapshot",
  "Experience Gateway",
  "Story Backend",
  "asset studio",
  "asset archive",
  "Current Route",
  "Export manifest",
  "Scene Card Set",
  "Missing session token.",
  "Missing account token.",
  "Reader Profile",
  "ReaderProfile",
  "support case",
  "review_pending",
  "snapshot_ready",
  "partial_failed",
  "Beta FAQ",
  "Beta 接线面",
  "launch pack",
  "Invite Code",
  "Canon Seed",
  "AI 小说家",
  "AI 预算",
  "How It Works",
  "F9 wave",
  "Rights Service Desk",
  "Loading story exports",
  "risk report",
  "private_workshop",
  "Failed to fetch",
] as const;

const technicalErrorPattern =
  /(failed to fetch|network ?error|network request failed|(?:history|api|request|load|session|provider|gateway|backend|workspace|snapshot|route)\b.*\bfailed\b|\bfailed\b.*\b(?:fetch|load|request|api|session|provider|gateway|backend|workspace|snapshot|route)\b|token|account_token|manifest|trace|status|error code)/i;

export function toFrontstageErrorCopy(reason: unknown, fallback: string) {
  if (reason instanceof Error && reason.message.trim() && !technicalErrorPattern.test(reason.message)) {
    return reason.message;
  }

  return fallback;
}

export function toRoomSnapshotLabel(status: PersonaSnapshotStatus) {
  switch (status) {
    case "snapshot_ready":
      return "房间已经收拾好";
    case "snapshot_degraded":
      return "房间还在补齐";
    default:
      return "房间状态已更新";
  }
}

export function toPersonaStateLabel(state: PersonaSurfaceState) {
  switch (state) {
    case "welcoming":
      return "刚把位置留给你";
    case "waiting_for_user":
      return "等你继续开口";
    case "writing":
      return "正在往下写";
    case "revising":
      return "正在返修";
    case "stuck":
      return "卡在一句话里";
    case "resting":
      return "先歇一会儿";
    case "asset_processing":
      return "正在翻资料";
    default:
      return "还在继续整理";
  }
}

export function toRoomAmbienceLabel(value: RoomVisualTokensView["ambience"]) {
  switch (value) {
    case "focused":
      return "专注";
    case "welcoming":
      return "温亮";
    case "quiet":
      return "安静";
    case "muted":
      return "微暗";
    case "holding":
      return "留着位置";
    default:
      return "已经更新";
  }
}

export function toRoomLightingLabel(value: RoomVisualTokensView["lighting"]) {
  switch (value) {
    case "bright":
      return "灯光正亮";
    case "warm":
      return "暖灯亮着";
    case "cool":
      return "冷白灯亮着";
    case "amber":
      return "琥珀灯亮着";
    default:
      return "灯光已调好";
  }
}

export function toDeskStateLabel(value: RoomVisualTokensView["desk_state"]) {
  switch (value) {
    case "open_chapter":
      return "这一章还摊着";
    case "annotated":
      return "批注还没收好";
    case "story_boarded":
      return "故事线已经摊开";
    case "paused":
      return "桌面先压住了";
    case "clear":
      return "桌面已经收好";
    default:
      return "桌面有了新变化";
  }
}

export function toWorkspaceStatusLabel(value: "draft" | "active" | "paused" | "archived") {
  switch (value) {
    case "draft":
      return "刚立起来";
    case "active":
      return "正在连载";
    case "paused":
      return "先放一放";
    case "archived":
      return "先收进书架";
    default:
      return "还在继续";
  }
}

export function toReasonCodeLabel(value?: string | null) {
  switch (value) {
    case "ROOM-101":
      return "最近这件事还牵着他";
    default:
      return null;
  }
}

export function toAssetStatusLabel(value: ReferenceAssetView["extract_status"]) {
  switch (value) {
    case "uploaded":
      return "刚放上书架";
    case "review_pending":
      return "待你确认";
    case "ready":
      return "已经整理好";
    case "failed":
      return "这份资料还没读懂";
    case "revoked":
      return "已经撤下";
    default:
      return "还在整理";
  }
}

export function toPrivacyRequestTypeLabel(value: string) {
  switch (value) {
    case "export":
      return "导出资料";
    case "delete":
      return "删除资料";
    case "revoke_consent":
      return "撤回授权";
    default:
      return "数据请求";
  }
}

export function toPrivacyRequestScopeLabel(value: string) {
  switch (value) {
    case "account":
      return "账户";
    case "story":
      return "故事";
    case "asset":
      return "资料";
    default:
      return "当前范围";
  }
}

export function toPrivacyRequestStatusLabel(value: string) {
  switch (value) {
    case "queued":
      return "已收到，正在排队处理中";
    case "cooling_off":
      return "冷静期内，仍可撤回";
    default:
      return "状态已更新";
  }
}

export function toOrderStatusLabel(value: string) {
  switch (value) {
    case "paid":
      return "已支付";
    default:
      return "订单状态已更新";
  }
}

export function toCheckoutStatusLabel(value: string) {
  switch (value) {
    case "active":
      return "已经正式留档";
    case "paid":
      return "已开通，权益已经到账";
    default:
      return "状态已更新";
  }
}

export function toSyncConflictObjectLabel(value: string) {
  switch (value) {
    case "chapter":
      return "章节内容";
    case "story":
      return "故事主线";
    case "asset":
      return "资料记录";
    case "profile":
      return "读者档案";
    default:
      return "这段内容";
  }
}

export function toSyncConflictStatusLabel(value: string) {
  switch (value) {
    case "detected":
      return "发现了版本分歧";
    case "auto_merged":
      return "系统已自动补齐";
    case "user_action_required":
      return "需要你来决定";
    case "resolved":
      return "已经处理好";
    default:
      return "同步状态已更新";
  }
}

export function toFeedbackSurfaceLabel(value: string) {
  switch (value) {
    case "chat":
      return "私聊";
    case "room":
      return "房间";
    case "export":
      return "导出服务";
    case "account":
      return "我的与设置";
    default:
      return "当前页面";
  }
}

export function toFeedbackTargetTypeLabel(value: string) {
  switch (value) {
    case "chat_thread":
      return "私聊会话";
    case "room_session":
      return "房间状态";
    case "export_job":
      return "导出任务";
    case "account_overview":
      return "账户总览";
    default:
      return "当前对象";
  }
}

export function toFeedbackCategoryLabel(value: string) {
  switch (value) {
    case "story_quality":
      return "故事质量";
    case "delivery_blocker":
      return "交付阻断";
    case "channel_sync":
      return "入口同步";
    case "billing_membership":
      return "会员与权益";
    case "onboarding_blocker":
      return "首访阻断";
    case "other":
      return "其他";
    default:
      return "待归类";
  }
}

export function toFeedbackCaseStatusLabel(value: string) {
  switch (value) {
    case "submitted":
      return "已收到";
    case "triaged":
      return "已分流处理中";
    case "pending_user":
      return "等你补充";
    case "resolved":
      return "已经处理好";
    case "rejected":
      return "本次未受理";
    default:
      return "状态已更新";
  }
}

export function toBetaAccessStateLabel(value: string) {
  switch (value) {
    case "ready":
      return "可以继续进入";
    case "waitlisted":
      return "还在排队";
    case "blocked":
      return "暂时无法继续";
    default:
      return "入口状态已更新";
  }
}

export function toBetaOnboardingStatusLabel(value: string) {
  switch (value) {
    case "invite_required":
      return "需要邀请码";
    case "invite_redeemed":
      return "邀请码已兑换";
    case "chat_ready":
      return "可以直接去私聊";
    case "waitlisted":
      return "还在等待开放";
    case "blocked":
      return "当前无法继续";
    default:
      return "下一步已更新";
  }
}

export function toBetaInviteStatusLabel(value: string) {
  switch (value) {
    case "available":
      return "还能继续使用";
    case "redeemed":
      return "已经有人用了";
    case "exhausted":
      return "这组邀请码用完了";
    default:
      return "邀请码状态已更新";
  }
}

export function toEntryChannelLabel(value: string) {
  switch (value) {
    case "h5":
      return "H5";
    case "wechat":
      return "微信";
    case "feishu":
      return "飞书";
    case "web":
      return "网页";
    case "tablet":
      return "平板";
    case "mobile":
      return "手机";
    default:
      return "当前入口";
  }
}
