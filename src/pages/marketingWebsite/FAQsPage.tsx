import "@/styles/Index.css";
import React from "react";
import { motion, type MotionProps } from "framer-motion";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

import AnalyticsProvider from "@/analytics/AnalyticsProvider";
import LogoComponent from "@/components/LogoComponent";
import { Accordion, AccordionItem, AccordionContent, AccordionTrigger } from "@/components/ui/accordion";

const fadeUp: MotionProps = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
  transition: {
    duration: 1.0,
    ease: [0.22, 1, 0.36, 1],
  },
};

export default function FAQsPage() {
  return (
    <Authenticator.Provider>
      <AnalyticsProvider>
        <div className="force-light min-h-screen bg-neutral-50 text-neutral-900 selection:bg-blue-200 selection:text-neutral-900">
          {/* Simple header reused */}
          <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/80">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
              <LogoComponent forceLight />
              <nav className="hidden items-center gap-6 md:flex">
                <a href="/" className="text-sm text-neutral-600 hover:text-neutral-900">
                  Home
                </a>
                <a href="/privacy/#privacy" className="text-sm text-neutral-900 font-medium">
                  Privacy
                </a>
                <a href="/privacy/#faq" className="text-sm text-neutral-600 hover:text-neutral-900">
                  FAQ
                </a>
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-4xl px-4 py-12 space-y-16">
            {/* FAQ anchor */}
            <section id="faq" className="py-8 border-t border-neutral-200">
              <motion.h2
                {...fadeUp}
                className="text-2xl font-semibold tracking-tight md:text-3xl"
              >
                Frequently Asked Questions
              </motion.h2>

              <Accordion
                type="multiple"
                collapsible
                className="mt-6 divide-y divide-neutral-200 border border-neutral-200 bg-white rounded-2xl"
              >
                {/* Paste your AccordionItems from before here */}
                {/* 1. Account requirement */}
                <AccordionItem value="item-1">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    Do I need an account to use Mindful?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    No. You can use Mindful completely offline in <strong>Local-Only mode</strong>,
                    with no login and no data ever leaving your device.
                    <br /><br />
                    (Coming soon): Creating an account is optional and only needed if you turn on
                    <strong> Encrypted Sync</strong> across devices.
                  </AccordionContent>
                </AccordionItem>

                {/* 2. Where data is stored */}
                <AccordionItem value="item-2">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    Where is my data stored?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    You choose where your data lives:
                    <br /><br />
                    <ul className="list-disc ml-6 space-y-1">
                      <li>
                        <strong>Local-Only:</strong> Everything stays on your device. Nothing is
                        uploaded, shared, or synced.
                      </li>
                      <li>
                        <strong>(Coming soon) Encrypted Sync:</strong> If you enable Sync,
                        your bookmarks are backed up and synced securely across devices.
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                {/* 3. Tracking */}
                <AccordionItem value="item-3">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    Does Mindful track what I do online?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    No. Mindful does <strong>not</strong> track your browsing history, page contents,
                    keystrokes, or any activity outside the extension.
                    <br /><br />
                    We only access a tab’s URL/title when you explicitly:
                    <ul className="list-disc ml-6 mt-2 space-y-1">
                      <li>Click “Add bookmark”</li>
                      <li>Import your open tabs</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                {/* 4. Chrome permissions */}
                <AccordionItem value="item-4">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    What permissions does Mindful need, and why?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    Mindful requests only the permissions required for the features you use:
                    <br /><br />
                    <ul className="list-disc ml-6 space-y-1">
                      <li><strong>storage</strong> – save your bookmarks and settings locally</li>
                      <li><strong>tabs</strong> – only when you add a bookmark or import open tabs</li>
                      <li>
                        <strong>bookmarks</strong> – only when you choose to import Chrome bookmarks
                      </li>
                      <li>
                        <strong>host access</strong> – only for secure communication with Mindful’s backend
                        when Sync is enabled
                      </li>
                    </ul>
                    <br />
                    Mindful does <strong>not</strong> run in the background or read tabs without your action.
                  </AccordionContent>
                </AccordionItem>

                {/* 5. Sync vs Local-Only */}
                <AccordionItem value="item-5">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    What’s the difference between Local-Only and Encrypted Sync?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    <ul className="list-disc ml-6 space-y-2">
                      <li>
                        <strong>Local-Only:</strong> Fully offline. Your data never leaves your device.
                      </li>
                      <li>
                        <strong>Encrypted Sync (coming soon):</strong> Sync your bookmarks across signed-in
                        devices with secure, encrypted backup.
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                {/* 6. Export/import */}
                <AccordionItem value="item-6">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    Can I export or import my bookmarks?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    Yes! You can export all your bookmarks as a JSON file anytime, and import them back
                    whenever you like.
                  </AccordionContent>
                </AccordionItem>

                {/* 7. Deleting data */}
                <AccordionItem value="item-7">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    How do I delete my data?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    <ul className="list-disc ml-6 space-y-2">
                      <li>
                        <strong>Local-Only:</strong> Uninstalling the extension or clearing Chrome storage
                        deletes everything instantly.
                      </li>
                      <li>
                        <strong>Encrypted Sync:</strong> In Settings → Encrypted Sync → Delete Cloud Data.
                        Your synced data is permanently deleted immediately.
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                {/* 8. Offline */}
                <AccordionItem value="item-8">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    Does Mindful work offline?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    Yes. Local-Only mode works fully offline, even with no internet connection.
                  </AccordionContent>
                </AccordionItem>

                {/* 9. Privacy-focused */}
                <AccordionItem value="item-9">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    Is Mindful safe for privacy-conscious users?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    Yes. Mindful is designed for people who want full control and zero surveillance.
                    <br /><br />
                    We do not load third-party scripts, do not track your behavior, and minimize
                    data collection.
                  </AccordionContent>
                </AccordionItem>

                {/* 10. Rights */}
                <AccordionItem value="item-10">
                  <AccordionTrigger className="px-4 text-left text-neutral-700">
                    What if I live outside the US? Do I have privacy rights?
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-neutral-700">
                    Depending on your location (e.g., GDPR or CCPA), you may have the right to access,
                    correct, export, or delete your data.  
                    You can contact us anytime at: <strong>privacy@mindfulbookmarks.com</strong>.
                  </AccordionContent>
                </AccordionItem>

              </Accordion>
            </section>
          </main>
        </div>
      </AnalyticsProvider>
    </Authenticator.Provider>
  );
}
