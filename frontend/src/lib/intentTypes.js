import { Heart, Compass, Target } from 'lucide-react';

export const INTENT_TYPES = {
  just_listen: {
    id: 'just_listen',
    label: 'Just Listen & Empathize',
    shortLabel: 'Just Listen',
    tagline: 'A safe space to vent, process emotions, and be heard without rush to give advice.',
    mentorDirective: 'Focus on empathetic, reflective listening. Validate feelings and hold back on immediate problem-solving unless asked.',
    icon: Heart,
    colorScheme: {
      primary: 'rose',
      border: 'border-rose-400',
      activeBorder: 'border-rose-500 ring-2 ring-rose-400/30',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border-rose-300 dark:border-rose-800',
      iconColor: 'text-rose-500 dark:text-rose-400',
      bannerBg: 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
    },
  },
  perspective: {
    id: 'perspective',
    label: 'Give Me Perspective',
    shortLabel: 'Perspective',
    tagline: 'Explore different angles, constructive reframing, and honest, balanced feedback.',
    mentorDirective: 'Offer fresh viewpoints and constructive reframing. Help illuminate blind spots with thoughtful questions.',
    icon: Compass,
    colorScheme: {
      primary: 'violet',
      border: 'border-violet-400',
      activeBorder: 'border-violet-500 ring-2 ring-violet-400/30',
      bg: 'bg-violet-50 dark:bg-violet-950/30',
      badgeBg: 'bg-violet-100 text-violet-800 dark:bg-violet-950/80 dark:text-violet-200 border-violet-300 dark:border-violet-800',
      iconColor: 'text-violet-500 dark:text-violet-400',
      bannerBg: 'bg-violet-50/90 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800',
    },
  },
  action_plan: {
    id: 'action_plan',
    label: 'Action & Clarity',
    shortLabel: 'Action Plan',
    tagline: 'Break down goals, identify concrete next steps, and create accountability.',
    mentorDirective: 'Structure the conversation around tangible outcomes, milestone breakdown, and clear commitments.',
    icon: Target,
    colorScheme: {
      primary: 'emerald',
      border: 'border-emerald-400',
      activeBorder: 'border-emerald-500 ring-2 ring-emerald-400/30',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
      iconColor: 'text-emerald-500 dark:text-emerald-400',
      bannerBg: 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
    },
  },
};

export const DEFAULT_INTENT = 'perspective';

export function getIntentConfig(type) {
  return INTENT_TYPES[type] || INTENT_TYPES[DEFAULT_INTENT];
}
