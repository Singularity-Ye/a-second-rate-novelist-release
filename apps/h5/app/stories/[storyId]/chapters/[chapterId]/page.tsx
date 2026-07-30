import { Suspense } from "react";
import { ChapterReaderView } from "./chapter-reader-view";

export default function ChapterReaderPage() {
  return (
    <Suspense fallback={<main data-testid="chapter-reader-page">正在翻开这一章……</main>}>
      <ChapterReaderView />
    </Suspense>
  );
}
