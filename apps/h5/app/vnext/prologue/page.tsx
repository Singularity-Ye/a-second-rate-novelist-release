import type { Metadata } from "next";
import { PrologueView } from "./prologue-view";

export const metadata: Metadata = {
  title: "系统转生篇｜二流小说家",
  description: "从异界大运事故开始，选择转生身份并检索第一个宿主。",
};

export default function ProloguePage() {
  return <PrologueView />;
}
