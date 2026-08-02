import { Suspense } from "react";
import { FaqView } from "./faq-view";

export default function FaqPage() {
  return (
    <Suspense fallback={<main data-testid="faq-page">正在打开使用说明……</main>}>
      <FaqView />
    </Suspense>
  );
}
