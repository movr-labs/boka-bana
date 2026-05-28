import type { Metadata } from "next";
import TrainerMatchPage from "@/components/trainer-match-page";

export const metadata: Metadata = {
  title: "Sök tränare - Bokabana",
  description: "Matcha med en tennis- eller padeltränare baserat på sport, ort och nivå.",
};

export default function TrainersPage() {
  return <TrainerMatchPage />;
}
