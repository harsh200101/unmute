import { Star } from 'lucide-react';
import clsx from 'clsx';

export default function RatingStars({ value = 0, max = 5, size = 'sm', showNumber = true, count }) {
  const v = Number(value) || 0;
  const px = size === 'lg' ? 18 : size === 'md' ? 16 : 14;
  return (
    <div className="inline-flex items-center gap-1">
      <div className="flex">
        {Array.from({ length: max }).map((_, i) => {
          const filled = i < Math.round(v);
          return (
            <Star
              key={i}
              size={px}
              className={clsx(filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
            />
          );
        })}
      </div>
      {showNumber && (
        <span className="text-xs text-slate-600">
          {v.toFixed(1)}{count != null && ` (${count})`}
        </span>
      )}
    </div>
  );
}
