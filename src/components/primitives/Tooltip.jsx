import React from "react";

export default function Tooltip({ label, children, align = "center" }) {
  let positionClasses, arrowClasses;

  switch (align) {
    case "right":
      positionClasses = "absolute top-full right-0 mt-2";
      arrowClasses = "absolute -top-1 right-2 w-2 h-2 bg-gray-900/95 rotate-45";
      break;
    case "left": 
      positionClasses = "absolute top-full left-0 mt-2";
      arrowClasses = "absolute -top-1 left-2 w-2 h-2 bg-gray-900/95 rotate-45";
    default: // "center"
      positionClasses =
        "absolute top-full left-1/2 -translate-x-1/2 mt-2 text-center";
      arrowClasses =
        "absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900/95 rotate-45";
      break;
    
  }

  return (
    <span className="relative inline-flex group">
      {children}
      <span
        role="tooltip"
        className={`
          pointer-events-none ${positionClasses}
          rounded-md px-3 py-1 text-[12px] leading-none text-white bg-gray-900/95 shadow
          whitespace-nowrap
          opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
          transition-opacity duration-150 z-[9999]
        `}
      >
        {label}
        <span className={arrowClasses}></span>
      </span>
    </span>
  );
}
