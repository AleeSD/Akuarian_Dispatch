import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse bg-gray-200 rounded-lg', className)} />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}
