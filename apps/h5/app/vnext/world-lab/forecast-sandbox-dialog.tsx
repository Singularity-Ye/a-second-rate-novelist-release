"use client";

import React, { useEffect, useMemo, useState } from "react";
import { branchPath, type InteractiveStoryState } from "./interactive-branch";
import type { ForecastSandboxResult } from "./forecast-sandbox";
import type { WorldRecord } from "./world-lab-data";
import styles from "./world-lab.module.css";

export interface ForecastRunSelection {
  sourceTurnId: string;
  actorNodeIds: [string, string, string];
  event: string;
}

interface ForecastSandboxDialogProps {
  open: boolean;
  world: WorldRecord | null;
  state: InteractiveStoryState | null;
  sandboxes: ForecastSandboxResult[];
  pending: boolean;
  error: string | null;
  onClose(): void;
  onRun(selection: ForecastRunSelection): void;
  onConvert(sandboxId: string, trajectoryId: string): void;
}

const RISK_LABEL = { low: "稳健", medium: "变数较多", high: "高风险" } as const;

function errorCopy(code: string) {
  if (code === "provider_timeout") return "角色推演超时，沙盘没有写入任何结果；可以原样重试。";
  if (code === "provider_rate_limited") return "模型网关正在限流，沙盘没有写入任何结果；稍等一下再试。";
  if (code === "provider_connection_reset" || code === "provider_unavailable") return "本机模型链暂时不可用；角色与正史没有发生变化。";
  return "模型没有返回可验证的角色行动与世界裁定，沙盘已失败关闭。";
}

