import manifestJson from "@/study/study.json";
import { studyManifestSchema, type PublicStudyConfig, type StudyManifest } from "./study-schema";

let cached: StudyManifest | undefined;

export const getStudyConfig = (): StudyManifest => {
  if (!cached) cached = studyManifestSchema.parse(manifestJson);
  return cached;
};

export const toPublicStudyConfig = (manifest: StudyManifest): PublicStudyConfig => {
  return {
    schemaVersion: manifest.schemaVersion,
    study: { id: manifest.study.id, version: manifest.study.version, title: manifest.study.title, status: manifest.study.status, sampleKind: manifest.study.sampleKind, estimatedMinutes: manifest.study.estimatedMinutes, languagePolicy: manifest.study.languagePolicy },
    brand: manifest.brand,
    consent: manifest.consent,
    anchors: manifest.anchors.map(({ id }) => ({ id })),
    approvedClaims: manifest.claims
      .filter((claim) => claim.status === "approved_for_participants")
      .map(({ id, text }) => ({ id, text })),
  };
};

export const getPublicStudyConfig = () => toPublicStudyConfig(getStudyConfig());

export const localized = (values: Record<string, string>, requested?: string | null): string => {
  const manifest = getStudyConfig();
  const base = manifest.study.languagePolicy.fallbackLanguage;
  if (requested && values[requested]) return values[requested];
  const language = requested?.split("-")[0];
  const matching = language && Object.keys(values).find((key) => key.split("-")[0] === language);
  return (matching && values[matching]) || values[base] || Object.values(values)[0] || "";
};

export const getAnchor = (id: string) => getStudyConfig().anchors.find((anchor) => anchor.id === id);
