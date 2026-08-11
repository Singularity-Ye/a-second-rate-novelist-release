import React from "react";
import styles from "./world-lab.module.css";

function splitSentences(block: string) {
  // Closing quotes/brackets belong to the sentence before them. If they are
  // excluded from the match, a dialogue ending in `？”` becomes a paragraph
  // containing only `”`.
  const sentences = block.match(/[^。！？!?；;]+[。！？!?；;](?:[”’"』」》〉】）\)]*)?|[^。！？!?；;]+$/gu)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [block];
  if (sentences.length <= 1) return sentences;
  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(""));
  }
  return paragraphs;
}

/**
 * Keeps model text unchanged while making newline-free summaries readable.
 * Explicit paragraph breaks win; otherwise complete Chinese/English sentences
 * are grouped two at a time so short cards do not become a stack of fragments.
 */
export function splitManuscriptAnalysisParagraphs(value: string) {
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized) return [];
  const chunks = normalized
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap(splitSentences);
  return chunks.reduce<string[]>((paragraphs, chunk) => {
    // Some providers put a closing quote on its own line. Treat it as a
    // continuation of the preceding paragraph instead of displaying a lone
    // punctuation mark.
    if (paragraphs.length > 0 && /^[”’"』」》〉】）\)]/u.test(chunk)) {
      paragraphs[paragraphs.length - 1] += chunk;
    } else {
      paragraphs.push(chunk);
    }
    return paragraphs;
  }, []);
}

export function ManuscriptAnalysisText({ text, compact = false }: { text: string; compact?: boolean }) {
  const paragraphs = splitManuscriptAnalysisParagraphs(text);
  return (
    <div className={`${styles.manuscriptAnalysisText} ${compact ? styles.manuscriptAnalysisTextCompact : ""}`}>
      {paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 16)}`}>{paragraph}</p>)}
    </div>
  );
}
