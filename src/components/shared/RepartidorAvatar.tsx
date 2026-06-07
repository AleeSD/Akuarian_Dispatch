import { iniciales } from '../../lib/utils'

interface RepartidorAvatarProps {
  nombre: string
  size?: 'sm' | 'md' | 'lg'
}

export function RepartidorAvatar({ nombre, size = 'md' }: RepartidorAvatarProps) {
  const sizes = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base',
  }

  return (
    <div className={`${sizes[size]} rounded-full bg-lavanda-100 text-lavanda-700 flex items-center justify-center font-semibold flex-shrink-0`}>
      {iniciales(nombre)}
    </div>
  )
}
