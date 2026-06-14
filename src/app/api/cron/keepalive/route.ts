import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return new Response(
      JSON.stringify({ ok: false, error: "cron_secret_not_configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const t0 = Date.now();
  try {
    const { data, error } = await supabase.rpc("search_anchor", {
      query_text: "keepalive-ping",
      match_count: 1,
    });

    const elapsed_ms = Date.now() - t0;

    if (error) {
      console.error("[cron] Supabase ping failed:", error.message);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "supabase_rpc_error",
          message: error.message,
          elapsed_ms,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[cron] keepalive ok, ${elapsed_ms}ms, ${data?.length ?? 0} rows`);

    return new Response(
      JSON.stringify({
        ok: true,
        elapsed_ms,
        rows_returned: data?.length ?? 0,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const elapsed_ms = Date.now() - t0;
    console.error("[cron] keepalive threw:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "unexpected_error",
        message: err instanceof Error ? err.message : String(err),
        elapsed_ms,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
