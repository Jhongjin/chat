import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NotificationJob = {
  id: string;
  kind: "message_request" | "message";
  payload: Record<string, unknown>;
  user_id: string;
};

type PushTokenRow = {
  expo_push_token: string;
  user_id: string;
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET");
  const authorization = request.headers.get("authorization") ?? "";

  if (!cronSecret) {
    return json({ error: "missing worker secret" }, 500);
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "missing Supabase service credentials" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  await supabase.rpc("reset_stale_notification_jobs");

  const { data: jobs, error: claimError } = await supabase.rpc("claim_notification_jobs", {
    batch_size: 50
  });

  if (claimError) {
    return json({ error: claimError.message }, 500);
  }

  const claimedJobs = (jobs ?? []) as NotificationJob[];

  if (claimedJobs.length === 0) {
    return json({ claimed: 0, sent: 0, skipped: 0, failed: 0 });
  }

  const userIds = [...new Set(claimedJobs.map((job) => job.user_id))];
  const { data: pushTokens, error: tokenError } = await supabase
    .from("push_tokens")
    .select("user_id, expo_push_token")
    .in("user_id", userIds);

  if (tokenError) {
    await Promise.all(claimedJobs.map((job) => completeJob(supabase, job.id, "failed", tokenError.message)));
    return json({ error: tokenError.message }, 500);
  }

  const tokensByUser = groupTokensByUser((pushTokens ?? []) as PushTokenRow[]);
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of claimedJobs) {
    const tokens = tokensByUser.get(job.user_id) ?? [];

    if (tokens.length === 0) {
      skipped += 1;
      await completeJob(supabase, job.id, "skipped", "no active push token");
      continue;
    }

    const message = toExpoMessage(job, tokens);
    const delivered = await sendExpoPush(message);

    if (delivered.ok) {
      sent += 1;
      await completeJob(supabase, job.id, "sent");
    } else {
      failed += 1;
      await completeJob(supabase, job.id, "failed", delivered.error);
    }
  }

  return json({ claimed: claimedJobs.length, failed, sent, skipped });
});

function groupTokensByUser(rows: PushTokenRow[]) {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    grouped.set(row.user_id, [...(grouped.get(row.user_id) ?? []), row.expo_push_token]);
  }

  return grouped;
}

function toExpoMessage(job: NotificationJob, tokens: string[]) {
  const fromName = String(job.payload.fromName ?? "동네 친구");
  const bodyPreview = String(job.payload.bodyPreview ?? "");
  const title = job.kind === "message_request" ? "새 쪽지 요청" : `${fromName}님의 새 메시지`;
  const body = job.kind === "message_request" ? `${fromName}님이 쪽지를 보냈어요.` : bodyPreview || "새 메시지가 도착했어요.";

  return tokens.map((token) => ({
    body,
    data: {
      conversationId: job.payload.conversationId ?? null,
      jobId: job.id,
      kind: job.kind,
      requestId: job.payload.requestId ?? null
    },
    sound: "default",
    title,
    to: token
  }));
}

async function sendExpoPush(messages: Array<Record<string, unknown>>) {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      body: JSON.stringify(messages),
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      return { ok: false as const, error: `Expo push failed: ${response.status}` };
    }

    const payload = await response.json();

    if (Array.isArray(payload?.data) && payload.data.some((ticket: { status?: string }) => ticket.status === "error")) {
      return { ok: false as const, error: JSON.stringify(payload.data) };
    }

    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Expo push request failed"
    };
  }
}

async function completeJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  status: "failed" | "sent" | "skipped",
  error?: string
) {
  await supabase.rpc("complete_notification_job", {
    error_message: error ?? null,
    job_id: jobId,
    next_status: status
  });
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    },
    status
  });
}
