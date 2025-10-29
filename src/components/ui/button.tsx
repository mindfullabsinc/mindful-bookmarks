// src/components/ui/button.tsx
import React from "react";

const base =
  "inline-flex items-center gap-2 justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:pointer-events-none";

type ButtonSize = "sm" | "md" | "lg" | "icon" | "default";
type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "destructive";

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4",
  lg: "h-10 px-5 text-base",
  icon: "h-9 w-9 p-0",
  default: "h-9 px-4", // alias of md
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-black",
  secondary: "bg-neutral-200 text-neutral-900 hover:bg-white",
  ghost: "bg-transparent hover:bg-neutral-100",
  link: "bg-transparent underline underline-offset-4 hover:no-underline",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
  size?: ButtonSize;            // NEW
  variant?: ButtonVariant;      // NEW
};

export function Button({
  asChild = false,
  className = "",
  children,
  size = "md",                  // NEW
  variant = "primary",          // NEW
  ...props
}: ButtonProps) {
  const computed = `${base} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`;

  // If asChild, render the child element (e.g., <a>) and merge classes/props onto it
  if (asChild && React.isValidElement(children)) {
    // Tell TS that this element has an optional className
    const child = children as React.ReactElement<{ className?: string }>;

    return React.cloneElement(child, {
      // cloneElement<P> requires Partial<P>; coerce our props to match child's props
      ...(props as unknown as Partial<typeof child.props>),
      className: `${computed} ${child.props.className ?? ""}`,
    });
  }

  // Default: render a <button>
  return (
    <button className={computed} {...props}>
      {children}
    </button>
  );
}
