import { Badge } from "@/components/ui/badge";
import React from 'react';


export default function LogoComponent({ forceLight = false }) {
  const textColor = forceLight
    ? "text-neutral-900"
    : "text-neutral-900 dark:text-white";

  return (
    <div
      className="flex items-center gap-2 cursor-pointer"
      onClick={() => {
        const url = chrome?.runtime?.getURL
          ? chrome.runtime.getURL("newtab.html")
          : "newtab.html";
        window.location.href = url;
      }}
    >
      <img src="/assets/icon-128.png" className="w-[20px] h-[20px] object-cover" />
      <span className={`${textColor} text-lg font-semibold tracking-tight`}>Mindful</span>
      <Badge variant="secondary" className="ml-2" forceLight={forceLight} >Bookmarks</Badge>
    </div>
  );
}