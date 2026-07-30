import type { Metadata } from "next";
import { ExperienceView } from "./experience-view";

export const metadata: Metadata = {
  title: "二流小说家｜深夜书房",
  description: "把一句故事，交给一个会记得你的私人小说家。",
};

export default function VnextPage() {
  return <ExperienceView />;
}
