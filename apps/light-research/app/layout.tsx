import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getStudyConfig } from "@/lib/study-config";
import "./globals.css";

export const generateMetadata = (): Metadata => {
  const study = getStudyConfig();
  return {
    title: study.study.title,
    description: `A short, interactive survey from ${study.brand.name}.`,
  };
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const study = getStudyConfig();
  return (
    <html lang={study.study.languagePolicy.entryLanguage} style={{ "--accent": study.brand.accent } as React.CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
