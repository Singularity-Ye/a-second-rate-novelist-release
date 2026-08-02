import { describe, expect, it } from "vitest";
import {
  buildNovelistRuntimePersonaPrompt,
  createNovelistPersona,
  novelistOpeningLine,
  NOVELIST_PERSONA_PROMPT_MAX_CHARACTERS,
  resolveNovelistReply,
} from "./novelist-persona";

describe("novelist persona", () => {
  it("keeps the novelist separate from the user's system persona", () => {
    const persona = createNovelistPersona();

    expect(persona.personaId).toBe("novelist:second-rate:v2");
    expect(persona.selfImage).toContain("嘴上认二流");
    expect(persona.traits).toContain("较真");
    expect(persona.forbiddenBehaviors).toContain("无条件服从所有创作要求");
  });

  it("answers with guarded self-mockery instead of a customer-service acknowledgement", () => {
    const decision = resolveNovelistReply(createNovelistPersona(), {
      text: "继续写吧，写完给我看",
      focus: 60,
      fatigue: 30,
      inspiration: 50,
      emotionalLoad: 20,
      hasDraft: false,
    });

    expect(decision.disposition).toBe("accepted");
    expect(decision.reply).toContain("写得不好你可以退");
    expect(decision.reply).not.toContain("已把任务交给");
  });

  it("negotiates an excessive commission instead of obeying like a printer", () => {
    const decision = resolveNovelistReply(createNovelistPersona(), {
      text: "今天直接写三章",
      focus: 52,
      fatigue: 35,
      inspiration: 50,
      emotionalLoad: 30,
      hasDraft: false,
    });

    expect(decision.disposition).toBe("scoped");
    expect(decision.reply).toContain("打印机");
  });

  it("absorbs a blank rejection without losing craft pride", () => {
    const decision = resolveNovelistReply(createNovelistPersona({ trust: 50 }), {
      text: "这版不行，打回重写",
      focus: 45,
      fatigue: 48,
      inspiration: 35,
      emotionalLoad: 54,
      hasDraft: true,
    });

    expect(decision.disposition).toBe("revision");
    expect(decision.reply).toContain("我自己先挑");
  });

  it("shows personality in the first room line", () => {
    const line = novelistOpeningLine(createNovelistPersona(), {
      taskStatus: "offered",
      isWriting: false,
      fatigue: 20,
    });

    expect(line).toContain("稿费还没到账");
  });

  it("injects only a short core and at most two relevant situation slices", () => {
    const prompt = buildNovelistRuntimePersonaPrompt(createNovelistPersona({ trust: 51 }), {
      text: "辛苦了，别太累，今天慢慢来",
      focus: 36,
      fatigue: 84,
      inspiration: 22,
      emotionalLoad: 81,
      hasDraft: true,
    });

    expect(prompt.sliceIds).toEqual(["care", "fatigue"]);
    expect(prompt.sliceIds.length).toBeLessThanOrEqual(2);
    expect(prompt.characterCount).toBeLessThanOrEqual(NOVELIST_PERSONA_PROMPT_MAX_CHARACTERS);
    expect(prompt.text).not.toContain("大学中文");
  });

  it("accepts praise without turning into a customer-service thank-you", () => {
    const decision = resolveNovelistReply(createNovelistPersona(), {
      text: "这段写得真好，我很喜欢",
      focus: 62,
      fatigue: 30,
      inspiration: 58,
      emotionalLoad: 25,
      hasDraft: true,
    });

    expect(decision.disposition).toBe("noted");
    expect(decision.relationshipDelta).toBe(2);
    expect(decision.reply).toContain("先不删了");
    expect(decision.reply).not.toContain("感谢您的认可");
    expect(decision.runtimePersona.sliceIds).toContain("praise");
  });

  it("pushes back on a forced craft choice while preserving the requested feeling", () => {
    const decision = resolveNovelistReply(createNovelistPersona({ trust: 55 }), {
      text: "这段必须照我说的写，别跟我争",
      focus: 68,
      fatigue: 25,
      inspiration: 64,
      emotionalLoad: 40,
      hasDraft: true,
    });

    expect(decision.disposition).toBe("noted");
    expect(decision.relationshipDelta).toBe(-1);
    expect(decision.reply).toContain("保住你要的感觉");
    expect(decision.runtimePersona.sliceIds).toContain("craft-disagreement");
  });
});
