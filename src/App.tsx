import { Route, Routes } from 'react-router-dom'
import Header from '@/components/Header'
import ProtectedRoute from '@/components/ProtectedRoute'
import AdminRoute from '@/components/AdminRoute'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Farms from '@/pages/Farms'
import CropCycles from '@/pages/CropCycles'
import CropCycleDetail from '@/pages/CropCycleDetail'
import Admin from '@/pages/Admin'

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/farms"
          element={
            <ProtectedRoute>
              <Farms />
            </ProtectedRoute>
          }
        />
        <Route
          path="/crop-cycles"
          element={
            <ProtectedRoute>
              <CropCycles />
            </ProtectedRoute>
          }
        />
        <Route
          path="/crop-cycles/:id"
          element={
            <ProtectedRoute>
              <CropCycleDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />
      </Routes>
    </>
  )
}
