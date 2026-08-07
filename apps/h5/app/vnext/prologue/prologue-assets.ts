export type PrologueIdentity = "student" | "office" | "court" | "cultivator";
export type PrologueScenePhase = "one" | "two" | "climax";

export const PROLOGUE_BACKGROUND_ASSET = {
  id: "prologue.transfer-hub.v1",
  src: "/assets/prologue/transfer-hub-v1.webp",
  role: "identity-selection-and-life-replay-stage",
  promptVersion: "2026-07-21.v1",
  visualContract: {
    palette: "deep indigo, violet, restrained amber-gold, a small ember-orange accent",
    fixedStage: "an abstract liminal transfer buffer with faint orbital rings and cosmic haze",
    center: "large quiet low-contrast dark negative space reserved for story text and interaction panels",
    allowedVocabulary: "light rings, distant particles, violet cloud, amber rim light, ember haze, pressure before a crossing",
    forbiddenVocabulary: "new rooms, cities, schools, offices, palaces, sects, people, faces, vehicles, readable signs, logos, interface widgets",
  },
} as const;

const IDENTITY_ACCENTS: Record<PrologueIdentity, string> = {
  student: "冷白色细线与轻微纸页般的秩序感，只作为情绪色，不改变固定舞台",
  office: "偏冷的青蓝屏光感，只作为疲惫与清醒的情绪色，不生成办公室",
  court: "克制的暗红与旧金礼制感，只作为身份暗示，不生成宫殿",
  cultivator: "蓝紫雷光与金色环阵的压力感，只作为临界感，不生成山门或法器",
};

export function buildPrologueAssetContext(identity: PrologueIdentity, phase: PrologueScenePhase) {
  const phaseHint = phase === "climax"
    ? "高潮可以写越界撞击与异界大运，但背景舞台仍保持固定，不把车辆或事故画进背景。"
    : "当前只写人生记忆片段，不切换到新的地理场景，不提前揭示异界大运。";
  return [
    `绑定视觉资产：${PROLOGUE_BACKGROUND_ASSET.id}。`,
    `固定舞台：${PROLOGUE_BACKGROUND_ASSET.visualContract.fixedStage}。`,
    `色彩：${PROLOGUE_BACKGROUND_ASSET.visualContract.palette}。`,
    `中心区域：${PROLOGUE_BACKGROUND_ASSET.visualContract.center}。`,
    `身份情绪：${IDENTITY_ACCENTS[identity]}。`,
    phaseHint,
    `允许意象：${PROLOGUE_BACKGROUND_ASSET.visualContract.allowedVocabulary}。`,
    `禁止新增：${PROLOGUE_BACKGROUND_ASSET.visualContract.forbiddenVocabulary}。`,
  ].join(" ");
}
