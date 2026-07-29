import { cx, formatAud, META } from './tokens';

/**
 * Whether the money for this stage has moved.
 *
 *   released — paid out to the tradie, teal
 *   held     — funded but not yet released, neutral
 *
 * Deliberately NOT the `job_milestones.status` column. That column is
 * typed as a plain string and carries workflow states this component has
 * no business knowing about; the caller maps. Keeping the mapping outside
 * also lets the marketing site and PM reporting render the same list
 * without a database at all.
 */
export type MilestoneState = 'released' | 'held';

export interface MilestoneItem {
  id: string;
  /** What the stage is, in the words the client agreed to. */
  label: string;
  /** Integer cents, as stored. Formatted here so it can't drift. */
  amountCents: number;
  state: MilestoneState;
  /** Overrides the state word — e.g. "Paid" or "Awaiting" where it reads better. */
  stateLabel?: string;
}

export interface MilestoneListProps {
  milestones: ReadonlyArray<MilestoneItem>;
  className?: string;
}

const STATE_WORD: Record<MilestoneState, string> = {
  released: 'Released',
  held: 'Held',
};

/**
 * The payment schedule — the product's core pattern.
 *
 * Read-only by design. Editing milestones is a separate concern that
 * writes to the database; this renders what was agreed.
 */
export default function MilestoneList({ milestones, className }: MilestoneListProps) {
  return (
    <ol className={cx('list-none', className)}>
      {milestones.map((milestone) => {
        const released = milestone.state === 'released';
        return (
          <li
            key={milestone.id}
            className="flex items-center gap-3 border-b border-ct-line-soft py-3 last:border-b-0"
          >
            <span
              aria-hidden="true"
              className={cx(
                'h-2.5 w-2.5 flex-none rounded-full',
                released
                  ? 'bg-ct-teal ring-2 ring-ct-teal/[0.14]'
                  : 'border-2 border-ct-mute bg-transparent',
              )}
            />
            <span
              className={cx(
                'min-w-0 flex-1 text-sm',
                released ? 'text-ct-paper' : 'text-ct-mute-2',
              )}
            >
              {milestone.label}
            </span>
            <span className="flex-none font-ct-mono text-sm font-medium text-ct-paper">
              {formatAud(milestone.amountCents)}
            </span>
            <span
              className={cx(
                META,
                'w-16 flex-none text-right',
                released ? 'text-ct-teal' : 'text-ct-mute',
              )}
            >
              {milestone.stateLabel ?? STATE_WORD[milestone.state]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
