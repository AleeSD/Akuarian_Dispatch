import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import type { RolUsuario } from '../types'

const PGRST_NO_ROWS = 'PGRST116'

interface AuthContextValue {
  user: User | null
  session: Session | null
  rol: RolUsuario | null
  /** true para admin y operador; false para supervisor (solo lectura) y repartidor. */
  puedeEditar: boolean
  repartidorId: string | null
  nombreUsuario: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [rol, setRol] = useState<RolUsuario | null>(null)
  const [repartidorId, setRepartidorId] = useState<string | null>(null)
  const [nombreUsuario, setNombreUsuario] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadUserProfile(userId: string, attempt = 0): Promise<void> {
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('rol, nombre')
      .eq('id', userId)
      .single()

    if (!error && usuario) {
      setRol(usuario.rol as RolUsuario)
      setNombreUsuario(usuario.nombre)
      if (usuario.rol === 'repartidor') {
        const { data: rep } = await supabase
          .from('repartidores')
          .select('id')
          .eq('auth_user_id', userId)
          .single()
        setRepartidorId(rep?.id ?? null)
      }
      return
    }

    // El usuario no existe en la tabla usuarios → limbo real, signOut inmediato
    if (error?.code === PGRST_NO_ROWS) {
      await supabase.auth.signOut()
      return
    }

    // Error de red / timeout / servidor → reintento con backoff corto
    if (attempt < 2) {
      await new Promise<void>((r) => setTimeout(r, 400 * (attempt + 1)))
      return loadUserProfile(userId, attempt + 1)
    }

    // Reintentos agotados
    toast.error('Error de conexión al cargar tu perfil. Intenta de nuevo.')
    await supabase.auth.signOut()
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setRol(null)
        setRepartidorId(null)
        setNombreUsuario(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const puedeEditar = rol === 'admin' || rol === 'operador'

  return (
    <AuthContext.Provider value={{ user, session, rol, puedeEditar, repartidorId, nombreUsuario, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
