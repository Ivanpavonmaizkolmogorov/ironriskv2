/** API Route: POST /api/waitlist
 *  Saves email to Supabase "waitlist" table.
 *  Runs as a Vercel serverless function — zero server costs.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body.email?.trim()?.toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from("waitlist")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      return NextResponse.json({ message: "Ya estás en la lista! 🛡️" }, { status: 200 });
    }

    // Insert new lead
    const { error } = await supabase.from("waitlist").insert({
      email,
      source: body.source || "landing",
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[Waitlist] Supabase error:", error);
      return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
    }

    return NextResponse.json({ message: "¡Registrado! Te avisaremos al lanzar. 🚀" }, { status: 201 });
  } catch (err) {
    console.error("[Waitlist] Unexpected error:", err);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
