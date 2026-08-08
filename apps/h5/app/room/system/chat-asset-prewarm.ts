const sharedChatAssets = [
  "/assets/ui/system-layer-materials-v4/chat-frame-wide-v4-alpha.webp",
  "/assets/ui/system-layer-materials-v6/central-chat-paper-v6-alpha.webp",
  "/assets/ui/system-layer-materials-v6/writing-input-bar-v6-alpha.webp",
  "/assets/ui/system-layer-materials-v6/room-title-bookmark-v6-alpha.webp",
  "/assets/ui/system-layer-materials-v6/novelist-status-v6-alpha.webp",
  "/assets/ui/system-layer-materials-v4/avatar-frame-v4-alpha.webp",
  "/assets/ecology/characters/novelist/avatars/novelist-avatar-writing-v1-normalized.webp",
] as const;

const secondaryChatAssets = [
  "/assets/ui/system-layer-materials-v5/suggestion-rail-v5-alpha.webp",
  "/assets/ui/system-layer-materials-v5/normalized-v5.1/intent-card-care-v5-alpha-normalized.webp",
  "/assets/ui/system-layer-materials-v5/normalized-v5.1/intent-card-nudge-v5-alpha-normalized.webp",
  "/assets/ui/system-layer-materials-v5/normalized-v5.1/intent-card-rest-v5-alpha-normalized.webp",
  "/assets/ui/system-layer-materials-v5/normalized-v5.1/intent-card-stuck-v5-alpha-normalized.webp",
  "/assets/ui/system-layer-materials-v6/creative-progress-v6-alpha.webp",
] as const;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface ChatAssetPrewarmOptions {
  readonly windowTarget?: Window;
  readonly createImage?: () => HTMLImageElement;
  readonly idleTimeoutMs?: number;
  readonly fallbackDelayMs?: number;
}

export function chatAssetPrewarmBatches(windowTarget: Window): readonly (readonly string[])[] {
  const compact = windowTarget.matchMedia?.("(max-width: 720px)").matches ?? false;
  const composerAsset = compact
    ? "/assets/ui/system-layer-materials-v5/composer-sheet-v5-mobile-4p8-alpha.webp"
    : "/assets/ui/system-layer-materials-v5/composer-sheet-v5-desktop-10p3-alpha.webp";
  return [[...sharedChatAssets, composerAsset], secondaryChatAssets];
}

/**
 * Warm chat artwork only after the initial page load, in two idle batches.
 * This keeps the scene LCP ahead of optional chat decoration while ensuring
 * the browser has decoded the artwork before the user opens the panel.
 */
export function scheduleChatAssetPrewarm(options: ChatAssetPrewarmOptions = {}): () => void {
  if (typeof window === "undefined" || typeof Image === "undefined") return () => undefined;

  const windowTarget = options.windowTarget ?? window;
  const idleWindow = windowTarget as IdleWindow;
  const createImage = options.createImage ?? (() => new Image());
  const idleTimeoutMs = options.idleTimeoutMs ?? 2_000;
  const fallbackDelayMs = options.fallbackDelayMs ?? 250;
  const batches = chatAssetPrewarmBatches(windowTarget);
  const cancelScheduled = new Set<() => void>();
  const activeImages = new Set<HTMLImageElement>();
  let cancelled = false;

  const scheduleIdle = (callback: () => void) => {
    let cancel: () => void;
    if (typeof idleWindow.requestIdleCallback === "function") {
      const handle = idleWindow.requestIdleCallback(() => {
        cancelScheduled.delete(cancel);
        if (!cancelled) callback();
      }, { timeout: idleTimeoutMs });
      cancel = () => idleWindow.cancelIdleCallback?.(handle);
    } else {
      const handle = windowTarget.setTimeout(() => {
        cancelScheduled.delete(cancel);
        if (!cancelled) callback();
      }, fallbackDelayMs);
      cancel = () => windowTarget.clearTimeout(handle);
    }
    cancelScheduled.add(cancel);
  };

  const prewarmBatch = (batchIndex: number) => {
    for (const src of batches[batchIndex] ?? []) {
      const image = createImage();
      activeImages.add(image);
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = src;
      const decoded = typeof image.decode === "function" ? image.decode() : Promise.resolve();
      void decoded.catch(() => undefined).finally(() => activeImages.delete(image));
    }
    if (batchIndex + 1 < batches.length) scheduleIdle(() => prewarmBatch(batchIndex + 1));
  };

  const start = () => scheduleIdle(() => prewarmBatch(0));
  if (windowTarget.document.readyState === "complete") {
    start();
  } else {
    windowTarget.addEventListener("load", start, { once: true });
  }

  return () => {
    cancelled = true;
    windowTarget.removeEventListener("load", start);
    for (const cancel of cancelScheduled) cancel();
    cancelScheduled.clear();
    activeImages.clear();
  };
}
