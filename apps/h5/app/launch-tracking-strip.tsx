import React from "react";
import type { LaunchTrackingEntry } from "./lib/launch-tracking";

export function LaunchTrackingStrip({
  items,
  title = "当前来源标签",
  dataTestId = "launch-tracking-strip",
}: {
  items: LaunchTrackingEntry[];
  title?: string;
  dataTestId?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="panel-card" data-testid={dataTestId}>
      <p className="panel-card__eyebrow">来源标签</p>
      <h2>{title}</h2>
      <ul className="tag-row">
        {items.map((item) => (
          <li key={`${item.key}:${item.value}`}>
            {item.label} · {item.value}
          </li>
        ))}
      </ul>
    </section>
  );
}
