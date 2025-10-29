import React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type H3Props = React.HTMLAttributes<HTMLHeadingElement>;

interface BaseProps {
  children: React.ReactNode;
  className?: string;
}

/** Card */
export function Card({ children, className = "", ...props }: BaseProps & DivProps) {
  return (
    <div
      className={`rounded-xl border border-neutral-800 bg-neutral-900 p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/** CardHeader */
export function CardHeader({ children, className = "", ...props }: BaseProps & DivProps) {
  return (
    <div className={`mb-2 ${className}`} {...props}>
      {children}
    </div>
  );
}

/** CardTitle */
export function CardTitle({ children, className = "", ...props }: BaseProps & H3Props) {
  return (
    <h3 className={`font-semibold ${className}`} {...props}>
      {children}
    </h3>
  );
}

/** CardContent */
export function CardContent({ children, className = "", ...props }: BaseProps & DivProps) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
