import type { HTMLAttributes, ReactElement } from 'react';

type SkeletonProps = HTMLAttributes<HTMLSpanElement>;

export default function Skeleton({ className = '', ...props }: SkeletonProps): ReactElement {
  return <span {...props} aria-hidden="true" className={`app-skeleton ${className}`} />;
}
