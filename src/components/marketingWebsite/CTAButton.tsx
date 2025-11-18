import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/* Utilities */
import { detectBrowser, BrowserName } from "@/core/utils/detectBrowser";

/* Constants */
import { CHROME_EXTENSION_URL } from "@/core/constants/constants";

type CTAButtonProps = {
  icon?: React.ReactNode;
};

export default function CTAButton({
  icon = <Download className="mr-2 h-5 w-5" />,
}: CTAButtonProps) {
  const [browser, setBrowser] = useState<BrowserName>("unknown");

  useEffect(() => {
    setBrowser(detectBrowser());
  }, []);

  const label = {
    chrome: "Add to Chrome",
    brave: "Add to Brave",
    edge: "Add to Chrome",
    firefox: "Add to Chrome",
    safari: "Add to Chrome",
    unknown: "Add to Chrome",
  }[browser];

  const href = {
    chrome: CHROME_EXTENSION_URL,
    brave: CHROME_EXTENSION_URL,
    edge: CHROME_EXTENSION_URL,
    firefox: CHROME_EXTENSION_URL,
    safari: CHROME_EXTENSION_URL,
    unknown: CHROME_EXTENSION_URL,
  }[browser];

  return (
    <Button variant="primary" asChild>
      <a href={href}>
        {icon}
        {label}
      </a>
    </Button>
  );
}
