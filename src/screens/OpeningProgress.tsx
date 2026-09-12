import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { useI18n } from "../i18n";

export type OpeningStep = { id: string; title: string; detail: string; done: boolean; action?: () => void; cta?: string };

/**
 * One step at a time.
 *
 * This used to list every remaining step at once — account, pairing, install,
 * notifications, first wish — all at the same weight, so the first run asked
 * for six things and named none of them as the place to start. It also ate the
 * top half of the shop, pushing the menu itself below the fold.
 *
 * Now it shows the next thing and nothing else, with the rest one tap away for
 * anyone who wants to see how far there is to go.
 */
export function OpeningProgress({ steps, onDismiss }: { steps: OpeningStep[]; onDismiss: () => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return null;
  const next = steps.find((step) => !step.done)!;

  return (
    <section className="opening-progress" aria-label={t("opening.aria")}>
      <div className="opening-head">
        <span>{t("opening.next", { count: steps.length - done })}</span>
        <button className="opening-skip" onClick={onDismiss}>{t("opening.later")}</button>
      </div>

      <strong className="opening-next-title">{next.title}</strong>
      <small className="opening-next-detail">{next.detail}</small>
      {next.action && (
        <button className="opening-action" onClick={next.action}>{next.cta ?? next.title}</button>
      )}

      <button className="opening-toggle" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
        {expanded ? t("common.collapse") : t("opening.showAll", { count: steps.length })}
        <ChevronDownIcon className={expanded ? "is-open" : ""} />
      </button>
      {expanded && (
        <ol className="opening-steps">
          {steps.map((step) => (
            <li key={step.id} className={step.done ? "is-done" : step.id === next.id ? "is-next" : ""}>
              <span className="opening-tick">{step.done ? <CheckIcon /> : null}</span>
              <div><strong>{step.title}</strong><small>{step.detail}</small></div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
