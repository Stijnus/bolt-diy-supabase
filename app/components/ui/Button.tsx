import { forwardRef } from 'react';
import { cn } from '~/utils/classNames';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'xs' | 'sm' | 'default' | 'lg' | 'icon';
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', loading, children, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          {
            // Variants
            'bg-bolt-primary text-white hover:bg-bolt-primary/90': variant === 'default',
            'border border-bolt-border bg-transparent hover:bg-bolt-accent hover:text-bolt-accent-foreground':
              variant === 'outline',
            'hover:bg-bolt-accent hover:text-bolt-accent-foreground': variant === 'ghost',
            'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2':
              variant === 'secondary',

            // Sizes
            'h-7 px-2 text-xs': size === 'xs',
            'h-9 px-3 text-sm': size === 'sm',
            'h-10 px-4 text-sm': size === 'default',
            'h-11 px-8 text-base': size === 'lg',
            'h-9 w-9 p-0': size === 'icon',
          },
          className,
        )}
        ref={ref}
        {...props}
      >
        {loading ? <div className="i-ph:spinner animate-spin" /> : children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button };
