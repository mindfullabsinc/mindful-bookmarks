/* -------------------- Imports -------------------- */
import "@/styles/Index.css"
import React, { useEffect } from "react";
import { motion, type MotionProps } from "framer-motion";

/* CSS styles */
import "@/styles/Index.css";

/* Amplify UI context provider (no UI shown, just context) */
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

/* Analytics */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";

/* Constants */
import { CHROME_EXTENSION_URL } from "@/core/constants/constants";

/* Components */ 
import BrowserIcon from "@/components/marketingWebsite/BrowserIcon";
import CTAButton from "@/components/marketingWebsite/CTAButton";
import { FeatureSection } from "@/components/marketingWebsite/FeatureSection";
import { MarketingNavbar } from "@/components/marketingWebsite/MarketingNavBar";
import { MarketingFooter } from "@/components/marketingWebsite/MarketingFooter";

/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const LIGHT_SHADOW = "shadow-[0_20px_45px_rgba(0,0,0,0.12),0_-20px_45px_rgba(0,0,0,0.10)]";
const DARK_SHADOW = "shadow-[0_0_40px_rgba(0,0,0,0.5),0_0_8px_rgba(0,0,0,0.04)]";
/* ---------------------------------------------------------- */

/* -------------------- Helper functions -------------------- */
// Utility for simple fade-up animations
const fadeUp: MotionProps = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
  transition: {
    duration: 1.5,
    // cubic-bezier equivalent to a nice ease-out
    ease: [0.22, 1, 0.36, 1],
  },
};
/* ---------------------------------------------------------- */

/* -------------------- Main component -------------------- */
/**
 * Public marketing landing page outlining Mindful’s features and CTAs.
 */
export default function LandingPage() {
  /* -------------------- Effects -------------------- */
  /**
   * Smoothly scroll to anchored sections when the page loads or the URL hash changes.
   */
  useEffect(() => {
    const scrollToHash = () => {
      const { hash } = window.location;
      if (!hash) return;

      const id = hash.slice(1); // remove '#'
      const el = document.getElementById(id);
      if (el) {
        // timeout lets layout settle before scrolling
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 0);
      }
    };

    // When the page first loads with a hash (e.g., index.html#features)
    scrollToHash();

    // Optional: also handle in-page hash changes (not strictly needed,
    // but nice if you ever do client-side hash navigation)
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);
  /* ---------------------------------------------------------- */

  /* -------------------- Main component UI -------------------- */
  return (
    <Authenticator.Provider>
      <AnalyticsProvider>
        <div className="force-light min-h-screen bg-neutral-50 text-neutral-900 selection:bg-blue-200 selection:text-neutral-900">
          <MarketingNavbar /> 

          {/* HERO */}
          <section
            id="home"
            className="relative mx-auto max-w-7xl px-4 pt-8 md:pt-12"
          >
            {/* Make sure there is some left padding even when the window gets narrow */}
            <div className="pl-4 sm:pl-6 md:pl-6">
              <div className="grid items-center gap-15 md:grid-cols-[1.0fr_1.3fr]">
                
                {/* LEFT: TEXT */}
                <motion.div {...fadeUp} className="md:-ml-2 lg:-ml-4 md:pr-4">
                  <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                    A calm, visual space for your digital mind
                  </h1>
                  <p className="mt-4 max-w-xl text-lg text-neutral-600">
                    Mindful turns your new tab into a simple, visual space for the links you actually care about.
                    Arrange workspaces and group links to build your own personal command center.
                  </p>

                  {/* CTA Button */}
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <CTAButton />
                  </div>

                  {/* Compatible Browsers */}
                  <div className="mt-3 flex items-center gap-3 text-sm text-neutral-500">
                    <span className="text-neutral-400">
                      Available for
                    </span>
                    <div className="flex items-center gap-2">
                      <BrowserIcon
                        href={CHROME_EXTENSION_URL}
                        src="/assets/browsers/chrome.png"
                        alt="Chrome"
                      />
                      <BrowserIcon
                        href={CHROME_EXTENSION_URL}
                        src="/assets/browsers/brave.png"
                        alt="Brave"
                      />
                    </div>
                  </div>
                </motion.div>

                {/* RIGHT: HERO IMAGE */}
                <motion.div
                  {...fadeUp}
                  className="relative flex justify-end"
                >
                  <img
                    src="/assets/ui-screenshots/hero.png"
                    alt="Mindful Bookmarks UI"
                    className={`
                      w-full max-w-[800px]
                      bg-white
                      ${LIGHT_SHADOW} 
                    `}
                  />
                </motion.div>
              </div>
            </div>
          </section> 

          {/* FEATURE: PopUp */}
          <FeatureSection
            id="features"
            textSide="left"
            title="Catch important links the moment they matter"
            body="Save links in seconds, all without switching tabs or losing your momentum."
            visual={
              <img
                src="/assets/ui-screenshots/popup-menu2.png"
                alt="Mindful PopUp menu"
                className={`w-full max-w-[800px] bg-white rounded-2xl ${LIGHT_SHADOW}`}
              />
            }
          />

          {/* FEATURE: Workspaces */}
          <FeatureSection
            textSide="right"
            visualJustify="start"
            title="Workspaces that match your mind, not your tabs"
            body="Organize different parts of your life into dedicated screens and switch contexts without relying on messy tab groups."
            visual={
              <div className="relative w-full max-w-[520px]">
                <img
                  src="/assets/ui-screenshots/workspace-switcher.png"
                  alt="Switch workspaces"
                  className={`w-full max-w-[520px] bg-white rounded-2xl ${LIGHT_SHADOW}`}
                />
                <img
                  src="/assets/ui-screenshots/copy-workspaces.png"
                  alt="Copy between workspaces"
                  className={`absolute bottom-[-80px] right-[-50px] w-[55%] max-w-[360px] rounded-2xl bg-white ${LIGHT_SHADOW}`}
                />
              </div>
            }
          />

          {/* FEATURE: Local by default */}
          <FeatureSection
            textSide="left"
            title="Your data stays on your device"
            body={[
              "Mindful stores everything on your device and nowhere else. Easily import or export your data.",
              "Coming soon: smart grouping and categorization."
            ]}
            visual={
              <img
                src="/assets/ui-screenshots/import-bookmarks.png"
                alt="Import bookmarks"
                className={`w-full max-w-[800px] bg-white rounded-2xl ${LIGHT_SHADOW}`}
              />
            }
          />
          
          {/* FEATURE: Dark mode */}
          <FeatureSection
            textSide="right"
            sectionClassName="pb-40 md:pb-40"
            title="Effortless dark mode"
            body="Mindful switches between light and dark mode based on your device settings, keeping your workspace comfortable day or night."
            visual={
              <img
                src="/assets/ui-screenshots/dark-mode.png"
                alt="Dark mode UI"
                className={`w-full max-w-[800px] rounded-2xl ${DARK_SHADOW}`}
              />
            }
          />

          {/* FOOTER */}
          <MarketingFooter />
          
        </div>
      </AnalyticsProvider>
    </Authenticator.Provider>
  );
  /* ---------------------------------------------------------- */
}
/* ---------------------------------------------------------- */
