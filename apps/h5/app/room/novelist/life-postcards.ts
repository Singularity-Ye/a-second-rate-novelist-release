import type { FormalSceneId } from "./scene-manifest";

export type LifePostcard = {
  id: string;
  source: "fieldwork" | "night-look";
  sceneId: FormalSceneId;
  imageSrc: string;
  title: string;
  caption: string;
  message: string;
  stamp: string;
  createdAt: number;
  /** Optional paper ephemera; old stored postcards remain valid without it. */
  routeNote?: string;
  sticker?: string;
  weather?: string;
};

const STORAGE_KEY = "novelist-life-postcards-v1";
const ENTRANCE_MASTER_SRC = "/assets/ecology/formal-scenes/entrance/entrance-scene-master-v1.webp";
let memoryPostcards: LifePostcard[] = [];

function readPostcards(): LifePostcard[] {
  if (typeof window === "undefined") return [...memoryPostcards];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as LifePostcard[] : [];
  } catch {
    return [];
  }
}

function writePostcards(postcards: LifePostcard[]) {
  memoryPostcards = [...postcards];
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(postcards));
  } catch {
    // A postcard is a delightful trace, never a reason to break the room.
  }
}

export function listLifePostcards(): LifePostcard[] {
  return readPostcards().sort((a, b) => b.createdAt - a.createdAt);
}

export function putLifePostcard(postcard: LifePostcard): LifePostcard[] {
  const next = readPostcards().filter((item) => item.id !== postcard.id);
  next.unshift(postcard);
  writePostcards(next.slice(0, 12));
  return next;
}

export function createFieldworkPostcard(sceneId: FormalSceneId = "terrace-greenery", activityId = "terrace-city-look", createdAt = Date.now()): LifePostcard {
  const day = new Date(createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  const variants = [
    {
      title: "门外的夜色",
      caption: "采风归来的第一张明信片",
      message: "今晚没有找到完整的答案，只带回一盏远处的灯。它看起来很像故事还没写完的地方。",
      routeNote: "露台 → 门外 · 夜行采风",
      sticker: "✦",
      weather: "晚风 / 微凉",
    },
    {
      title: "写字楼以外",
      caption: "卡文时绕远了一点",
      message: "卡文没有消失，但街角的风替他把那句难写的话吹薄了一层。明天再试一次。",
      routeNote: "露台 → 门外 · 换气记录",
      sticker: "〰",
      weather: "灯火 / 有风",
    },
    {
      title: "一盏还没命名的灯",
      caption: "带回来的不是答案",
      message: "他把那盏灯记在背面，暂时不给它命名。留白也可以是一种采风成果。",
      routeNote: "露台 → 门外 · 素材采样",
      sticker: "☼",
      weather: "夜色 / 安静",
    },
  ] as const;
  const variant = variants[Math.floor(createdAt / 1000) % variants.length]!;
  return {
    id: `postcard:${activityId}:${createdAt}`,
    source: "fieldwork",
    sceneId,
    imageSrc: ENTRANCE_MASTER_SRC,
    ...variant,
    stamp: `二流小说家 · ${day}`,
    createdAt,
  };
}
