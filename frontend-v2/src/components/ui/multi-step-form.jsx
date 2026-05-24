import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import Card, { CardHeader, CardBody, CardFooter } from './Card.jsx';
import Button from './Button.jsx';

/* -------------------------------------------------------------------------- */
/* MultiStepForm — wizard shell.                                              */
/* Renders a Card with: title + progress bar + step content + footer buttons. */
/*                                                                            */
/* The wrapper is "dumb" — it does NOT own the step number or form state. The */
/* parent passes `currentStep` (1-based), `totalSteps`, and the step-specific */
/* content as children. The parent also wires `onBack` / `onNext` and decides */
/* what "next" means on the final step (e.g. submit instead of advance).      */
/*                                                                            */
/* Sizes use our `Card` base (rounded-2xl, soft shadow); progress bar is a    */
/* plain `<div>` driven by an inline width %, no radix-progress install.      */
/* -------------------------------------------------------------------------- */

/**
 * @param {object} props
 * @param {number} props.currentStep                          - 1-based current step
 * @param {number} props.totalSteps
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.description]
 * @param {() => void} props.onBack
 * @param {() => void} props.onNext
 * @param {() => void} [props.onClose]                        - optional X icon
 * @param {string} [props.backButtonText]
 * @param {string} [props.nextButtonText]
 * @param {React.ReactNode} [props.footerContent]             - left-side footer slot (e.g. "Need help?")
 * @param {boolean} [props.nextDisabled]
 * @param {boolean} [props.nextLoading]
 * @param {'sm'|'default'|'lg'} [props.size]
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
const MultiStepForm = forwardRef(function MultiStepForm(
  {
    currentStep,
    totalSteps,
    title,
    description,
    onBack,
    onNext,
    onClose,
    backButtonText = 'Back',
    nextButtonText = 'Next',
    footerContent,
    nextDisabled = false,
    nextLoading = false,
    size = 'default',
    className,
    children,
  },
  ref
) {
  const progress = Math.max(0, Math.min(100, Math.round((currentStep / totalSteps) * 100)));
  const widthByVariant = {
    sm:      'md:w-[550px]',
    default: 'md:w-[700px]',
    lg:      'md:w-[850px]',
  };

  const variants = {
    hidden: { opacity: 0, x: 60 },
    enter:  { opacity: 1, x: 0 },
    exit:   { opacity: 0, x: -60 },
  };

  return (
    <Card ref={ref} className={cn('flex flex-col w-full', widthByVariant[size], className)}>
      {/* ----- Header: title + close + progress ----- */}
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-semibold text-foreground leading-tight">
            {title}
          </h2>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close"
              className="-m-2 h-9 w-9 p-0"
            >
              <X size={16} />
            </Button>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        <div className="flex items-center gap-4 pt-2">
          <div
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-2 w-full overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground whitespace-nowrap">
            {currentStep}/{totalSteps}
          </p>
        </div>
      </CardHeader>

      {/* ----- Step content: animated swap ----- */}
      <CardBody className="min-h-[300px] overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            variants={variants}
            initial="hidden"
            animate="enter"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </CardBody>

      {/* ----- Footer: helper slot + back/next ----- */}
      <CardFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-muted-foreground">{footerContent}</div>
        <div className="flex w-full sm:w-auto gap-2 sm:justify-end">
          {currentStep > 1 && (
            <Button variant="secondary" onClick={onBack} className="flex-1 sm:flex-none">
              {backButtonText}
            </Button>
          )}
          <Button
            onClick={onNext}
            disabled={nextDisabled}
            loading={nextLoading}
            className="flex-1 sm:flex-none"
          >
            {nextButtonText}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
});

export default MultiStepForm;
export { MultiStepForm };
