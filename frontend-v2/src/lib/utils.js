import clsx from 'clsx';

/* -------------------------------------------------------------------------- */
/* `cn()` — shadcn-style class-name helper.                                   */
/* Forwards to `clsx` so conditional/object/array class lists collapse into a */
/* single space-joined string. We deliberately do NOT pull in tailwind-merge  */
/* (it would double our utils footprint); collisions like `p-2 p-4` are rare  */
/* in this codebase and easy to spot in review.                               */
/* -------------------------------------------------------------------------- */
export function cn(...inputs) {
  return clsx(inputs);
}
