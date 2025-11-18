// src/components/MarketingFooter.tsx
import React from "react";
import LogoComponent from "@/components/LogoComponent";


/**
 * Footer used across public marketing pages with navigation shortcuts and legal links.
 */
export const MarketingFooter: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-neutral-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-2 md:grid-cols-4">
        {/* Brand */}
        <div>
          <LogoComponent forceLight />
          <p className="mt-3 text-sm text-neutral-600">
            A calm, visual space for your digital mind.
          </p>
        </div>

        {/* Product */}
        <div>
          <h6 className="mb-2 text-sm font-medium text-neutral-900">Product</h6>
          <ul className="space-y-1 text-sm text-neutral-600">
            <li>
              <a
                href="index.html#features"
                className="hover:text-neutral-900"
              >
                Features
              </a>
            </li>
            <li>
              <a
                href="index.html#pricing"
                className="hover:text-neutral-900"
              >
                Pricing
              </a>
            </li>

            <li>
              <a href="faqs.html" className="hover:text-neutral-900">
                FAQ
              </a>
            </li>
          </ul>
        </div>

        {/* Company */}
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

        {/* Legal */}
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

      {/* Bottom line */}
      <div className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-500">
        © {year} Mindful. All rights reserved.
      </div>
    </footer>
  );
};
