import { cn } from '../../lib/utils'

interface CardProps {
  className?: string
  children: React.ReactNode
  onClick?: () => void
}

export function Card({ className, children, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl shadow-sm border border-gray-100',
        onClick ? 'cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all duration-200' : '',
        className,
      )}
    >
      {children}
    </div>
  )
}
