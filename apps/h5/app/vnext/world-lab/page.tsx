import type { Metadata } from "next";
import { WorldLabView } from "./world-lab-view";

export const metadata: Metadata = {
  title: "世界生长实验｜二流小说家",
  description: "从一次沉浸选择开始，看见小说世界与知识图谱一起长出来。",
};

export default function WorldLabPage() {
  const localDistillationProgressEnabled = process.env.NODE_ENV !== "production"
    && Boolean(process.env.VNEXT_LOCAL_DISTILLATION_PROGRESS_FILE?.trim());
  return <WorldLabView localDistillationProgressEnabled={localDistillationProgressEnabled} />;
}
