'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
export default function DocsPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/app/developer') }, [])
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'#7D8FA9', fontSize:14 }}>Redirecting to Developer docs…</div>
}
