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
    const source = body.source || "landing";
    const isEnglish = source.includes("en");

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: isEnglish ? "Invalid email" : "Email inválido" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from("waitlist")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          message: isEnglish
            ? "This email was already on the list! No need to sign up again — we'll notify you when we launch. 🚀"
            : "¡Este correo ya estaba en la lista! No hace falta registrarse otra vez — te avisaremos al lanzar. 🚀",
        },
        { status: 200 }
      );
    }

    // Insert new lead
    const { error } = await supabase.from("waitlist").insert({
      email,
      source,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("[Waitlist] Supabase error:", error);
      return NextResponse.json(
        { error: isEnglish ? "Error saving. Please try again." : "Error al guardar" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: isEnglish
          ? "You're on the list! We'll notify you when we launch. 🚀"
          : "¡Registrado! Te avisaremos al lanzar. 🚀",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Waitlist] Unexpected error:", err);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
