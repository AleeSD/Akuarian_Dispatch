import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pedidos from './pages/Pedidos'
import PedidoNuevo from './pages/PedidoNuevo'
import Rutas from './pages/Rutas'
import RutaDetalle from './pages/RutaDetalle'
import Repartidores from './pages/Repartidores'
import Clientes from './pages/Clientes'
import Reportes from './pages/Reportes'
import MiRuta from './pages/repartidor/MiRuta'
import PedidoAccion from './pages/repartidor/PedidoAccion'

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-2 border-celeste-500 border-t-transparent" />
  </div>
)

function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode
  requiredRole?: string[]
}) {
  const { user, rol, loading } = useAuth()

  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />

  // user autenticado pero rol aún no cargado (ventana post-login mientras loadUserProfile corre)
  if (rol === null) return <Spinner />

  if (requiredRole && !requiredRole.includes(rol)) {
    return rol === 'repartidor'
      ? <Navigate to="/mi-ruta" replace />
      : <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  const { user, rol, loading } = useAuth()

  if (loading) return <Spinner />

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user
            ? <Navigate to={rol === 'repartidor' ? '/mi-ruta' : '/dashboard'} replace />
            : <Login />
        }
      />

      <Route path="/dashboard" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <Dashboard />
        </ProtectedRoute>
      } />

      <Route path="/pedidos" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <Pedidos />
        </ProtectedRoute>
      } />

      <Route path="/pedidos/nuevo" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <PedidoNuevo />
        </ProtectedRoute>
      } />

      <Route path="/pedidos/:id" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <Pedidos />
        </ProtectedRoute>
      } />

      <Route path="/rutas" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <Rutas />
        </ProtectedRoute>
      } />

      <Route path="/rutas/:id" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <RutaDetalle />
        </ProtectedRoute>
      } />

      <Route path="/repartidores" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <Repartidores />
        </ProtectedRoute>
      } />

      <Route path="/clientes" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <Clientes />
        </ProtectedRoute>
      } />

      <Route path="/reportes" element={
        <ProtectedRoute requiredRole={['admin', 'operador', 'supervisor']}>
          <Reportes />
        </ProtectedRoute>
      } />

      <Route path="/mi-ruta" element={
        <ProtectedRoute requiredRole={['repartidor']}>
          <MiRuta />
        </ProtectedRoute>
      } />

      <Route path="/mi-ruta/:pedidoId/accion" element={
        <ProtectedRoute requiredRole={['repartidor']}>
          <PedidoAccion />
        </ProtectedRoute>
      } />

      <Route path="/" element={
        user
          ? <Navigate to={rol === 'repartidor' ? '/mi-ruta' : '/dashboard'} replace />
          : <Navigate to="/login" replace />
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#fff',
              color: '#2D3748',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              borderRadius: '12px',
              fontSize: '14px',
            },
          }}
        />
      </AuthProvider>

    </BrowserRouter>
  )
}
