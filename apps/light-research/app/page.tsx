import { ResearchInterview } from "@/components/ResearchInterview";
import { getPublicStudyConfig } from "@/lib/study-config";

export default function Page() {
  return <div className="typefaceSurface" data-typeface="hawthorne">
    <ResearchInterview study={getPublicStudyConfig()} requireConsent={process.env.SURVEY_CONSENT_MODE === "1"} />
  </div>;
}
