import { Suspense } from "react";
import { Story360View } from "./story-360-view";

export default async function OpsStoryPage(props: {
  params: Promise<{
    storyId: string;
  }>;
}) {
  const params = await props.params;

  return (
    <Suspense fallback={<main data-testid="ops-story-360-page">Loading story 360...</main>}>
      <Story360View storyId={params.storyId} />
    </Suspense>
  );
}
