import "@/styles/Index.css"
import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Lock,
  HardDrive,
  ShieldCheck,
  LayoutGrid,
  Tags,
  Search,
  Sparkles,
  FolderTree,
  Share2,
  Zap,
  Download,
} from "lucide-react";

/* Amplify UI context provider (no UI shown, just context) */
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

/* Analytics */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";


// Utility for simple fade-up animations
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.24 },
  transition: { duration: 0.6, ease: "easeOut" },
};

const CHROME_EXTENSION_URL = "https://chromewebstore.google.com/detail/mindful/bjobloafhnodgomnplkfhebkihnafhfe"

function InstallCTA({ size = "default", className = "" }: { size?: "default" | "lg"; className?: string }) {
  return (
    <Button
      size={size}
      className={`bg-neutral-200 text-neutral-900 hover:bg-white ${className}`}
      asChild
      title="Add to Chrome" 
    >
      <a
        href={CHROME_EXTENSION_URL }
      >
        <Download className="mr-2 h-5 w-5" />
        Add to Chrome
      </a>
    </Button>
  );
}

export default function LandingPage() {
  return (
    <Authenticator.Provider>
      <AnalyticsProvider>
        <div className="min-h-screen bg-neutral-950 text-neutral-100 selection:bg-blue-300 selection:text-neutral-900">
          {/* Top gradient glow */}
          <div className="pointer-events-none fixed inset-0 -z-10">
            <div className="absolute inset-x-0 -top-24 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.18),transparent_55%)]" />
          </div>

          {/* NAVBAR */}
          <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/50">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
              <a href="#home" className="flex items-center gap-2">
                <img src="/assets/icon-no-bg-128.png" className="w-[30px] h-[30px] object-cover" />
                <span className="text-lg font-semibold tracking-tight">Mindful</span>
                <Badge className="ml-2 bg-neutral-800 text-neutral-300 hover:bg-neutral-800">Bookmarks</Badge>
              </a>
              <nav className="hidden items-center gap-6 md:flex">
                <a href="#features" className="text-sm text-neutral-300 hover:text-white">Features</a>
                <a href="#privacy" className="text-sm text-neutral-300 hover:text-white">Privacy</a>
                <a href="#pricing" className="text-sm text-neutral-300 hover:text-white">Pricing</a>
                <a href="#faq" className="text-sm text-neutral-300 hover:text-white">FAQ</a>
              </nav>
              <div className="flex items-center gap-2">
                <InstallCTA />
              </div>
            </div>
          </header>

          {/* HERO */}
          <section id="home" className="relative mx-auto max-w-6xl px-4 pt-16 md:pt-24">
            <div className="grid items-center gap-10 md:grid-cols-2">
              <motion.div {...fadeUp}>
                <Badge className="mb-4 bg-neutral-800 text-neutral-300 hover:bg-neutral-800">
                  Private · Local-first · No ads
                </Badge>
                <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                  A calm, visual space for your digital mind
                </h1>
                <p className="mt-4 max-w-xl text-neutral-300">
                  Organize links intuitively, without the noise. Keep everything private on your device or opt in to encrypted cloud sync. Your bookmarks. Private. Local. Yours.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <InstallCTA size="lg" />
                  <Button size="lg" variant="secondary" className="bg-neutral-200 text-neutral-900 hover:bg-white" asChild>
                    <a href="#features" aria-label="See how it works">
                      <Sparkles className="mr-2 h-5 w-5" /> See how it works
                    </a>
                  </Button>
                </div>
                {/* <p className="mt-3 text-xs text-neutral-400">No signup required in Local‑Only mode • Import from Chrome/Firefox/Safari</p> */}
              </motion.div>

              <motion.div {...fadeUp} className="relative">
                <img
                  src="/assets/ui-screenshot.png"
                  alt="Mindful Bookmarks UI"
                  className="rounded-3xl border border-neutral-800 shadow-2xl"
                />
              </motion.div>
            </div>
          </section>

          {/* SOCIAL PROOF / TAGLINE */}
          <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
            <div className="grid items-center gap-6 md:grid-cols-3">
              <Stat number="100%" label="Your data, your device" />
              <Stat number="0" label="Trackers or ads" />
              <Stat number="AES‑GCM" label="Client‑side encryption (sync)" />
            </div>
          </section>

          {/* FEATURES */}
          <section id="features" className="mx-auto max-w-6xl px-4 py-16">
            <motion.h2 {...fadeUp} className="text-3xl font-semibold tracking-tight md:text-4xl">
              Build a visual memory palace for the web
            </motion.h2>
            <motion.p {...fadeUp} className="mt-3 max-w-2xl text-neutral-300">
              Mindful turns your new tab into a personal command center. Arrange boards, group links, and find anything instantly, without leaking your browsing habits.
            </motion.p>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Feature icon={LayoutGrid} title="Boards & groups" desc="Drag cards, resize, and keep related links together in a clean visual grid." />
              <Feature icon={Tags} title="Tags you’ll actually use" desc="Fast, fuzzy tagging and filters. Save now, find later." />
              <Feature icon={Search} title="Blazing‑fast search" desc="Search titles, descriptions, and tags instantly—no network required in Local mode." />
              <Feature icon={Lock} title="Local‑only by default" desc="Use Mindful entirely offline."/>
              <Feature icon={ShieldCheck} title="End‑to‑end privacy" desc="Opt‑in cloud sync uses client‑side AES‑GCM with KMS‑managed data keys. We can’t read your data." />
              <Feature icon={HardDrive} title="Own your storage" desc="Encrypted backups to your cloud or ours. Export anytime." />
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section className="mx-auto max-w-6xl px-4 py-16">
            <motion.h3 {...fadeUp} className="text-2xl font-semibold tracking-tight md:text-3xl">
              How it works
            </motion.h3>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <Step number={1} title="Add to Chrome" desc="Install the extension. Your new tab becomes your calm space." />
              <Step number={2} title="Save what matters" desc="Drop links, images, and notes. Group visually and tag freely." />
              <Step number={3} title="Choose storage" desc="Stay fully local, or enable encrypted cloud sync when you’re ready." />
            </div>
          </section>

          {/* PRIVACY FIRST */}
          <section id="privacy" className="mx-auto max-w-6xl px-4 py-16">
            <div className="grid items-start gap-8 md:grid-cols-2">
              <motion.div {...fadeUp}>
                <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">Privacy‑first by design</h3>
                <p className="mt-3 text-neutral-300">
                  Mindful was built to give you control. Keep everything on‑device, or turn on encrypted sync to access your boards everywhere. Either way—your data stays yours.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-neutral-300">
                  <li className="flex items-start gap-3"><Lock className="mt-0.5 h-5 w-5 text-blue-400" /> Local‑Only mode stores everything on your device.</li>
                  <li className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-blue-400" /> Optional sync: client‑side AES‑GCM, KMS‑managed data keys, HTTPS in transit.</li>
                  <li className="flex items-start gap-3"><FolderTree className="mt-0.5 h-5 w-5 text-blue-400" /> No ads. No behavioral tracking. No selling data.</li>
                  <li className="flex items-start gap-3"><Share2 className="mt-0.5 h-5 w-5 text-blue-400" /> Export and import anytime. Your content is portable by default.</li>
                </ul>
              </motion.div>
              <motion.div {...fadeUp}>
                {/* <Card className="border-neutral-800 bg-neutral-900">
                  <CardHeader>
                    <CardTitle className="text-lg">Get early access</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="mb-4 space-y-3 text-sm text-neutral-300">
                      <li className="flex items-start gap-3">
                        <div className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-300">2</div>
                        <span>Install the extension (button unlocks after joining).</span>
                      </li>
                    </ol>

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <InstallCTA />
                    </div>

                  </CardContent>

                </Card> */}
              </motion.div>
            </div>
          </section>

          {/* PRICING */}
          <section id="pricing" className="mx-auto max-w-6xl px-4 py-16">
            <motion.h3 {...fadeUp} className="text-2xl font-semibold tracking-tight md:text-3xl">
              Simple, fair pricing
            </motion.h3>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <PricingCard
                title="Free"
                price="$0"
                tagline="Full power for free: organize endlessly, sync if you want"
                features={[
                  "Customizable groups and bookmark names",
                  // "Boards, tags, and fast search",
                  "New‑tab experience",
                  "Import & export",
                  "Local-only mode for extra privacy",
                  "Optional end-to-end encrypted cloud sync"
                ]}
                cta="Start free"
              />
              {/* <PricingCard
                highlighted
                title="Pro"
                price="$3/mo"
                tagline="Encrypted sync & extras"
                features={[
                  "End‑to‑end encrypted cloud sync",
                  "Smart collections & rules",
                  "Custom themes",
                  "Priority support",
                ]}
                cta="Go Pro"
              /> */}
            </div>
          </section>

          {/* FAQ */}
          <section id="faq" className="mx-auto max-w-6xl px-4 py-16">
            <motion.h3 {...fadeUp} className="text-2xl font-semibold tracking-tight md:text-3xl">
              Frequently asked questions
            </motion.h3>
            <Accordion type="multiple" collapsible className="mt-6 divide-y divide-neutral-800 border border-neutral-800">
              <AccordionItem value="item-1">
                <AccordionTrigger className="px-4 text-left">Do I need an account?</AccordionTrigger>
                <AccordionContent className="px-4 text-neutral-300">
                  Yes. Both Local‑Only and Remote modes requires an account and login. 
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger className="px-4 text-left">How does encrypted sync work?</AccordionTrigger>
                <AccordionContent className="px-4 text-neutral-300">
                  Your data is encrypted on your device using AES‑GCM before it leaves the browser. The encryption keys are derived client‑side and protected with KMS‑managed data keys. Servers store only ciphertext.
                </AccordionContent>
              </AccordionItem>
              {/* <AccordionItem value="item-3">
                <AccordionTrigger className="px-4 text-left">Can I import from other tools?</AccordionTrigger>
                <AccordionContent className="px-4 text-neutral-300">
                  Yes—import from Chrome, Firefox, Safari, and common bookmark export formats. You can also export your data anytime.
                </AccordionContent>
              </AccordionItem> */}
              {/* <AccordionItem value="item-4">
                <AccordionTrigger className="px-4 text-left">Is there a keyboard‑first workflow?</AccordionTrigger>
                <AccordionContent className="px-4 text-neutral-300">
                  Absolutely. Use quick‑add, global search, and command palette actions to stay in flow.
                </AccordionContent>
              </AccordionItem> */}
            </Accordion>
          </section>

          {/* CALL TO ACTION */}
          <section className="mx-auto max-w-6xl px-4 pb-20 pt-6">
            <Card className="border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950">
              <CardContent className="flex flex-col items-center gap-4 p-8 text-center md:flex-row md:justify-between md:text-left">
                <div>
                  <h4 className="text-xl font-semibold">Turn every new tab into a mindful command center</h4>
                  <p className="mt-1 text-neutral-300">Start free in seconds.</p>
                </div>
                <div className="flex gap-3">
                  <InstallCTA size="lg" />
                </div>
              </CardContent>
            </Card>
          </section>

          {/* FOOTER */}
          <footer className="border-t border-neutral-900/80 bg-neutral-950">
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <div className="flex items-center gap-2">
                  <img src="/assets/icon-no-bg-128.png" className="w-[30px] h-[30px] object-cover" />
                  <span className="text-sm font-semibold">Mindful</span>
                </div>
                <p className="mt-3 text-sm text-neutral-400">A calm, visual space for your digital mind.</p>
              </div>
              <div>
                <h6 className="mb-2 text-sm font-medium">Product</h6>
                <ul className="space-y-1 text-sm text-neutral-400">
                  <li><a href="#features" className="hover:text-neutral-200">Features</a></li>
                  <li><a href="#pricing" className="hover:text-neutral-200">Pricing</a></li>
                  <li><a href="#faq" className="hover:text-neutral-200">FAQ</a></li>
                </ul>
              </div>
              <div>
                <h6 className="mb-2 text-sm font-medium">Company</h6>
                <ul className="space-y-1 text-sm text-neutral-400">
                  <li><a href="#" className="hover:text-neutral-200">About</a></li>
                  <li><a href="#" className="hover:text-neutral-200">Changelog</a></li>
                  <li><a href="#" className="hover:text-neutral-200">Contact</a></li>
                </ul>
              </div>
              <div>
                <h6 className="mb-2 text-sm font-medium">Legal</h6>
                <ul className="space-y-1 text-sm text-neutral-400">
                  <li><a href="#" className="hover:text-neutral-200">Privacy Policy</a></li>
                  <li><a href="#" className="hover:text-neutral-200">Terms</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-neutral-900/80 py-4 text-center text-xs text-neutral-500">
              © {new Date().getFullYear()} Mindful. All rights reserved.
            </div>
          </footer>
        </div>
      </AnalyticsProvider>
    </Authenticator.Provider>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-center">
      <div className="text-2xl font-semibold text-white">{number}</div>
      <div className="mt-1 text-sm text-neutral-400">{label}</div>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <Card className="h-full border-neutral-800 bg-neutral-900">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-500/15 p-2">
            <Icon className="h-5 w-5 text-blue-400" />
          </div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-neutral-300">{desc}</p>
      </CardContent>
    </Card>
  );
}

function Step({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
      <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-sm font-semibold text-blue-300">
        {number}
      </div>
      <h4 className="text-lg font-medium">{title}</h4>
      <p className="mt-1 text-sm text-neutral-300">{desc}</p>
    </div>
  );
}

function PricingCard({
  highlighted = false,
  title,
  price,
  tagline,
  features,
  cta,
}: {
  highlighted?: boolean;
  title: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
}) {
  return (
    <Card className={`${highlighted ? "border-blue-600/60 bg-neutral-900/90" : "border-neutral-800 bg-neutral-900"} relative overflow-hidden`}>
      {highlighted && (
        <div className="absolute right-4 top-4">
          <Badge className="bg-blue-600 text-white hover:bg-blue-600">Most popular</Badge>
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <div className="mt-1 text-4xl font-semibold">{price}</div>
        <div className="text-sm text-neutral-400">{tagline}</div>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-neutral-300">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <Button className={`${highlighted ? "bg-blue-500 text-neutral-900 hover:bg-blue-400" : "bg-neutral-200 text-neutral-900 hover:bg-white"}`}>
          {cta}
        </Button>
      </CardContent>
    </Card>
  );
}