// CTAButton.tsx
import React, { useEffect, useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Download } from "lucide-react";

/* Utilities */
import { detectBrowser, type BrowserName } from "@/core/utils/detectBrowser";

/* Constants */
import { CHROME_EXTENSION_URL } from "@/core/constants/constants";

type CTAButtonProps = {
  icon?: React.ReactNode | null;

  /**
   * Optional label template. Use `{browser}` as a placeholder.
   * Example: "Install on {browser}" or "Get Mindful for {browser}".
   * Defaults to "Add to {browser}".
   */
  labelTemplate?: string;

  /** Pass-through styling props for Button */
  variant?: ButtonVariant;
  className?: string;
};

/**
 * Browser-aware CTA button that adjusts copy and target URL based on detected browser.
 */
export default function CTAButton({
  icon = <Download className="mr-2 h-5 w-5" />,
  labelTemplate = "Add to {browser}",
  variant = "primary",
  className,
}: CTAButtonProps) {
  const [browser, setBrowser] = useState<BrowserName>("unknown");

  useEffect(() => {
    setBrowser(detectBrowser());
  }, []);

  const browserLabel = {
    chrome: "Chrome",
    brave: "Brave",
    edge: "Chrome",
    firefox: "Chrome",
    safari: "Chrome",
    unknown: "Chrome",
  }[browser];

  const label = labelTemplate.replace("{browser}", browserLabel);

  const href = {
    chrome: CHROME_EXTENSION_URL,
    brave: CHROME_EXTENSION_URL,
    edge: CHROME_EXTENSION_URL,
    firefox: CHROME_EXTENSION_URL,
    safari: CHROME_EXTENSION_URL,
    unknown: CHROME_EXTENSION_URL,
  }[browser];

  return (
    <Button variant={variant} asChild className={className}>
      <a href={href}>
        {icon && icon}
        {label}
      </a>
    </Button>
  );
}
