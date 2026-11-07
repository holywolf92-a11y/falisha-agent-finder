import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
  {
    variants: {
      variant: {
        default:    'bg-primary/15 text-primary border-primary/30',
        secondary:  'bg-muted text-muted-foreground border-border',
        success:    'bg-success/15 text-success border-success/30',
        warning:    'bg-warning/15 text-warning border-warning/30',
        destructive:'bg-destructive/15 text-destructive border-destructive/30',
        outline:    'bg-transparent text-muted-foreground border-border',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  pulse?: boolean;
}

export function Badge({ className, variant, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {pulse && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
      {children}
    </span>
  );
}
