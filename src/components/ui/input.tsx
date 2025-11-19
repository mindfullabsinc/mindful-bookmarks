import React from "react";

export function Input({ className = "", forceLight = false, ...props }) {
  const lightModeColoring = "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:ring-blue-500";
  const darkModeColoring = "dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:ring-blue-400"; 
  const coloring = forceLight
    ? lightModeColoring
    : `${lightModeColoring} ${darkModeColoring}`;

  return (
    <input
      className={`
        w-full rounded-md px-3 py-2 text-sm 
        border 
        transition-colors
        ${coloring}
        focus:outline-none focus:ring-2
        ${className}
      `}
      {...props}
    />
  );
}

