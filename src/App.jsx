import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Pricing from './pages/Pricing'
import Dashboard from './pages/Dashboard'
import DataExplorer from './pages/DataExplorer'
import Integrations from './pages/Integrations'
import Auth from './pages/Auth'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/explorer" element={<DataExplorer />} />
      <Route path="/integrations" element={<Integrations />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
