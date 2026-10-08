import { ResearchInterview } from "@/components/ResearchInterview";
import { testRunSchema } from "@/lib/api-schemas";
import { getPublicStudyConfig } from "@/lib/study-config";

const legacySession = { key: "research-session:worklight-regression:fixture-3.5-natural-buddy", path: "/legacy" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const parsed = testRunSchema.optional().safeParse(query.testRun);
  if (!parsed.success) return <main><h1>Invalid test run</h1><p>Use a testRun tag with 1–64 lowercase letters, digits, underscores or hyphens, starting with a letter or digit.</p></main>;
  const testRun = parsed.data;
  return <div className="typefaceSurface" data-typeface="hawthorne">
    <ResearchInterview study={getPublicStudyConfig()} requireConsent={true} legacySession={testRun ? undefined : legacySession} testRun={testRun} />
  </div>;
}
