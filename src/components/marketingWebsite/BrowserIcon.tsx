import React from "react";

type BrowserIconProps = {
  href: string;
  src: string;
  alt: string;
};

/**
 * Render a linked browser icon used within the marketing CTA strip.
 */
export default function BrowserIcon({ href, src, alt }: BrowserIconProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex"
    >
      <img
        src={src}
        alt={alt}
        className="h-5 w-5 opacity-80 hover:opacity-100 transition cursor-pointer"
      />
    </a>
  );
}
