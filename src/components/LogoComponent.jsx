import { Badge } from "@/components/ui/badge";
import React from 'react';


export default function LogoComponent() {
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
      <span className="text-neutral-900 dark:text-white text-lg font-semibold tracking-tight">Mindful</span>
      <Badge variant="secondary" className="ml-2">Bookmarks</Badge>
    </div>
  );
}