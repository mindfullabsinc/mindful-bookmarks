import React, { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  className?: string;
  forceLight?: boolean;
}

export function Badge({ children, className = "", forceLight = false }: BadgeProps) {
  const bgColor = forceLight
    ? "bg-neutral-200"
    : "bg-neutral-200 dark:bg-neutral-800";

  const textColor = forceLight
    ? "text-neutral-700"
    : "text-neutral-700 dark:text-neutral-300";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium 
        ${bgColor} ${textColor} ${className}`}
    >
      {children}
    </span>
  );
}