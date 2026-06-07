import { NavLink, useNavigate } from 'react-router-dom'
import {
  Truck, Home, Package, MapPin, Users, BarChart2, Settings, LogOut,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { RepartidorAvatar } from '../shared/RepartidorAvatar'

const NAV_ITEMS = [
  { to: '/dashboard',    icon: Home,      label: 'Inicio' },
  { to: '/pedidos',      icon: Package,   label: 'Pedidos' },
  { to: '/rutas',        icon: MapPin,    label: 'Rutas' },
  { to: '/repartidores', icon: Truck,     label: 'Repartidores' },
  { to: '/clientes',     icon: Users,     label: 'Clientes' },
  { to: '/reportes',     icon: BarChart2, label: 'Reportes' },
]

export function Sidebar() {
  const { rol, nombreUsuario, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 min-h-screen bg-white border-r border-gray-100 fixed left-0 top-0 bottom-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100">
        <div className="bg-celeste-500 rounded-lg p-1.5 text-white">
          <Truck size={20} />
        </div>
        <div className="leading-tight">
          <span className="font-bold text-gray-800 text-sm">Akuarian</span>
          <span className="text-celeste-500 font-semibold text-sm ml-1">Dispatch</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-celeste-50 text-celeste-700 border-l-[3px] border-celeste-500 pl-[9px]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={isActive ? 'text-celeste-500' : 'text-gray-400 group-hover:text-gray-600'} />
                {label}
              </>
            )}
          </NavLink>
        ))}

        {rol === 'admin' && (
          <NavLink
            to="/configuracion"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-celeste-50 text-celeste-700 border-l-[3px] border-celeste-500 pl-[9px]'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Settings size={18} className={isActive ? 'text-celeste-500' : 'text-gray-400 group-hover:text-gray-600'} />
                Configuración
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 p-2 rounded-lg">
          {nombreUsuario && <RepartidorAvatar nombre={nombreUsuario} size="sm" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{nombreUsuario}</p>
            <p className="text-xs text-gray-400 capitalize">{rol}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
