"use client";

import React, { useEffect, useState } from "react";
import type { SyncStatusResponse } from "@erliu/shared-contracts";
import { createChannelBinding, fetchSyncStatus, resolveSyncConflict } from "../../../lib/account-membership-api";
import { useAccountSurfaceSession } from "../../../lib/account-surface-session";
import {
  FRONTSTAGE_LOADING,
  toSyncConflictObjectLabel,
  toSyncConflictStatusLabel,
  toFrontstageErrorCopy,
} from "../../../lib/frontstage-copy";
import {
  AccountRecoveryStateCard,
  channelLabel,
  ControlActionRow,
  ControlSection,
  ControlStaticCell,
  ControlStrip,
  syncHealthLabel,
} from "../control-plane-kit";

const secondSurfaceOptions = [
  {
    channel: "web",
    label: "Web",
    description: "在浏览器里继续追更、改稿或处理导出。",
  },
  {
    channel: "tablet",
    label: "平板",
    description: "适合长时间沉浸阅读、看设定和改大段内容。",
  },
  {
    channel: "mobile",
    label: "手机",
    description: "碎片时间补记灵感，和主线保持同步。",
  },
] as const;

export function SyncStatusView() {
  const session = useAccountSurfaceSession("/profile/account/sync");
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolveState, setResolveState] = useState<string | null>(null);
  const [bindingState, setBindingState] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadSyncStatus(accountToken: string) {
    const result = await fetchSyncStatus(accountToken);
    setSyncStatus(result);
    return result;
  }

  useEffect(() => {
    if (!session.accountToken) {
      return;
    }

    void loadSyncStatus(session.accountToken).catch((reason) => {
      setError(toFrontstageErrorCopy(reason, "同步状态这会儿还没打开。"));
    });
  }, [session.accountToken]);

  if (session.recoveryState !== "ready") {
    return (
      <main className="surface sync-status-surface" data-testid="sync-status-page">
        <AccountRecoveryStateCard
          state={session.recoveryState}
          retryHref={session.retryHref}
          roomHref={session.roomHref}
          homeHref={session.homeHref}
        />
      </main>
    );
  }

  async function handleResolve(conflictId: string) {
    const accountToken = session.accountToken;
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await resolveSyncConflict({
        account_token: accountToken,
        conflict_id: conflictId,
        resolution: "create_branch",
      });
      setResolveState(toSyncConflictStatusLabel(result.status));
      await loadSyncStatus(accountToken);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这次冲突还没处理成功。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBindSecondarySurface(channel: (typeof secondSurfaceOptions)[number]["channel"]) {
    const accountToken = session.accountToken;
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createChannelBinding({
        account_token: accountToken,
        channel,
        provider_user_id: `${channel}-${accountToken}-self-serve`,
        set_as_primary: false,
      });
      setBindingState(`${channelLabel(channel)} 续写端已接入，系统正在比对版本差异。`);
      await loadSyncStatus(accountToken);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "这台设备还没接进来，再试一次。"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh() {
    const accountToken = session.accountToken;
    if (!accountToken || submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await loadSyncStatus(accountToken);
    } catch (reason) {
      setError(toFrontstageErrorCopy(reason, "同步状态还没刷新出来。"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="surface sync-status-surface" data-testid="sync-status-page">
      {error ? <p>{error}</p> : null}
      {!syncStatus && !error ? <p>{FRONTSTAGE_LOADING.profile}</p> : null}

      {syncStatus ? (
        <>
          <section className="story-section control-hero" data-testid="sync-health">
            <p className="story-section__eyebrow">同步与恢复</p>
            <h1 className="story-section__title">让设备接力，而不是互相覆盖</h1>
            <p className="story-section__copy">
              多端同步的任务不是炫设备数量，而是保证换机、补绑、离线修改和冲突处理都能被用户看懂、接住、决定。
            </p>
            <ControlStrip
              items={[
                {
                  label: "同步健康",
                  value: syncHealthLabel(syncStatus.sync_health),
                },
                {
                  label: "当前设备",
                  value: `${syncStatus.device_count} 台`,
                },
                {
                  label: "待处理冲突",
                  value: `${syncStatus.pending_conflict_count} 个`,
                },
                {
                  label: "离线积压",
                  value: `${syncStatus.offline_changes_count} 个`,
                },
              ]}
            />
          </section>

          <div className="control-layout">
            <div className="control-main">
              <ControlSection eyebrow="正在接力的设备" title="把当前续写端直接摆出来">
                <div className="control-cell-list">
                  {syncStatus.active_devices.map((device) => (
                    <ControlStaticCell
                      key={device.device_id}
                      title={channelLabel(device.device_type)}
                      value={`最近活跃 ${new Date(device.last_active_at).toLocaleString("zh-CN")}`}
                      description="这个设备正在参与同一段故事的接力，任何冲突都必须被显式抬出来。"
                      status="已接入"
                      tone="live"
                    />
                  ))}
                </div>
              </ControlSection>

              <ControlSection
                eyebrow="绑定与恢复"
                title="接入新的续写端"
                description="先接入，再比对，再决定；不允许用“自动同步”掩盖真实的版本差异。"
                testId="sync-binding-card"
              >
                <ControlActionRow>
                  {secondSurfaceOptions.map((option) => (
                    <button
                      key={option.channel}
                      type="button"
                      className="secondary-button"
                      disabled={submitting}
                      onClick={() => void handleBindSecondarySurface(option.channel)}
                    >
                      接入 {option.label} 续写端
                    </button>
                  ))}
                  <button type="button" className="secondary-button" disabled={submitting} onClick={() => void handleRefresh()}>
                    刷新同步状态
                  </button>
                </ControlActionRow>
                <div className="control-cell-list">
                  {secondSurfaceOptions.map((option) => (
                    <ControlStaticCell
                      key={`${option.channel}-note`}
                      title={option.label}
                      description={option.description}
                      status="可接入"
                      tone="live"
                    />
                  ))}
                </div>
                {bindingState ? <p data-testid="channel-binding-state">{bindingState}</p> : null}
              </ControlSection>

              <ControlSection
                eyebrow="冲突处理"
                title="真正需要你决定的版本冲突"
                description="冲突不被隐藏，也不被一键覆盖；优先保留分支证据。"
                testId="sync-conflicts"
              >
                <ul className="control-list control-list--actions">
                  {syncStatus.pending_conflicts.map((item) => (
                    <li key={item.conflict_id}>
                      <div>
                        <strong>{toSyncConflictObjectLabel(item.object_type)}出现了版本分歧</strong>
                        <span>{toSyncConflictStatusLabel(item.status)}，建议先开分支再继续处理。</span>
                      </div>
                      <button type="button" disabled={submitting} onClick={() => void handleResolve(item.conflict_id)}>
                        为这次冲突开分支
                      </button>
                    </li>
                  ))}
                </ul>
                {resolveState ? <p data-testid="sync-resolve-state">{resolveState}</p> : null}
              </ControlSection>
            </div>

            <aside className="control-sidebar">
              <ControlSection
                eyebrow="同步原则"
                title="规则先说清楚"
                description="同步的控制感来自可见边界，而不是系统替你做了什么你却不知道。"
              >
                <div className="control-cell-list">
                  <ControlStaticCell
                    title="不允许静默覆盖"
                    description="任何冲突都必须进入显式处理。"
                    status="硬规则"
                    tone="alert"
                  />
                  <ControlStaticCell
                    title="优先保留证据"
                    description="先开分支再继续编辑，避免把多端编辑痕迹抹掉。"
                    status="硬规则"
                    tone="alert"
                  />
                </div>
              </ControlSection>
            </aside>
          </div>
        </>
      ) : null}
    </main>
  );
}
