/* -------------------- Imports -------------------- */
import "@/styles/Index.css"
import React, { useEffect } from "react";
import { motion, type MotionProps } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/* CSS styles */
import "@/styles/Index.css";

/* Amplify UI context provider (no UI shown, just context) */
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

/* Analytics */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";

/* Components */ 
import LogoComponent from '@/components/LogoComponent';
import { MarketingNavbar } from "@/components/marketingWebsite/MarketingNavBar";
/* ---------------------------------------------------------- */

/* -------------------- Constants -------------------- */
const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/detail/mindful/bjobloafhnodgomnplkfhebkihnafhfe";
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

export default function LandingPage() {
  /* -------------------- Effects -------------------- */
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
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button variant="primary" asChild>
                      <a href={CHROME_EXTENSION_URL}>
                        <Download className="mr-2 h-5 w-5" />
                        Add to Chrome
                      </a>
                    </Button>
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
          <section
            id="features"
            className="scroll-mt-24 relative mx-auto max-w-7xl px-4 pt-40 md:pt-40"
          >
            <div className="pl-4 sm:pl-6 md:pl-6">
              <div className="grid items-center gap-20 md:grid-cols-[1.0fr_1.3fr]">
                {/* LEFT: TEXT */}
                <motion.div {...fadeUp} className="md:-ml-2 lg:-ml-4 md:pr-4">
                  <h2 className="text-xl leading-tight tracking-tight md:text-4xl">
                      Catch important links the moment they matter
                  </h2>
                  <p className="mt-4 max-w-xl text-lg text-neutral-600">
                      Save links in seconds, all without switching tabs or losing your momentum.
                  </p>
                </motion.div>

                {/* RIGHT: Images */}
                <motion.div
                  {...fadeUp}
                  className="relative flex justify-end"
                >
                  <img
                    src="/assets/ui-screenshots/popup-menu2.png"
                    alt="Mindful PopUp menu"
                    className={`
                      w-full max-w-[800px]
                      bg-white
                      rounded-2xl
                      ${LIGHT_SHADOW}
                    `}
                  />
                </motion.div>
              </div>
            </div>
          </section> 

          {/* FEATURE: Workspaces */}
          <section
            id="home"
            className="relative mx-auto max-w-7xl px-4 pt-40 md:pt-40"
          >
            <div className="pl-4 sm:pl-6 md:pl-6">
              <div className="grid items-center gap-20 md:grid-cols-[1.3fr_1.0fr]">
                {/* LEFT: Images */}
                <motion.div
                  {...fadeUp}
                  className="relative flex"
                >
                  <div className="relative w-full max-w-[520px]">
                    {/* Primary image */}
                    <img
                      src="/assets/ui-screenshots/workspace-switcher.png"
                      alt="Switch workspaces"
                      className={`
                        w-full max-w-[520px] h-auto
                        bg-white
                        rounded-2xl
                        ${LIGHT_SHADOW}
                      `}
                    />

                    {/* Secondary image, overlapping bottom-right */}
                    <img
                      src="/assets/ui-screenshots/copy-workspaces.png"
                      alt="Copy between workspaces"
                      className={`
                        absolute
                        bottom-[-80px] right-[-50px]
                        w-[55%] max-w-[360px] h-auto
                        bg-white
                        rounded-2xl
                        ${LIGHT_SHADOW}
                      `}
                    />
                  </div>
                </motion.div> 

                {/* RIGHT: TEXT */}
                <motion.div {...fadeUp} className="md:-ml-2 lg:-ml-4 md:pr-4">
                  <h2 className="text-xl leading-tight tracking-tight md:text-4xl">
                    Workspaces that match your mind, not your tabs
                  </h2>
                  <p className="mt-4 max-w-xl text-lg text-neutral-600">
                    Organize different parts of your life into dedicated screens and switch contexts without relying on messy tab groups. 
                  </p>
                </motion.div>
              </div>
            </div>
          </section> 

          {/* FEATURE: Local by default */}
          <section
            id="home"
            className="relative mx-auto max-w-7xl px-4 pt-40 md:pt-40"
          >
            <div className="pl-4 sm:pl-6 md:pl-6">
              <div className="grid items-center gap-20 md:grid-cols-[1.0fr_1.3fr]">
                {/* LEFT: TEXT */}
                <motion.div {...fadeUp} className="md:-ml-2 lg:-ml-4 md:pr-4">
                  <h2 className="text-xl leading-tight tracking-tight md:text-4xl">
                      Your data stays on your device
                  </h2>
                  <p className="mt-4 max-w-xl text-lg text-neutral-600">
                      Mindful stores everything on your device and nowhere else. Easily import or export your data.
                  </p>
                  <p className="mt-4 max-w-xl text-lg text-neutral-600">
                    Coming soon: smart grouping and categorization.
                  </p>
                </motion.div>

                {/* RIGHT: Image */}
                <motion.div
                  {...fadeUp}
                  className="relative flex justify-end"
                >
                  <img
                    src="/assets/ui-screenshots/import-bookmarks.png"
                    alt="Import bookmarks"
                    className={`
                      w-full max-w-[800px]
                      bg-white
                      rounded-2xl
                      ${LIGHT_SHADOW}
                    `}
                  />
                </motion.div>
              </div>
            </div>
          </section> 

          {/* FEATURE: Dark mode */}
          <section
            id="home"
            className="relative mx-auto max-w-7xl px-4 pt-40 pb-40 md:pt-40 md:pb-40"
          >
            <div className="pl-4 sm:pl-6 md:pl-6">
              <div className="grid items-center gap-20 md:grid-cols-[1.3fr_1.0fr]">
                {/* LEFT: Image */}
                <motion.div
                  {...fadeUp}
                  className="relative flex justify-end"
                >
                  <img
                    src="/assets/ui-screenshots/dark-mode.png"
                    alt="Dark mode UI"
                    className={`
                      w-full max-w-[800px]
                      rounded-2xl
                      ${DARK_SHADOW}
                    `}
                  />
                </motion.div>

                {/* RIGHT: TEXT */}
                <motion.div {...fadeUp} className="md:-ml-2 lg:-ml-4 md:pr-4">
                  <h2 className="text-xl leading-tight tracking-tight md:text-4xl">
                    Effortless dark mode 
                  </h2>
                  <p className="mt-4 max-w-xl text-lg text-neutral-600">
                    Mindful switches between light and dark mode based on your device settings, keeping your workspace comfortable day or night. 
                  </p>
                </motion.div>
              </div>
            </div>
          </section> 

          {/* FOOTER */}
          <footer className="border-t border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <LogoComponent forceLight />
                <p className="mt-3 text-sm text-neutral-600">
                  A calm, visual space for your digital mind
                </p>
              </div>

              <div>
                <h6 className="mb-2 text-sm font-medium text-neutral-900">Product</h6>
                <ul className="space-y-1 text-sm text-neutral-600">
                  <li>
                    <a href="#features" className="hover:text-neutral-900">
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#pricing" className="hover:text-neutral-900">
                      Pricing
                    </a>
                  </li>
                  <li>
                    <a href="#faq" className="hover:text-neutral-900">
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h6 className="mb-2 text-sm font-medium text-neutral-900">Company</h6>
                <ul className="space-y-1 text-sm text-neutral-600">
                  <li>
                    <a href="#" className="hover:text-neutral-900">
                      About
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-neutral-900">
                      Changelog
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-neutral-900">
                      Contact
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h6 className="mb-2 text-sm font-medium text-neutral-900">Legal</h6>
                <ul className="space-y-1 text-sm text-neutral-600">
                  <li>
                    <a
                      href="/privacy/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-neutral-900"
                    >
                      Privacy Policy
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-neutral-900">
                      Terms
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-500">
              © {new Date().getFullYear()} Mindful. All rights reserved.
            </div>
          </footer>
          
        </div>
      </AnalyticsProvider>
    </Authenticator.Provider>
  );
  /* ---------------------------------------------------------- */
}