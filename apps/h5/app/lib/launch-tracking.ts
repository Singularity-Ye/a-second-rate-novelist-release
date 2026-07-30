type SearchParamsLike = Pick<URLSearchParams, "get">;

const LAUNCH_TRACKING_KEYS = [
  "invite_code",
  "source_channel",
  "source_label",
  "campaign_key",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "kol",
  "demo_story",
  "faq_entry",
  "ref",
] as const;

type LaunchTrackingKey = (typeof LAUNCH_TRACKING_KEYS)[number];

export interface LaunchTrackingEntry {
  key: LaunchTrackingKey;
  label: string;
  value: string;
}

const LAUNCH_TRACKING_LABELS: Record<LaunchTrackingKey, string> = {
  invite_code: "邀请码",
  source_channel: "渠道",
  source_label: "来源标签",
  campaign_key: "campaign",
  utm_source: "utm_source",
  utm_medium: "utm_medium",
  utm_campaign: "utm_campaign",
  utm_content: "utm_content",
  kol: "KOL",
  demo_story: "示范故事",
  faq_entry: "使用说明入口",
  ref: "ref",
};

export function withLaunchTracking(
  target: string,
  searchParams: SearchParamsLike,
  extras: Partial<Record<LaunchTrackingKey, string | null | undefined>> = {},
): string {
  const url = new URL(target, "http://127.0.0.1:3000");

  for (const key of LAUNCH_TRACKING_KEYS) {
    const extraValue = extras[key];
    const searchValue = searchParams.get(key);
    const value = extraValue ?? searchValue;

    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value);
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function readLaunchTracking(
  searchParams: SearchParamsLike,
  extras: Partial<Record<LaunchTrackingKey, string | null | undefined>> = {},
): LaunchTrackingEntry[] {
  return LAUNCH_TRACKING_KEYS.flatMap((key) => {
    const extraValue = extras[key];
    const searchValue = searchParams.get(key);
    const value = extraValue ?? searchValue;

    if (!value) {
      return [];
    }

    return [
      {
        key,
        label: LAUNCH_TRACKING_LABELS[key],
        value,
      },
    ];
  });
}
