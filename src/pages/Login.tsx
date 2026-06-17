import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

type FormData = z.infer<typeof schema>

export default function Login() {
  const { signIn, rol, user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Navegar una vez que el rol se popule tras el login, sin depender de setTimeout
  useEffect(() => {
    if (!loggingIn) return
    if (rol !== null) {
      navigate(rol === 'repartidor' ? '/mi-ruta' : '/dashboard')
    } else if (user === null) {
      // signIn tuvo éxito pero loadUserProfile falló (forzó signOut)
      setLoggingIn(false)
      setLoading(false)
      toast.error('No se pudo cargar tu perfil. Intenta de nuevo.')
    }
  }, [rol, user, loggingIn, navigate])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      await signIn(data.email, data.password)
      setLoggingIn(true)
      // La navegación ocurre en el useEffect cuando rol se populate
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al iniciar sesión')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-celeste-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-celeste-500 rounded-2xl shadow-lg mb-4">
            <Truck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Akuarian Dispatch</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de gestión de despachos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Correo electrónico"
              type="email"
              placeholder="correo@empresa.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Contraseña"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
            <Button
              type="submit"
              className="w-full mt-2 hover:scale-105"
              loading={loading}
            >
              Ingresar
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Akuarian SAC © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
