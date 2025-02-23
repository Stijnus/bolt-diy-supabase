import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '~/utils/classNames';

interface TooltipProps {
  children: React.ReactNode;
  content?: React.ReactNode;
  tooltip?: React.ReactNode; // For backward compatibility
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
}

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-md bg-bolt-background px-3 py-2 text-sm shadow-md border border-bolt-border',
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Create a default Tooltip component
const WithTooltip: React.FC<TooltipProps> = ({
  children,
  content,
  tooltip,
  className,
  position = 'top',
  sideOffset = 4,
}) => {
  const tooltipContent = content || tooltip; // Use content prop, fall back to tooltip prop

  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={position} sideOffset={sideOffset} className={className}>
          {tooltipContent}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
};

// Export both the composed component and individual parts
export { TooltipProvider, TooltipRoot as Tooltip, TooltipTrigger, TooltipContent };
export default WithTooltip;
