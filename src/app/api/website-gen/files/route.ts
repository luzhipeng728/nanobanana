import { NextRequest, NextResponse } from "next/server";
import { getProject, getProjectFiles } from "@/lib/website-gen/project-store";

/**
 * GET /api/website-gen/files?projectId=xxx
 * 获取项目文件列表和内容
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  try {
    const project = await getProject(projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      projectId,
      files: project.files,
      metadata: project.metadata,
      imagePlaceholders: project.metadata.imagePlaceholders,
    });
  } catch (error) {
    console.error("[website-gen/files] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
