import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { runSkill, type BuiltInSkillId, BUILT_IN_SKILLS } from "@/server/skills/registry";

export async function POST(request: Request, context: { params: Promise<{ workspaceId: string; skillId: string }> }) {
  try {
    const userId = await requireUserId();
    const { workspaceId, skillId } = await context.params;
    if (!(skillId in BUILT_IN_SKILLS)) return NextResponse.json({ error: "Unknown skill." }, { status: 404 });
    const formData = await request.formData();
    const result = await runSkill({
      userId,
      workspaceId,
      skillId: skillId as BuiltInSkillId,
      prompt: String(formData.get("prompt") ?? ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Skill run failed." }, { status: 400 });
  }
}
