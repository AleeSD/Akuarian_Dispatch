import { useState, useRef, useEffect } from 'react'
import {
  Menu, Truck, Bell, X, Home, Package, Route, Users, BarChart2, LogOut, ChevronDown, Upload,
} from 'lucide-react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { RepartidorAvatar } from '../shared/RepartidorAvatar'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard',    icon: Home,      label: 'Inicio' },
  { to: '/pedidos',      icon: Package,   label: 'Pedidos' },
  { to: '/rutas',        icon: Route,     label: 'Rutas' },
  { to: '/repartidores', icon: Truck,     label: 'Repartidores' },
  { to: '/clientes',     icon: Users,     label: 'Clientes' },
  { to: '/reportes',     icon: BarChart2, label: 'Reportes' },
  { to: '/importar',     icon: Upload,    label: 'Importar' },
]

const TITLES: { match: string; label: string }[] = [
  { match: '/dashboard',     label: 'Inicio' },
  { match: '/pedidos',       label: 'Pedidos' },
  { match: '/rutas',         label: 'Rutas' },
  { match: '/repartidores',  label: 'Repartidores' },
  { match: '/clientes',      label: 'Clientes' },
  { match: '/reportes',      label: 'Reportes' },
  { match: '/configuracion', label: 'Configuración' },
  { match: '/importar',      label: 'Importar' },
]

interface HeaderProps {
  collapsed?: boolean
}

export function Header({ collapsed = false }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)   // drawer móvil
  const [userOpen, setUserOpen] = useState(false)   // dropdown avatar (escritorio)
  const { nombreUsuario, rol, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const userRef = useRef<HTMLDivElement>(null)

  const moduleTitle = TITLES.find((t) => pathname.startsWith(t.match))?.label ?? 'Akuarian Dispatch'

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
      {/* Top bar de escritorio (persistente) */}
      <header
        className={cn(
          'hidden lg:flex fixed top-0 right-0 z-20 h-14 items-center justify-between px-6 bg-celeste-900 text-white transition-all duration-200',
          collapsed ? 'left-16' : 'left-60',
        )}
      >
        <h1 className="text-sm font-semibold tracking-wide">{moduleTitle}</h1>

        <div className="flex items-center gap-1">
          <button className="p-2 rounded-lg hover:bg-white/10 text-white/90" title="Notificaciones">
            <Bell size={18} />
          </button>

          <div className="relative" ref={userRef}>
            <button
              onClick={() => setUserOpen((o) => !o)}
              className="flex items-center gap-2 p-1 pr-2 rounded-lg hover:bg-white/10"
            >
              {nombreUsuario && <RepartidorAvatar nombre={nombreUsuario} size="sm" />}
              <div className="text-left leading-tight hidden xl:block">
                <p className="text-xs font-medium">{nombreUsuario}</p>
                <p className="text-[10px] text-white/70 capitalize">{rol}</p>
              </div>
              <ChevronDown size={14} className="text-white/70" />
            </button>

            {userOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-gray-100 py-1 animate-fadeIn text-gray-700">
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-800 truncate">{nombreUsuario}</p>
                  <p className="text-xs text-gray-400 capitalize">{rol}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 text-coral-700"
                >
                  <LogOut size={15} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Header móvil */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-100 h-14 flex items-center px-4">
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
        >
          <Menu size={20} />
        </button>

        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="bg-celeste-500 rounded-lg p-1 text-white">
            <Truck size={16} />
          </div>
          <span className="font-bold text-gray-800 text-sm">Akuarian</span>
          <span className="text-celeste-500 font-semibold text-sm">Dispatch</span>
        </div>

        <button className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <Bell size={20} />
        </button>
      </header>

      {/* Drawer móvil */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative w-64 bg-white h-full flex flex-col animate-fadeIn">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="bg-celeste-500 rounded-lg p-1.5 text-white">
                  <Truck size={18} />
                </div>
                <span className="font-bold text-gray-800">Akuarian</span>
                <span className="text-celeste-500 font-semibold">Dispatch</span>
              </div>
              <button onClick={() => setMenuOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-0.5">
              {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-celeste-50 text-celeste-700' : 'text-gray-600 hover:bg-gray-50'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-800 mb-1">{nombreUsuario}</p>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <LogOut size={16} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
