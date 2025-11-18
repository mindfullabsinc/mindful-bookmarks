// src/components/MarketingNavbar.tsx
import React from "react";
import { Download } from "lucide-react";

/* Constants */
import { CHROME_EXTENSION_URL } from "@/core/constants/constants";

/* Components */
import LogoComponent from "@/components/LogoComponent";
import CTAButton from "@/components/marketingWebsite/CTAButton";


/**
 * Top navigation shared across landing/marketing pages with CTA and section links.
 */
export const MarketingNavbar: React.FC = () => {
  return (
    <>
      {/* Top gradient glow */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-x-0 -top-24 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.14),transparent_55%)]" />
      </div>

      {/* NAVBAR */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <LogoComponent forceLight />

          <nav className="hidden items-center gap-6 md:flex">
            <a
              href="index.html#features"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Features
            </a>
            <a
              href="index.html#pricing"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Pricing
            </a>

            <a
              href="faqs.html"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              FAQs
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <CTAButton /> 
          </div>
        </div>
      </header>
    </>
  );
};
