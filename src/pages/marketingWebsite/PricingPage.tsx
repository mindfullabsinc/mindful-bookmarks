import "@/styles/Index.css";
import React from "react";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { Check, Lock, Sparkles, Zap, Circle } from "lucide-react";

/* Scripts and hooks */
import AnalyticsProvider from "@/analytics/AnalyticsProvider";

/* Components */
import { MarketingNavbar } from "@/components/marketingWebsite/MarketingNavBar";
import { MarketingFooter } from "@/components/marketingWebsite/MarketingFooter";
import { PricingCard } from "@/components/marketingWebsite/PricingCard";
import CTAButton from "@/components/marketingWebsite/CTAButton";
import WaitlistModal from "@/components/marketingWebsite/WaitlistModal";


export default function PricingPage() {
  const [waitlistOpen, setWaitlistOpen] = React.useState(false);

  return (
    <Authenticator.Provider>
      <AnalyticsProvider>
        <div className="force-light min-h-screen bg-neutral-50 text-neutral-900 selection:bg-blue-200 selection:text-neutral-900">
          <MarketingNavbar />

          <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pt-8 pb-8 sm:pt-8 sm:pb-8 lg:px-0">
            
            {/* HERO CALLOUT */}
            <section className="relative overflow-visible px-6 py-10 sm:px-10 sm:py-12 text-neutral-900">
              {/* Soft top gradient */}
              <div className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(ellipse_at_top,rgba(74,128,222,0.18),transparent_70%)]" />

              <div className="relative max-w-2xl">
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                  Free without limits.
                </h1>

                <div className="mt-3 h-1 w-95 rounded-full bg-blue-400" />

                <p className="mt-6 text-lg text-neutral-600 sm:text-xl max-w-xl">
                  No sign-up required. No strings attached. One click to install.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <CTAButton labelTemplate="Add to {browser} for free" icon={null}/>
                </div>
              </div>
            </section>

            {/* PRICING GRID */}
            <section className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">

              {/* Mindful Core (free tier) */}
              <PricingCard
                badgeLabel={
                  <>
                    <Circle className="h-2.5 w-2.5 text-neutral-500" />
                    Mindful Core
                  </>
                }
                badgeColor="bg-neutral-100 text-neutral-700"
                price="$0"
                priceSubtext="forever"
                description="Always free. Fully local, no limits."
                features={[
                  {
                    icon: <Check className="mt-0.5 h-4 w-4 text-blue-500" />,
                    text: "Data stored on your device, nothing sent to our servers.",
                  },
                  {
                    icon: <Check className="mt-0.5 h-4 w-4 text-blue-500" />,
                    text: "Unlimited workspaces, groups, and links.",
                  },
                  {
                    icon: <Check className="mt-0.5 h-4 w-4 text-blue-500" />,
                    text: "Dark mode that adapts to your system settings.",
                  },
                ]}
                renderButton={() => (
                  <CTAButton
                    icon={null}
                    labelTemplate="Add to {browser} for free"
                    variant="outline"
                    className="w-full"
                  />
                )}
              />

              {/* Mindful Pro */}
              <PricingCard
                badgeLabel={
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    Mindful Pro
                  </>
                }
                badgeColor="bg-blue-50 text-blue-700"
                price="$—"
                priceSubtext="coming soon"
                description="For power users looking for a smarter, always-in-sync way to organize their digital world."
                features={[
                  {
                    icon: <Check className="mt-0.5 h-4 w-4 text-blue-600" />,
                    text: "Optional cloud sync with end-to-end encryption.",
                  },
                  {
                    icon: <Check className="mt-0.5 h-4 w-4 text-blue-600" />,
                    text: "Sync across devices and browsers.",
                  },
                  {
                    icon: <Check className="mt-0.5 h-4 w-4 text-blue-600" />,
                    text: "Smart auto-import and categorization.",
                  },
                  {
                    icon: <Check className="mt-0.5 h-4 w-4 text-blue-600" />,
                    text: "Share your workspaces and groups with other users.",
                  },
                ]}
                buttonLabel="Join the waitlist"
                onButtonClick={() => setWaitlistOpen(true)}
                buttonVariant="outline"
              />

              <WaitlistModal open={waitlistOpen} onOpenChange={setWaitlistOpen} />

            </section>
          </main>

          <MarketingFooter />
        </div>
      </AnalyticsProvider>
    </Authenticator.Provider>
  );
}
