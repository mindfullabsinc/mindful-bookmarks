import React from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";

interface FeatureItem {
  icon: React.ReactNode;
  text: string;
}

interface PricingCardProps {
  badgeLabel: React.ReactNode;
  badgeColor?: string; // optional Tailwind class
  price: string;
  priceSubtext?: string;
  description: string;
  features: FeatureItem[];

  // Default button props
  buttonLabel?: string;
  buttonHref?: string;
  buttonVariant?: ButtonVariant;

  // Optional custom button renderer (e.g. CTAButton)
  renderButton?: () => React.ReactNode;
}

export const PricingCard: React.FC<PricingCardProps> = ({
  badgeLabel,
  badgeColor = "bg-neutral-50 text-neutral-700",
  price,
  priceSubtext,
  description,
  features,
  buttonLabel,
  buttonHref = "#",
  buttonVariant = "outline",
  renderButton,
}) => {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-7">
      {/* Badge */}
      <p
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${badgeColor}`}
      >
        {badgeLabel}
      </p>

      {/* Price */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight">{price}</span>
        {priceSubtext && (
          <span className="text-sm font-medium text-neutral-500">
            {priceSubtext}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="mt-3 text-sm text-neutral-600">{description}</p>

      {/* Features */}
      <div className="mt-6 space-y-2 text-sm text-neutral-800">
        {features.map((f, i) => (
          <div key={i} className="flex gap-2">
            {f.icon}
            <span>{f.text}</span>
          </div>
        ))}
      </div>

      {/* Button */}
      <div className="mt-6">
        {renderButton ? (
          renderButton()
        ) : (
          buttonLabel && (
            <Button asChild size="lg" variant={buttonVariant} className="w-full">
              <a href={buttonHref}>{buttonLabel}</a>
            </Button>
          )
        )}
      </div>
    </div>
  );
};
