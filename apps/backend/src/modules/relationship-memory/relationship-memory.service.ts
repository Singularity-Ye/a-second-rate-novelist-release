import type { RelationshipMemoryType } from "@erliu/shared-contracts";
import { createRelationshipMemoryRepository } from "../../common/repositories/relationship-memory.repository.js";

const MEMORY_TTL_HOURS: Record<RelationshipMemoryType, number> = {
  care_signal: 240,
  reassurance: 336,
  tease: 168,
  complaint: 120,
  ritual: 720,
};

export async function captureRelationshipMemory(input: {
  account_id: string;
  story_workspace_id: string | null;
  message_id: string;
  text: string;
}) {
  const memory_type = classifyRelationshipMemory(input.text);

  if (!memory_type) {
    return null;
  }

  const now = new Date();
  return createRelationshipMemoryRepository().createMemory({
    account_id: input.account_id,
    story_workspace_id: input.story_workspace_id,
    message_id: input.message_id,
    memory_type,
    summary_text: summarizeText(input.text),
    expires_at: new Date(now.getTime() + MEMORY_TTL_HOURS[memory_type] * 60 * 60 * 1000).toISOString(),
    visibility_scope: "chat_only",
    created_at: now.toISOString(),
  });
}

export function classifyRelationshipMemory(text: string): RelationshipMemoryType | null {
  if (!text.trim()) {
    return null;
  }

  if (/(想你|抱抱|陪我|难过|委屈)/.test(text)) {
    return "care_signal";
  }

  if (/(别离开|会一直|别走|还会在吗)/.test(text)) {
    return "reassurance";
  }

  if (/(暧昧|撩|调情|亲一下)/.test(text)) {
    return "tease";
  }

  if (/(你怎么又|失约|鸽我|生气)/.test(text)) {
    return "complaint";
  }

  if (/(晚安|早安|先记一下这个感觉|例行)/.test(text)) {
    return "ritual";
  }

  return null;
}

function summarizeText(text: string) {
  return text.trim().slice(0, 180);
}
