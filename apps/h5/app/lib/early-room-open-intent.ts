export const EARLY_ROOM_HYDRATED_DATASET_KEY = "erliuNovelistRoomHydrated";
export const EARLY_ROOM_OPEN_PENDING_DATASET_KEY = "erliuNovelistRoomOpenPending";

export function buildEarlyRoomOpenIntentScript(): string {
  return `(() => {
    if (window.__ERLIU_EARLY_ROOM_OPEN_INSTALLED__) return;
    window.__ERLIU_EARLY_ROOM_OPEN_INSTALLED__ = true;
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const opener = target.closest('[data-room-entry-action="open-novelist"]');
      if (opener === null || opener.getAttribute("aria-expanded") !== "false") return;
      const root = document.documentElement;
      if (root.dataset.${EARLY_ROOM_HYDRATED_DATASET_KEY} === "true") return;
      event.preventDefault();
      event.stopPropagation();
      root.dataset.${EARLY_ROOM_OPEN_PENDING_DATASET_KEY} = "true";
    }, true);
  })();`;
}
