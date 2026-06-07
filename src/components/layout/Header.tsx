import { useState } from 'react'
import { Menu, Truck, Bell, X, Home, Package, MapPin, Users, BarChart2, LogOut } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard',    icon: Home,      label: 'Inicio' },
  { to: '/pedidos',      icon: Package,   label: 'Pedidos' },
  { to: '/rutas',        icon: MapPin,    label: 'Rutas' },
  { to: '/repartidores', icon: Truck,     label: 'Repartidores' },
  { to: '/clientes',     icon: Users,     label: 'Clientes' },
  { to: '/reportes',     icon: BarChart2, label: 'Reportes' },
]

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { nombreUsuario, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <>
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

      {/* Mobile drawer */}
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
