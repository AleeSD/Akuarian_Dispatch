import { useNavigate } from 'react-router-dom'
import { MapPin, Camera, AlertTriangle, Truck, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useRepartidorPedidos } from '../../hooks/useRepartidor'
import { saludoHora } from '../../lib/utils'
import { EstadoBadge } from '../../components/shared/EstadoBadge'
import { SkeletonCard } from '../../components/ui/Skeleton'
import type { EstadoPedido } from '../../types'

const PENDIENTES: EstadoPedido[] = ['recibido', 'listo_despacho', 'recogido', 'en_camino']
const TERMINADOS: EstadoPedido[] = ['entregado', 'no_entregado', 'reprogramado']

export default function MiRuta() {
  const { nombreUsuario, signOut } = useAuth()
  const { pedidos, loading, error, refetch } = useRepartidorPedidos()
  const navigate = useNavigate()

  const pendientes = pedidos.filter((p) => PENDIENTES.includes(p.estado))
  const terminados = pedidos.filter((p) => TERMINADOS.includes(p.estado))
  const entregados = pedidos.filter((p) => p.estado === 'entregado').length

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-celeste-500 rounded-lg p-1.5 text-white">
            <Truck size={18} />
          </div>
          <span className="font-bold text-gray-800 text-sm">Akuarian</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">{nombreUsuario}</span>
          <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Greeting */}
        <div>
          <h1 className="text-xl font-bold text-gray-800">{saludoHora()}, {nombreUsuario?.split(' ')[0]}</h1>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="bg-celeste-100 text-celeste-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {pedidos.length} asignados
            </span>
            <span className="bg-menta-100 text-menta-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {entregados} entregados
            </span>
            <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full">
              {pendientes.length} pendientes
            </span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-coral-100 p-8 text-center">
            <AlertTriangle size={32} className="mx-auto mb-3 text-coral-400" />
            <p className="text-gray-700 font-medium">No se pudieron cargar tus pedidos</p>
            <p className="text-sm text-gray-400 mt-1">{error}</p>
            <button onClick={refetch} className="mt-4 text-sm text-celeste-600 underline">Reintentar</button>
          </div>
        ) : pedidos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
            <MapPin size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No tienes pedidos asignados hoy</p>
          </div>
        ) : (
          <>
            {pendientes.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pendientes</h2>
                {pendientes.map((p) => (
                  <button
                    key={p.id}
                    className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left active:scale-[0.99] transition-transform shadow-sm"
                    onClick={() => navigate(`/mi-ruta/${p.id}/accion`)}
                    style={{ minHeight: 100 }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-mono font-bold text-celeste-700 text-lg">{p.numero_pedido}</span>
                      <EstadoBadge estado={p.estado} size="md" />
                    </div>
                    <p className="text-base font-medium text-gray-800">{p.cliente_nombre}</p>
                    {p.distrito_entrega && (
                      <p className="text-sm text-gray-500">{p.distrito_entrega}</p>
                    )}
                    <div className="flex items-start gap-1.5 mt-1">
                      <MapPin size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-600">{p.direccion_entrega}</p>
                    </div>
                    {p.referencia_entrega && (
                      <p className="text-xs text-gray-400 mt-0.5 ml-[18px]">{p.referencia_entrega}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {p.observaciones && (
                        <div className="flex items-center gap-1">
                          <AlertTriangle size={12} className="text-orange-400" />
                          <span className="text-xs text-orange-500">Con observaciones</span>
                        </div>
                      )}
                      {(p.foto_recogido_url || p.foto_entregado_url || p.foto_no_entregado_url) && (
                        <div className="flex items-center gap-1">
                          <Camera size={12} className="text-menta-500" />
                          <span className="text-xs text-menta-600">Foto subida</span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {terminados.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Completados</h2>
                {terminados.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-gray-100 p-3.5 flex items-center gap-3 opacity-75"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-sm font-bold text-gray-500">{p.numero_pedido}</span>
                      <p className="text-sm text-gray-600 truncate">{p.cliente_nombre}</p>
                    </div>
                    <EstadoBadge estado={p.estado} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
