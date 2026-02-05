/* -------------------- Imports -------------------- */
/* Types */
import type { ImportBookmarksContentProps } from "@/components/shared/ImportBookmarksContent";

/* Components */
import { ImportBookmarksContent } from '@/components/shared/ImportBookmarksContent'
/* ---------------------------------------------------------- */

/**
 * Embedded variant of the import flow used inside onboarding without overlays/cancel.
 *
 * @param props Import content props minus the variant, which is forced to "embedded".
 */
export function ImportBookmarksEmbedded(
  props: Omit<ImportBookmarksContentProps, "variant"> 
) {
  return (
    <ImportBookmarksContent
      {...props}
      variant="embedded"
    />
  );
}