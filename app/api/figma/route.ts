import { NextRequest, NextResponse } from "next/server"
import * as Figma from "figma-api"

function getApi() {
  const token = process.env.FIGMA_ACCESS_TOKEN
  if (!token) return null
  return new Figma.Api({ personalAccessToken: token })
}

export async function GET(req: NextRequest) {
  const api = getApi()
  if (!api) {
    return NextResponse.json({ error: "FIGMA_ACCESS_TOKEN not configured" }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get("action") || "file"
  const fileKey = searchParams.get("file_key") || searchParams.get("fileKey") || ""

  try {
    switch (action) {
      case "file": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const file = await api.getFile({ file_key: fileKey })
        return NextResponse.json({
          name: file.name,
          lastModified: file.lastModified,
          version: file.version,
          thumbnailUrl: file.thumbnailUrl,
          pages: file.document?.children?.map((page: any) => ({
            id: page.id,
            name: page.name,
            type: page.type,
            childCount: page.children?.length || 0,
          })),
        })
      }

      case "components": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const comps = await api.getFileComponents({ file_key: fileKey })
        return NextResponse.json({
          components: (comps.meta?.components || []).map((c: any) => ({
            key: c.key,
            name: c.name,
            description: c.description,
            thumbnailUrl: c.thumbnail_url,
            containingFrame: c.containing_frame,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
          })),
        })
      }

      case "styles": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const styles = await api.getFileStyles({ file_key: fileKey })
        return NextResponse.json({
          styles: (styles.meta?.styles || []).map((s: any) => ({
            key: s.key,
            name: s.name,
            description: s.description,
            styleType: s.style_type,
            thumbnailUrl: s.thumbnail_url,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
          })),
        })
      }

      case "images": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const nodeIds = searchParams.get("node_ids") || ""
        if (!nodeIds) return NextResponse.json({ error: "node_ids required for images" }, { status: 400 })
        const format = (searchParams.get("format") || "png") as "jpg" | "png" | "svg" | "pdf"
        const scale = parseFloat(searchParams.get("scale") || "2")
        const images = await api.getImages({
          file_key: fileKey,
        }, {
          ids: nodeIds,
          format,
          scale,
        })
        return NextResponse.json({ images: images.images, err: images.err })
      }

      case "nodes": {
        if (!fileKey) return NextResponse.json({ error: "file_key required" }, { status: 400 })
        const ids = searchParams.get("ids") || ""
        if (!ids) return NextResponse.json({ error: "ids required" }, { status: 400 })
        const nodes = await api.getFileNodes({ file_key: fileKey }, { ids })
        return NextResponse.json({ nodes: nodes.nodes })
      }

      case "me": {
        const me = await api.getUserMe()
        return NextResponse.json(me)
      }

      default:
        return NextResponse.json({
          error: `Unknown action: ${action}`,
          available: ["file", "components", "styles", "images", "nodes", "me"],
        }, { status: 400 })
    }
  } catch (e: any) {
    const status = e?.response?.status || 500
    const message = e?.response?.data?.message || e?.message || String(e)
    return NextResponse.json({ error: message, status }, { status })
  }
}
