import type {
  ExperiencePublicErrorCode,
  ExperienceRecoveryAction,
  ExperienceState,
  VnextComplianceProcessingPurpose,
  VnextOwnedSafetyCaseResponse,
} from "@erliu/shared-contracts/vnext-experience";

export const VNEXT_PRODUCT_PROMISE = "把一句故事，交给一个会记得你的私人小说家。";

export const EXPERIENCE_STATE_COPY: Readonly<
  Record<ExperienceState, { eyebrow: string; scene: string }>
> = {
  available: {
    eyebrow: "灯还亮着",
    scene: "桌上留着一张空稿纸。你说一句，他从这一句开始。",
  },
  listening: {
    eyebrow: "正在听",
    scene: "委托已经收好。小韩只确认真正影响故事的那一件事。",
  },
  writing: {
    eyebrow: "正在起笔",
    scene: "这不是进度表。稿件写好并真正保存后，才会出现在这里。",
  },
  revising: {
    eyebrow: "正在改稿",
    scene: "旧稿仍然保留；新版本完成前，不会用一句“改好了”代替作品。",
  },
  draft_ready: {
    eyebrow: "稿纸送到",
    scene: "这是一份待你阅读的真实草稿，还没有进入正式故事。",
  },
  unavailable: {
    eyebrow: "写作台暂未开放",
    scene: "系统会说明哪里没有准备好。不会用模板正文假装创作成功。",
  },
};

function errorContent(code: ExperiencePublicErrorCode) {
  switch (code) {
    case "invalid_request":
      return { title: "这次提交没有被接收", body: "请检查刚才填写的内容，再试一次。" };
    case "authentication_required":
      return { title: "还没有进入这个房间", body: "重新经过门口说明后即可继续。" };
    case "session_expired":
      return { title: "这次房间会话已经结束", body: "可以重新进入；系统不会把旧 cookie 当成有效身份。" };
    case "not_found":
      return { title: "没有找到可由你查看的内容", body: "请刷新当前状态；系统不会透露其他人的故事信息。" };
    case "stale_version":
      return { title: "故事状态刚刚更新了", body: "先刷新最新理解，再确认是否提交刚才的修改。" };
    case "temporarily_unavailable":
      return { title: "写作服务暂时没有准备好", body: "委托不会被假稿替代。稍后可从同一状态恢复。" };
    case "compliance_blocked":
      return { title: "当前会话已停止继续处理", body: "你仍可查看边界、撤回选择、申诉或立即退出。" };
    case "safety_blocked":
      return { title: "这次生成已由系统停止", body: "这是系统安全决定，不由小韩劝留。你可以查看原因、申诉或退出。" };
    case "conflict":
      return { title: "同一动作已有不同结果", body: "为避免覆盖真实状态，请刷新后再决定下一步。" };
  }
}

function recoveryCopy(recovery: ExperienceRecoveryAction) {
  switch (recovery) {
    case "retry_current_task":
      return "重试当前委托";
    case "refresh_projection":
      return "刷新最新状态";
    case "return_later":
      return "稍后重试";
    case "restore_session":
      return "重新进入房间";
    case "refresh_admission":
      return "重新确认服务";
    case "correct_request":
      return "修改后重试";
    case "appeal_safety_decision":
      return "查看并申诉";
    case "none":
      return "当前没有自动恢复动作";
  }
}

export function publicErrorCopy(
  code: ExperiencePublicErrorCode,
  recovery: ExperienceRecoveryAction,
) {
  return {
    ...errorContent(code),
    recovery: recoveryCopy(recovery),
  };
}

export function consentPurposeCopy(purpose: VnextComplianceProcessingPurpose) {
  switch (purpose) {
    case "core_creative":
      return "完成这次故事创作";
    case "external_experience":
      return "参与受控体验";
    case "model_training":
      return "用于改进模型（可选）";
  }
}

export function safetyCaseCopy(
  safetyCase: VnextOwnedSafetyCaseResponse,
) {
  const status =
    safetyCase.status === "open"
      ? "等待处理"
      : safetyCase.status === "appealed"
        ? "申诉已提交"
        : "处理已结束";
  const action =
    safetyCase.disposition === "block"
      ? "本次内容已停止生成"
      : safetyCase.disposition === "escalate"
        ? "本次情况已进入受控处理"
        : "当前互动范围已被限制";
  const urgency =
    safetyCase.severity === "critical" || safetyCase.severity === "high"
      ? "需要优先处理"
      : "系统已记录";
  return { status, action, urgency };
}
