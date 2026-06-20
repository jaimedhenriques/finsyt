import { NextRequest, NextResponse } from "next/server"

const FIGMA_BASE = "https://api.figma.com/v1"

function getToken(req: NextRequest): string | null {
  return req.cookies.get("figma_access_token")?.value
    ?? process.env.FIGMA_ACCESS_TOKEN
    ?? null
}

async function figmaFetch(token: string, path: string): Promise<Response> {
  return fetch(`${FIGMA_BASE}${path}`, {
    headers: {
      Authorization: token.startsWith("figd_") || token.length > 40
        ? `Bearer ${token}`
        : `Bearer ${token}`,
      "X-Figma-Token": token,
    },
  })
}

export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) {
    return NextResponse.json(
      { error: "Not authenticated. Connect via Figma OAuth or set FIGMA_ACCESS_TOKEN.", needsAuth: true },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action") ?? "file"
  const fileKey = searchParams.get("file_key") ?? searchParams.get("fileKey") ?? ""

  try {
    switch (action) {
      case "file": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const res = await figmaFetch(token, `/files/${fileKey}?depth=1`)
        const file = await res.json()
        return NextResponse.json({
          name: file.name,
          lastModified: file.lastModified,
          version: file.version,
          thumbnailUrl: file.thumbnailUrl,
          pages: file.document?.children?.map((page: { id: string; name: string; type: string; children?: unknown[] }) => ({
            id: page.id,
            name: page.name,
            type: page.type,
            childCount: page.children?.length ?? 0,
          })),
        })
      }

      case "components": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const res = await figmaFetch(token, `/files/${fileKey}/components`)
        const comps = await res.json()
        return NextResponse.json({
          components: (comps.meta?.components ?? []).map((c: Record<string, string>) => ({
            key: c.key, name: c.name, description: c.description,
            thumbnailUrl: c.thumbnail_url, containingFrame: c.containing_frame,
            createdAt: c.created_at, updatedAt: c.updated_at,
          })),
        })
      }

      case "styles": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const res = await figmaFetch(token, `/files/${fileKey}/styles`)
        const styles = await res.json()
        return NextResponse.json({
          styles: (styles.meta?.styles ?? []).map((s: Record<string, string>) => ({
            key: s.key, name: s.name, description: s.description,
            styleType: s.style_type, thumbnailUrl: s.thumbnail_url,
            createdAt: s.created_at, updatedAt: s.updated_at,
          })),
        })
      }

      case "images": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const nodeIds = searchParams.get("node_ids") ?? ""
        if (!nodeIds) return NextResponse.json({ error: "node_ids required" }, { status: 400 })
        const format = searchParams.get("format") ?? "png"
        const scale = searchParams.get("scale") ?? "2"
        const res = await figmaFetch(token, `/images/${fileKey}?ids=${encodeURIComponent(nodeIds)}&format=${format}&scale=${scale}`)
        const images = await res.json()
        return NextResponse.json({ images: images.images, err: images.err })
      }

      case "nodes": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const ids = searchParams.get("ids") ?? ""
        if (!ids) return NextResponse.json({ error: "ids required" }, { status: 400 })
        const res = await figmaFetch(token, `/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`)
        const nodes = await res.json()
        return NextResponse.json({ nodes: nodes.nodes })
      }

      case "me": {
        const res = await figmaFetch(token, "/me")
        return NextResponse.json(await res.json())
      }

      case "team-projects": {
        const teamId = searchParams.get("team_id") ?? ""
        if (!teamId) return NextResponse.json({ error: "team_id required" }, { status: 400 })
        const res = await figmaFetch(token, `/teams/${teamId}/projects`)
        return NextResponse.json(await res.json())
      }

      case "project-files": {
        const projectId = searchParams.get("project_id") ?? ""
        if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 })
        const res = await figmaFetch(token, `/projects/${projectId}/files`)
        return NextResponse.json(await res.json())
      }

      case "component-sets": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const res = await figmaFetch(token, `/files/${fileKey}/component_sets`)
        const sets = await res.json()
        return NextResponse.json({
          componentSets: (sets.meta?.component_sets ?? []).map((cs: Record<string, string>) => ({
            key: cs.key, name: cs.name, description: cs.description, thumbnailUrl: cs.thumbnail_url,
          })),
        })
      }

      case "status":
        return NextResponse.json({ authenticated: true })

      default:
        return NextResponse.json({
          error: `Unknown action: ${action}`,
          available: ["file","components","component-sets","styles","images","nodes","me","team-projects","project-files","status"],
        }, { status: 400 })
    }
  } catch (e) {
    const err = e as { message?: string }
    return NextResponse.json({ error: err?.message ?? String(e) }, { status: 500 })
  }
}
