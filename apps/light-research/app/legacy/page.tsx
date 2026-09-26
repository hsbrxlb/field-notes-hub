import { ResearchInterview } from "@/components/ResearchInterview";
import { getLegacyStudyConfig, toPublicStudyConfig } from "@/lib/study-config";

export default function LegacyPage() {
  return <div className="typefaceSurface" data-typeface="hawthorne">
    <ResearchInterview study={toPublicStudyConfig(getLegacyStudyConfig())} restoreOnly />
  </div>;
}
