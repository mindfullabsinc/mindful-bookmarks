import React from "react";
import { motion, type MotionProps } from "framer-motion";

const fadeUp: MotionProps = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.4 },
  transition: {
    duration: 1.5,
    ease: [0.22, 1, 0.36, 1],
  },
};

type FeatureSectionProps = {
  id?: string;
  textSide?: "left" | "right";
  sectionClassName?: string;

  /** Title for the feature block */
  title: string;

  /** Paragraph(s) — can be single or multiple <p> lines */
  body: string | string[];

  /** Visual JSX: image(s), overlapping stacks, animations, etc. */
  visual: React.ReactNode;

  /** Control horizontal position of visuals */
  visualJustify?: "start" | "end";
};

/**
 * Marketing feature block used across the landing page with mirrored layout support.
 */
export const FeatureSection: React.FC<FeatureSectionProps> = ({
  id,
  textSide = "left",
  sectionClassName = "",
  title,
  body,
  visual,
  visualJustify = "end",
}) => {
  const isTextLeft = textSide === "left";
  const gridCols =
    textSide === "left"
      ? "md:grid-cols-[1.0fr_1.3fr]"
      : "md:grid-cols-[1.3fr_1.0fr]";

  const visualJustifyClass =
    visualJustify === "start" ? "justify-start" : "justify-end";

  const bodyLines = Array.isArray(body) ? body : [body];

  const textBlock = (
    <>
      <h2 className="text-xl leading-tight tracking-tight md:text-4xl">
        {title}
      </h2>

      {bodyLines.map((line, i) => (
        <p key={i} className="mt-4 max-w-xl text-lg text-neutral-600">
          {line}
        </p>
      ))}
    </>
  );

  return (
    <section
      id={id}
      className={`relative mx-auto max-w-7xl px-4 pt-40 md:pt-40 ${sectionClassName}`}
    >
      <div className="pl-4 sm:pl-6 md:pl-6">
        <div className={`grid items-center gap-20 ${gridCols}`}>
          {isTextLeft ? (
            <>
              <motion.div {...fadeUp} className="md:-ml-2 lg:-ml-4 md:pr-4">
                {textBlock}
              </motion.div>

              <motion.div {...fadeUp} className={`relative flex ${visualJustifyClass}`}>
                {visual}
              </motion.div>
            </>
          ) : (
            <>
              <motion.div {...fadeUp} className={`relative flex ${visualJustifyClass}`}>
                {visual}
              </motion.div>

              <motion.div {...fadeUp} className="md:-ml-2 lg:-ml-4 md:pr-4">
                {textBlock}
              </motion.div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
