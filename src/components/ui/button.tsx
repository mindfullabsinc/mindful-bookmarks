// src/components/ui/button.tsx
import React from "react";

const base =
  "inline-flex items-center gap-2 justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:pointer-events-none";

type ButtonSize = "sm" | "md" | "lg" | "icon" | "default";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "destructive" | "outline" | "default";

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-9 px-4",
  lg: "h-10 px-5 text-base",
  icon: "h-9 w-9 p-0",
  default: "h-9 px-4", // alias of md
};

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-500",
  secondary: "bg-neutral-200 text-neutral-900 hover:bg-white",
  ghost: "bg-transparent hover:bg-neutral-100",
  link: "bg-transparent underline underline-offset-4 hover:no-underline",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-neutral-300 text-neutral-900 bg-transparent hover:bg-neutral-100",
  default: "bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-100 shadow-sm", 
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  className?: string;
  children?: React.ReactNode;
  size?: ButtonSize;            
  variant?: ButtonVariant;      
};

export function Button({
  asChild = false,
  className = "",
  children,
  size = "md",                  
  variant = "primary",          
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
