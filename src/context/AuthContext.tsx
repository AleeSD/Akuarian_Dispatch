import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { RolUsuario } from '../types'

interface AuthContextValue {
  user: User | null
  session: Session | null
  rol: RolUsuario | null
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

  async function loadUserProfile(userId: string) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol, nombre')
      .eq('id', userId)
      .single()

    if (usuario) {
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
    }
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
        loadUserProfile(session.user.id)
      } else {
        setRol(null)
        setRepartidorId(null)
        setNombreUsuario(null)
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

  return (
    <AuthContext.Provider value={{ user, session, rol, repartidorId, nombreUsuario, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
