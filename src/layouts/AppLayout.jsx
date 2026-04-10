import Sidebar from '../components/Sidebar'

export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-navy-950">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
