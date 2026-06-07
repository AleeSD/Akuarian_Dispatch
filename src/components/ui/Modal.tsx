import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fadeIn" onClick={onClose} />
      <div className={cn('relative bg-white rounded-2xl shadow-2xl w-full animate-fadeIn', sizes[size])}>
        {title && (
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">{title}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
