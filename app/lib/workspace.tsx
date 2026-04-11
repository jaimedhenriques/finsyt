'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

type WorkspaceContextType = {
  activeWorkspace: string | null
  setActiveWorkspace: (id: string | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextType>({ activeWorkspace: null, setActiveWorkspace: () => {} })

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null)
  return <WorkspaceContext.Provider value={{ activeWorkspace, setActiveWorkspace }}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
