import React, { createContext, useContext, useMemo, useState } from "react";

type AccordionType = "single" | "multiple";

type Ctx =
  | {
      type: "single";
      open: string | null;
      setOpen: (val: string | null) => void;
      collapsible?: boolean;
    }
  | {
      type: "multiple";
      open: Set<string>;
      setOpen: (val: Set<string>) => void;
      collapsible?: boolean;
    };

const AccordionCtx = createContext<Ctx | null>(null);

export function Accordion({
  type = "single",
  collapsible = false,
  defaultValue,
  className = "",
  children,
}: {
  type?: AccordionType;
  collapsible?: boolean;
  defaultValue?: string | string[] | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (type === "single") {
    const [open, setOpen] = useState<string | null>(
      (typeof defaultValue === "string" ? defaultValue : null) ?? null
    );
    const ctx = useMemo<Ctx>(() => ({ type, open, setOpen, collapsible }), [type, open, collapsible]);
    return <div className={className}><AccordionCtx.Provider value={ctx}>{children}</AccordionCtx.Provider></div>;
  } else {
    const initial =
      Array.isArray(defaultValue) ? new Set(defaultValue) : new Set<string>();
    const [open, setOpen] = useState<Set<string>>(initial);
    const ctx = useMemo<Ctx>(() => ({ type, open, setOpen, collapsible }), [type, open, collapsible]);
    return <div className={className}><AccordionCtx.Provider value={ctx}>{children}</AccordionCtx.Provider></div>;
  }
}

export function AccordionItem({
  value,
  className = "",
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  return <div data-acc-item={value} className={className}>{children}</div>;
}

export function AccordionTrigger({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(AccordionCtx);
  if (!ctx) throw new Error("AccordionTrigger must be used inside <Accordion>");

  // Find the parent item value
  const parent = (React as any).useMemo
    ? ((): string => {
        // walk up the fiber via DOM: simplest reliable way here
        return "";
      })()
    : "";

  // Instead of fiber tricks, we read from the nearest wrapper with data-acc-item
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const getItemValue = () => {
    const el = ref.current;
    if (!el) return "";
    const item = el.closest("[data-acc-item]");
    return item?.getAttribute("data-acc-item") ?? "";
  };

  const isOpen = () => {
    const v = getItemValue();
    if (ctx.type === "single") return ctx.open === v;
    return (ctx.open as Set<string>).has(v);
  };

  const toggle = () => {
    const v = getItemValue();
    if (!v) return;

    if (ctx.type === "single") {
      if (ctx.open === v) {
        if (ctx.collapsible) ctx.setOpen(null);
      } else {
        ctx.setOpen(v);
      }
    } else {
      const next = new Set(ctx.open as Set<string>);
      if (next.has(v)) {
        if (ctx.collapsible) next.delete(v);
      } else {
        next.add(v);
      }
      (ctx as any).setOpen(next);
    }
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-expanded={isOpen()}
      className={`flex w-full items-center justify-between py-3 text-left text-sm font-medium text-neutral-200 cursor-pointer ${className}`}
    >
      <span>{children}</span>
      <span className="ml-4 select-none text-neutral-400">{isOpen() ? "−" : "+"}</span>
    </button>
  );
}

export function AccordionContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(AccordionCtx);
  if (!ctx) throw new Error("AccordionContent must be used inside <Accordion>");

  const ref = React.useRef<HTMLDivElement | null>(null);
  const getItemValue = () => {
    const el = ref.current;
    if (!el) return "";
    const item = el.closest("[data-acc-item]");
    return item?.getAttribute("data-acc-item") ?? "";
  };

  const open = (() => {
    const v = getItemValue();
    if (!v) return false;
    if (ctx.type === "single") return ctx.open === v;
    return (ctx.open as Set<string>).has(v);
  })();

  return (
    <div
      ref={ref}
      hidden={!open}
      className={`pb-3 text-sm text-neutral-400 ${className}`}
    >
      {children}
    </div>
  );
}
