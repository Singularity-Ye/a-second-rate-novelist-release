import { describe, expect, it, vi } from "vitest";
import { chatAssetPrewarmBatches, scheduleChatAssetPrewarm } from "./chat-asset-prewarm";

function createImageRecorder() {
  const images: Array<{
    decoding: string;
    fetchPriority: string;
    src: string;
    decode: ReturnType<typeof vi.fn>;
  }> = [];
  const createImage = () => {
    const image = {
      decoding: "auto",
      fetchPriority: "auto",
      src: "",
      decode: vi.fn(() => Promise.resolve()),
    };
    images.push(image);
    return image as unknown as HTMLImageElement;
  };
  return { createImage, images };
}

describe("chat asset prewarm", () => {
  it("selects only the composer artwork for the current viewport", () => {
    const desktopWindow = { matchMedia: () => ({ matches: false }) } as unknown as Window;
    const mobileWindow = { matchMedia: () => ({ matches: true }) } as unknown as Window;

    expect(chatAssetPrewarmBatches(desktopWindow)[0]).toContain(
      "/assets/ui/system-layer-materials-v5/composer-sheet-v5-desktop-10p3-alpha.webp",
    );
    expect(chatAssetPrewarmBatches(desktopWindow)[0]).not.toContain(
      "/assets/ui/system-layer-materials-v5/composer-sheet-v5-mobile-4p8-alpha.webp",
    );
    expect(chatAssetPrewarmBatches(mobileWindow)[0]).toContain(
      "/assets/ui/system-layer-materials-v5/composer-sheet-v5-mobile-4p8-alpha.webp",
    );
  });

  it("waits for two idle turns and decodes low-priority images", async () => {
    const callbacks: Array<() => void> = [];
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancelIdleCallback = vi.fn();
    const { createImage, images } = createImageRecorder();
    const windowTarget = {
      document: { readyState: "complete" },
      matchMedia: () => ({ matches: false }),
      requestIdleCallback,
      cancelIdleCallback,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    } as unknown as Window;

    const cleanup = scheduleChatAssetPrewarm({ windowTarget, createImage });
    expect(images).toHaveLength(0);
    expect(callbacks).toHaveLength(1);

    callbacks.shift()?.();
    const firstBatchCount = chatAssetPrewarmBatches(windowTarget)[0]!.length;
    expect(images).toHaveLength(firstBatchCount);
    expect(callbacks).toHaveLength(1);
    expect(images.every((image) => image.decoding === "async" && image.fetchPriority === "low")).toBe(true);
    expect(images.every((image) => image.decode.mock.calls.length === 1)).toBe(true);

    callbacks.shift()?.();
    expect(images).toHaveLength(chatAssetPrewarmBatches(windowTarget).flat().length);
    cleanup();
    expect(cancelIdleCallback).not.toHaveBeenCalled();
  });

  it("cancels pending idle work on cleanup", () => {
    const requestIdleCallback = vi.fn(() => 17);
    const cancelIdleCallback = vi.fn();
    const { createImage, images } = createImageRecorder();
    const windowTarget = {
      document: { readyState: "complete" },
      matchMedia: () => ({ matches: false }),
      requestIdleCallback,
      cancelIdleCallback,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
    } as unknown as Window;

    const cleanup = scheduleChatAssetPrewarm({ windowTarget, createImage });
    cleanup();

    expect(cancelIdleCallback).toHaveBeenCalledWith(17);
    expect(images).toHaveLength(0);
  });
});
