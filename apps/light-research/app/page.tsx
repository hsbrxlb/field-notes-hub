import { ResearchInterview } from "@/components/ResearchInterview";
import { getPublicStudyConfig } from "@/lib/study-config";

const legacySession = { key: "research-session:worklight-regression:fixture-3.5-natural-buddy", path: "/legacy" };

export default function Page() {
  return <div className="typefaceSurface" data-typeface="hawthorne">
    <ResearchInterview study={getPublicStudyConfig()} requireConsent={true} legacySession={legacySession} />
  </div>;
}