export function ForecastSandboxDialog({
  open,
  world,
  state,
  sandboxes,
  pending,
  error,
  onClose,
  onRun,
  onConvert,
}: ForecastSandboxDialogProps) {
  const characters = useMemo(() => world?.nodes.filter((node) => node.kind === "character" && node.character) ?? [], [world]);
  const activeBranch = state?.branches.find((branch) => branch.id === state.activeBranchId) ?? null;
  const activePath = useMemo(() => state ? branchPath(state) : [], [state]);
  const availableCheckpoints = useMemo(
    () => state?.checkpoints.filter((checkpoint) => activePath.some((turn) => turn.id === checkpoint.turnId)) ?? [],
    [activePath, state],
  );
  const [selectedActors, setSelectedActors] = useState<string[]>([]);
  const [sourceTurnId, setSourceTurnId] = useState("");
  const [event, setEvent] = useState("原有秩序突然被打破：一名本不该出现的人带来了无法忽视的证据。");
  const [convertedTrajectoryId, setConvertedTrajectoryId] = useState<string | null>(null);
  const latest = sandboxes.at(-1) ?? null;

  useEffect(() => {
    if (!open) return;
    setSelectedActors(characters.slice(0, 3).map((node) => node.id));
    setSourceTurnId(activeBranch?.headTurnId ?? "");
    setConvertedTrajectoryId(null);
  }, [activeBranch?.headTurnId, characters, open]);

  if (!open) return null;

  const toggleActor = (nodeId: string) => {
    setSelectedActors((current) => current.includes(nodeId)
      ? current.filter((id) => id !== nodeId)
      : current.length < 3 ? [...current, nodeId] : current);
  };

  const submit = () => {
    if (selectedActors.length !== 3 || !sourceTurnId || !event.trim()) return;
    onRun({ sourceTurnId, actorNodeIds: selectedActors as [string, string, string], event: event.trim() });
  };

  return (
    <div className={styles.forecastBackdrop} role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && !pending && onClose()}>
      <section aria-labelledby="forecast-sandbox-title" aria-modal="true" className={styles.forecastDialog} role="dialog">
        <header>
          <div>
            <span>Forecast Sandbox · clean-room</span>
            <h2 id="forecast-sandbox-title">让角色自己把未来走一遍</h2>
            <p>三个角色分别思考，世界裁定它们的行动冲突；所有结果都与正史隔离。</p>
          </div>
          <button aria-label="关闭剧情推演" disabled={pending} onClick={onClose} type="button">×</button>
        </header>

        <div className={styles.forecastBody}>
          <section className={styles.forecastSetup} aria-label="推演设置">
            <div className={styles.forecastStepHeading}><span>01</span><div><strong>选择起点</strong><p>可从当前走线，或这条走线上的命名存档开始。</p></div></div>
            <select aria-label="推演起点" disabled={pending || !state} onChange={(changeEvent) => setSourceTurnId(changeEvent.target.value)} value={sourceTurnId}>
              {activeBranch ? <option value={activeBranch.headTurnId}>当前走线 · {activeBranch.title}</option> : null}
              {availableCheckpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.turnId}>存档 · {checkpoint.title}</option>)}
            </select>

            <div className={styles.forecastStepHeading}><span>02</span><div><strong>选择三名角色</strong><p>每名角色只会收到自己的角色卡、可见关系和相关记忆。</p></div></div>
            {characters.length >= 3 ? (
              <div className={styles.forecastActorPicker}>
                {characters.map((node) => (
                  <label key={node.id} data-active={selectedActors.includes(node.id)}>
                    <input checked={selectedActors.includes(node.id)} disabled={pending || (!selectedActors.includes(node.id) && selectedActors.length >= 3)} onChange={() => toggleActor(node.id)} type="checkbox" />
                    <span><strong>{node.label}</strong><small>{node.character?.role}</small></span>
                  </label>
                ))}
              </div>
            ) : (
              <p className={styles.forecastMissingActors}>当前世界只有 {characters.length} 张完整角色卡。至少需要三名角色；导入已有小说或让故事继续发现角色后再试。</p>
            )}

            <div className={styles.forecastStepHeading}><span>03</span><div><strong>注入共同事件</strong><p>所有角色看见同一件事，但会根据各自认知作出不同选择。</p></div></div>
            <textarea aria-label="推演共同事件" disabled={pending} maxLength={1_000} onChange={(changeEvent) => setEvent(changeEvent.target.value)} rows={4} value={event} />
            <button className={styles.forecastRunButton} disabled={pending || characters.length < 3 || selectedActors.length !== 3 || !sourceTurnId || !event.trim()} onClick={submit} type="button">
              {pending ? "三名角色正在独立思考，随后由世界裁定…" : "开始三角色剧情推演"}
            </button>
            <small>需要 3 次并行角色调用与 1 次世界裁定，通常比普通续写更久。中断时不会写入半截结果。</small>
            {error ? <p className={styles.forecastError} role="alert">{errorCopy(error)}</p> : null}
          </section>

          <section className={styles.forecastResults} aria-label="推演结果">
            {latest ? (
              <>
                <div className={styles.forecastResultHeader}>
                  <div><span>{latest.trace.model} · 3 actor traces + 1 adjudicator</span><strong>{latest.event}</strong></div>
                  <small>沙盘候选 · 未写入正史</small>
                </div>

                <div className={styles.forecastRounds}>
                  {latest.rounds.map((round) => (
                    <article key={round.round}>
                      <span>ROUND {round.round}</span>
                      <strong>{round.publicEvent}</strong>
                      <ul>{round.actions.map((action) => {
                        const actor = latest.actors.find((item) => item.nodeId === action.actorNodeId);
                        return <li key={action.actorNodeId}><b>{actor?.name}</b>：{action.action}<small>{action.outcome}</small></li>;
                      })}</ul>
                      <p>{round.resolution}</p>
                    </article>
                  ))}
                </div>

                <section className={styles.forecastInterviews} aria-label="角色采访">
                  <h3>问角色：你为什么这样做？</h3>
                  {latest.actors.map((actor) => (
                    <details key={actor.nodeId}>
                      <summary>{actor.name} · {actor.objective}</summary>
                      <p>{actor.interviewAnswer}</p>
                    </details>
                  ))}
                </section>

                <section className={styles.forecastTrajectories} aria-label="可能剧情走向">
                  <h3>三条可能走向</h3>
                  {latest.trajectories.map((trajectory, index) => (
                    <article key={trajectory.id} data-risk={trajectory.risk}>
                      <div><span>0{index + 1} · {RISK_LABEL[trajectory.risk]}</span><strong>{trajectory.title}</strong></div>
                      <p>{trajectory.summary}</p>
                      <ol>{trajectory.causalChain.map((cause) => <li key={cause}>{cause}</li>)}</ol>
                      <button onClick={() => { onConvert(latest.id, trajectory.id); setConvertedTrajectoryId(trajectory.id); }} type="button">
                        {convertedTrajectoryId === trajectory.id ? "已转成当前走线" : "把这条可能性变成走线"}
                      </button>
                    </article>
                  ))}
                </section>
              </>
            ) : (
              <div className={styles.forecastEmpty}>
                <strong>未来还没有被运行。</strong>
                <p>这不是一次普通续写：角色会先分别行动，世界再裁定谁成功、谁误判，以及关系如何变化。</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
