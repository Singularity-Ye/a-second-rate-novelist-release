import {
  EXPERIENCE_VERSIONED_SEMANTIC_ACTIONS,
  type ExperienceAction,
  type ExperienceProjection,
  type ExperienceSemanticAction,
  type ExperienceState,
} from "@erliu/shared-contracts/vnext-experience";
import {
  reduceExperienceState,
  type ExperienceStateFacts,
} from "../domain/experience-state.js";

export interface ExperienceProjectionSource extends ExperienceStateFacts {
  versionId: string;
  correctionWhileWritingAllowed: boolean;
  correctionRecoveryAllowed: boolean;
  understanding?: ExperienceProjection["understanding"];
}

interface ProjectionActionCopy {
  code: ExperienceSemanticAction;
  label: string;
}

interface ProjectionCopy {
  headline: string;
  body: string;
  primaryAction: ProjectionActionCopy | null;
  secondaryActions: readonly ProjectionActionCopy[];
}

const VERSIONED_ACTIONS = new Set<ExperienceSemanticAction>(
  EXPERIENCE_VERSIONED_SEMANTIC_ACTIONS,
);

const COPY_BY_STATE: Readonly<Record<ExperienceState, ProjectionCopy>> = {
  available: {
    headline: "小韩在这里",
    body: "把你想看的人、关系或感受告诉我。",
    primaryAction: { code: "submit_intent", label: "说说想看的故事" },
    secondaryActions: [],
  },
  listening: {
    headline: "正在理解你的委托",
    body: "我会先确认核心欲望和不可越过的边界。",
    primaryAction: null,
    secondaryActions: [{ code: "return_later", label: "稍后再来" }],
  },
  writing: {
    headline: "正在为你写",
    body: "委托已保存。完成前不会用模板内容冒充作品。",
    primaryAction: null,
    secondaryActions: [{ code: "return_later", label: "稍后再来" }],
  },
  revising: {
    headline: "正在按你的意思修改",
    body: "旧版本会保留，新版本写好后再交给你。",
    primaryAction: null,
    secondaryActions: [{ code: "return_later", label: "稍后再来" }],
  },
  draft_ready: {
    headline: "新稿已写好",
    body: "这仍是待你阅读和决定的草稿。",
    primaryAction: { code: "open_draft", label: "阅读新稿" },
    secondaryActions: [],
  },
  unavailable: {
    headline: "当前还不能开始",
    body: "当前条件还未满足，现在没有正在等待重试的委托。",
    primaryAction: null,
    secondaryActions: [{ code: "return_later", label: "稍后再来" }],
  },
};

const RETRYABLE_UNAVAILABLE_COPY: ProjectionCopy = {
  headline: "现在还写不了",
  body: "委托仍然保留，但目前没有产出可阅读的内容。",
  primaryAction: { code: "retry_current_task", label: "重试" },
  secondaryActions: [{ code: "return_later", label: "稍后再来" }],
};

export function projectExperience(source: ExperienceProjectionSource): ExperienceProjection {
  if (source.versionId.trim().length === 0) {
    throw new Error("Experience projection versionId must be non-empty");
  }
  if (
    source.retryableTaskVersionId !== null &&
    source.retryableTaskVersionId.trim().length === 0
  ) {
    throw new Error("retryableTaskVersionId must be null or non-empty");
  }
  const status = reduceExperienceState(source);
  const baseCopy =
    status === "unavailable" &&
    source.retryableTaskVersionId !== null &&
    !source.complianceBlocked
      ? RETRYABLE_UNAVAILABLE_COPY
      : COPY_BY_STATE[status];
  const understanding = source.understanding ?? null;
  if (
    understanding !== null &&
    (understanding.versionId.trim().length === 0 ||
      understanding.statement.trim().length === 0 ||
      (understanding.clarificationQuestion !== null &&
        understanding.clarificationQuestion.trim().length === 0))
  ) {
    throw new Error("understanding projection fields must be non-empty");
  }
  const hasPendingClarification =
    source.awaitingClarification &&
    understanding?.clarificationQuestion !== null &&
    understanding?.clarificationQuestion !== undefined;
  const correctionAllowed =
    understanding !== null &&
    !source.unreadPersistedDraft &&
    !source.activeTaskKinds.includes("understand") &&
    !source.complianceBlocked &&
    ((!source.readinessBlocked &&
      (hasPendingClarification ||
        source.correctionWhileWritingAllowed)) ||
      source.correctionRecoveryAllowed);
  const copy: ProjectionCopy = correctionAllowed
    ? hasPendingClarification
      ? {
          ...baseCopy,
          primaryAction: {
            code: "correct_understanding",
            label: "回答这个问题",
          },
        }
      : {
          ...baseCopy,
          secondaryActions: [
            {
              code: "correct_understanding",
              label: "不是这个意思",
            },
            ...baseCopy.secondaryActions,
          ],
        }
    : baseCopy;
  const projectAction = (action: ProjectionActionCopy): ExperienceAction => {
    if (VERSIONED_ACTIONS.has(action.code)) {
      const basedOnVersionId =
        action.code === "retry_current_task"
          ? source.retryableTaskVersionId
          : action.code === "correct_understanding"
            ? understanding?.versionId ?? null
            : source.versionId;
      if (basedOnVersionId === null) {
        throw new Error(`Versioned action ${action.code} has no version target`);
      }
      return { ...action, basedOnVersionId } as ExperienceAction;
    }
    return { ...action } as ExperienceAction;
  };
  return {
    versionId: source.versionId,
    status,
    headline: copy.headline,
    body: copy.body,
    understanding,
    primaryAction: copy.primaryAction === null ? null : projectAction(copy.primaryAction),
    secondaryActions: copy.secondaryActions.map(projectAction),
  };
}
