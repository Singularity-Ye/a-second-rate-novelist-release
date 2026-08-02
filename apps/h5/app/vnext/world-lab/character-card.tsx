"use client";

import React, { useEffect, useState } from "react";
import type { CharacterProfile, CharacterTruthStatus, WorldNode } from "./world-lab-data";
import styles from "./world-lab.module.css";

export interface CharacterRelation {
  id: string;
  label: string;
  direction: "outgoing" | "incoming";
  target: WorldNode;
}

export interface CharacterCardProps {
  node: WorldNode & { character: CharacterProfile };
  relations: CharacterRelation[];
  onClose: () => void;
  onPortraitUpload: (file: File) => Promise<string | null>;
  onPortraitGenerate: (prompt: string) => Promise<string | null>;
  onSelectRelation: (nodeId: string) => void;
}

const STATUS_LABEL: Record<CharacterTruthStatus, string> = {
  canon: "正文确认",
  candidate: "AI 候选",
  unknown: "等待补充",
};

const SOURCE_LABEL = {
  fixture: "原型素材",
  upload: "本地上传",
  generated: "模型生成",
} as const;

export function CharacterCard({
  node,
  relations,
  onClose,
  onPortraitUpload,
  onPortraitGenerate,
  onSelectRelation,
}: CharacterCardProps) {
  const [portraitNotice, setPortraitNotice] = useState<string | null>(null);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [generationPending, setGenerationPending] = useState(false);
  const [prompt, setPrompt] = useState(`${node.label}，${node.character.tagline}`);

  useEffect(() => {
    setPrompt(`${node.label}，${node.character.tagline}`);
    setPortraitNotice(null);
    setGenerationNotice(null);
  }, [node.id, node.label, node.character.tagline]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const error = await onPortraitUpload(file);
    setPortraitNotice(error ?? `已在当前会话中预览 ${file.name}，没有上传到服务器。`);
    event.target.value = "";
  };

  const generatePortrait = async () => {
    setGenerationPending(true);
    setGenerationNotice(null);
    try {
      const error = await onPortraitGenerate(prompt);
      setGenerationNotice(error ?? "形象已生成并写入当前角色卡。");
    } catch {
      setGenerationNotice("图像生成暂时不可用，角色卡没有写入伪造图片；可以稍后重试或先上传本地图片。");
    } finally {
      setGenerationPending(false);
    }
  };

  return (
    <div className={styles.characterCardBackdrop} onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <aside aria-labelledby="character-card-title" aria-modal="true" className={styles.characterCard} role="dialog">
        <header className={styles.characterCardHeader}>
          <div>
            <span>人物档案 · {node.character.role}</span>
            <h2 id="character-card-title">{node.label}</h2>
            <p>{node.character.tagline}</p>
          </div>
          <button aria-label="关闭角色卡" onClick={onClose} type="button">×</button>
        </header>

        <div className={styles.characterCardBody}>
          <section className={styles.portraitPanel} aria-label="角色形象">
            <div className={styles.portraitFrame}>
              {node.character.portrait ? (
                <img alt={node.character.portrait.alt} src={node.character.portrait.url} />
              ) : (
                <div className={styles.portraitEmpty}>
                  <strong>{node.label.slice(0, 1)}</strong>
                  <span>还没有形象图</span>
                  <small>可以先上传，或稍后交给系统生成</small>
                </div>
              )}
              {node.character.portrait ? (
                <span className={styles.portraitSource}>{SOURCE_LABEL[node.character.portrait.source]}</span>
              ) : null}
            </div>
            <label className={styles.portraitUpload}>
              <span>{node.character.portrait ? "更换本地图片" : "上传本地图片"}</span>
              <input accept="image/png,image/jpeg,image/webp,image/gif" aria-label="上传角色形象" onChange={upload} type="file" />
            </label>
            <small>仅在当前浏览器会话预览，不上传、不持久化。支持 PNG、JPEG、WebP、GIF，最大 5 MB。</small>
            {portraitNotice ? <p className={styles.cardNotice} role="status">{portraitNotice}</p> : null}

            <div className={styles.generationBox}>
              <label htmlFor="character-image-prompt">给生图模型的描述</label>
              <textarea id="character-image-prompt" onChange={(event) => setPrompt(event.target.value)} value={prompt} />
              <button disabled={!prompt.trim() || generationPending} onClick={() => void generatePortrait()} type="button">{generationPending ? "生成中…" : "生成角色形象"}</button>
              {generationNotice ? (
                <div className={styles.providerNotice} role="status">
                  <p>{generationNotice}</p>
                </div>
              ) : (
                <small>系统会使用当前可用的图像生成能力；你不需要选择模型。失败时不会伪造图片。</small>
              )}
            </div>
          </section>

          <div className={styles.characterTruthColumn}>
            <section aria-labelledby="character-truth-heading">
              <div className={styles.cardSectionHeading}>
                <div><span>人物真值</span><h3 id="character-truth-heading">有内容，也要知道内容从哪来</h3></div>
                <small>{node.character.fields.filter((field) => field.status === "canon").length} 项已确认</small>
              </div>
              <div className={styles.characterFields}>
                {node.character.fields.map((field) => (
                  <article data-status={field.status} key={field.id}>
                    <div><span>{field.label}</span><b>{STATUS_LABEL[field.status]}</b></div>
                    <p>{field.value}</p>
                    <small>来源：{field.source}</small>
                  </article>
                ))}
              </div>
            </section>

            <section aria-labelledby="character-relations-heading">
              <div className={styles.cardSectionHeading}>
                <div><span>关系档案</span><h3 id="character-relations-heading">关系不是一条无名的线</h3></div>
                <small>{relations.length} 条</small>
              </div>
              <div className={styles.characterRelations}>
                {relations.map((relation) => (
                  <button key={relation.id} onClick={() => onSelectRelation(relation.target.id)} type="button">
                    <span>{relation.direction === "outgoing" ? `${node.label} → ${relation.target.label}` : `${relation.target.label} → ${node.label}`}</span>
                    <strong>{relation.label}</strong>
                    <b>{relation.target.label}</b>
                    <small>{relation.target.kind === "character" ? "打开对方角色卡" : "在图谱中查看节点"}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
