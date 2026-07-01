import { NavLink, useNavigate } from 'react-router-dom'
import {
  Truck, Home, Package, Route, Users, BarChart2, Settings, LogOut, Upload,
  PanelLeftClose, PanelLeftOpen, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { RepartidorAvatar } from '../shared/RepartidorAvatar'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/dashboard',    icon: Home,      label: 'Actividad' },
  { to: '/pedidos',      icon: Package,   label: 'Pedidos' },
  { to: '/rutas',        icon: Route,     label: 'Rutas' },
  { to: '/repartidores', icon: Truck,     label: 'Repartidores' },
  { to: '/clientes',     icon: Users,     label: 'Clientes' },
  { to: '/reportes',     icon: BarChart2, label: 'Reportes' },
  { to: '/alertas',      icon: AlertTriangle, label: 'Alertas' },
  { to: '/importar',     icon: Upload,    label: 'Importar' },
]

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const { rol, nombreUsuario, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  const linkClass = (isActive: boolean) =>
    cn(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
      collapsed ? 'justify-center' : '',
      isActive
        ? 'bg-celeste-50 text-celeste-700'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800',
    )

  const iconClass = (isActive: boolean) =>
    cn('flex-shrink-0', isActive ? 'text-celeste-500' : 'text-gray-400 group-hover:text-gray-600')

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col min-h-screen bg-white border-r border-gray-100 fixed left-0 top-0 bottom-0 z-30 transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-2.5 py-5 border-b border-gray-100', collapsed ? 'justify-center px-0' : 'px-5')}>
        <div className="bg-celeste-500 rounded-lg p-1.5 text-white flex-shrink-0">
          <Truck size={20} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <span className="font-bold text-gray-800 text-sm">Akuarian</span>
            <span className="text-celeste-500 font-semibold text-sm ml-1">Dispatch</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) => linkClass(isActive)}
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={iconClass(isActive)} />
                {!collapsed && label}
              </>
            )}
          </NavLink>
        ))}

        {rol === 'admin' && (
          <NavLink
            to="/configuracion"
            title={collapsed ? 'Configuración' : undefined}
            className={({ isActive }) => linkClass(isActive)}
          >
            {({ isActive }) => (
              <>
                <Settings size={18} className={iconClass(isActive)} />
                {!collapsed && 'Configuración'}
              </>
            )}
          </NavLink>
        )}
      </nav>

      {/* Toggle colapsar */}
      <div className="px-3 pb-1">
        <button
          onClick={onToggle}
          title={collapsed ? 'Expandir' : 'Colapsar'}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700',
            collapsed ? 'justify-center' : '',
          )}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> Colapsar</>}
        </button>
      </div>

      {/* User */}
      <div className="p-3 border-t border-gray-100">
        <div className={cn('flex items-center gap-2.5 p-2 rounded-lg', collapsed ? 'justify-center' : '')}>
          {nombreUsuario && <RepartidorAvatar nombre={nombreUsuario} size="sm" />}
          {!collapsed && (
            <>
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
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
