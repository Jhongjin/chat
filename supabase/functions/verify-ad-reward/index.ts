import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type AdMobVerifierKey = {
  base64: string;
  keyId: number;
};

type AdMobKeyResponse = {
  keys: AdMobVerifierKey[];
};

type CachedKeys = {
  expiresAt: number;
  keys: AdMobVerifierKey[];
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*"
};

const admobKeyUrl = "https://www.gstatic.com/admob/reward/verifier-keys.json";
let cachedKeys: CachedKeys | null = null;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "missing Supabase service credentials" }, 500);
  }

  const url = new URL(request.url);
  const verification = await verifyCallbackSafely(url);

  if (!verification.ok) {
    return json({ error: verification.error }, 401);
  }

  const transactionId = url.searchParams.get("transaction_id");
  const userId = url.searchParams.get("user_id");
  const rewardAmount = Number.parseInt(url.searchParams.get("reward_amount") ?? "1", 10);

  if (!transactionId || !userId) {
    return json({ error: "missing required AdMob SSV parameters" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase.rpc("confirm_ad_reward_from_ssv", {
    ad_network_param: url.searchParams.get("ad_network") ?? "admob",
    ad_unit_param: url.searchParams.get("ad_unit"),
    custom_data_param: url.searchParams.get("custom_data"),
    reward_amount_param: Number.isFinite(rewardAmount) ? rewardAmount : 1,
    reward_item_param: url.searchParams.get("reward_item") ?? "credit",
    transaction_id_param: transactionId,
    user_id_param: userId,
    verification_payload: {
      keyId: verification.keyId,
      receivedAt: new Date().toISOString(),
      query: Object.fromEntries(url.searchParams.entries())
    }
  });

  if (error) {
    return json({ error: error.message }, 500);
  }

  const row = Array.isArray(data) ? data[0] : null;

  return json({
    eventId: row?.event_id ?? null,
    grantedAmount: row?.granted_amount ?? 0,
    ok: true,
    status: row?.reward_status ?? "confirmed"
  });
});

async function verifyCallbackSafely(url: URL) {
  try {
    return await verifyCallback(url);
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "AdMob SSV verification failed"
    };
  }
}

async function verifyCallback(url: URL): Promise<{ keyId: number; ok: true } | { error: string; ok: false }> {
  const query = url.search.startsWith("?") ? url.search.slice(1) : "";
  const signatureMarker = "signature=";
  const signatureIndex = query.indexOf(signatureMarker);
  const signature = url.searchParams.get("signature");
  const keyId = Number.parseInt(url.searchParams.get("key_id") ?? "", 10);

  if (signatureIndex <= 0 || query[signatureIndex - 1] !== "&") {
    return { ok: false, error: "missing signature content" };
  }

  if (!signature || !Number.isFinite(keyId)) {
    return { ok: false, error: "missing signature or key id" };
  }

  const keys = await getVerifierKeys();
  const verifierKey = keys.find((key) => key.keyId === keyId);

  if (!verifierKey) {
    return { ok: false, error: "unknown AdMob verifier key" };
  }

  const signedContent = new TextEncoder().encode(query.slice(0, signatureIndex - 1));
  const signatureBytes = base64UrlToBytes(signature);
  const publicKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(verifierKey.base64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );

  const candidates = toSignatureCandidates(signatureBytes);

  for (const candidate of candidates) {
    const verified = await crypto.subtle.verify(
      { hash: "SHA-256", name: "ECDSA" },
      publicKey,
      candidate,
      signedContent
    );

    if (verified) {
      return { keyId, ok: true };
    }
  }

  return { ok: false, error: "invalid AdMob SSV signature" };
}

async function getVerifierKeys() {
  const now = Date.now();

  if (cachedKeys && cachedKeys.expiresAt > now) {
    return cachedKeys.keys;
  }

  const response = await fetch(admobKeyUrl);

  if (!response.ok) {
    throw new Error(`AdMob key fetch failed: ${response.status}`);
  }

  const payload = (await response.json()) as AdMobKeyResponse;
  cachedKeys = {
    expiresAt: now + 23 * 60 * 60 * 1000,
    keys: payload.keys
  };

  return cachedKeys.keys;
}

function toSignatureCandidates(derSignature: Uint8Array) {
  const candidates: Uint8Array[] = [];

  try {
    candidates.push(derToP1363(derSignature));
  } catch {
    // Some runtimes accept DER directly, so keep the original candidate below.
  }

  candidates.push(derSignature);
  return candidates;
}

function derToP1363(der: Uint8Array, partLength = 32) {
  let offset = 0;

  if (der[offset++] !== 0x30) {
    throw new Error("invalid DER sequence");
  }

  const sequence = readDerLength(der, offset);
  offset = sequence.offset;

  const r = readDerInteger(der, offset);
  offset = r.offset;
  const s = readDerInteger(der, offset);

  return concatBytes(leftPad(stripLeadingZeroes(r.value), partLength), leftPad(stripLeadingZeroes(s.value), partLength));
}

function readDerInteger(bytes: Uint8Array, offset: number) {
  if (bytes[offset++] !== 0x02) {
    throw new Error("invalid DER integer");
  }

  const length = readDerLength(bytes, offset);
  offset = length.offset;

  return {
    offset: offset + length.length,
    value: bytes.slice(offset, offset + length.length)
  };
}

function readDerLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset++];

  if (first < 0x80) {
    return { length: first, offset };
  }

  const lengthBytes = first & 0x7f;
  let length = 0;

  for (let index = 0; index < lengthBytes; index += 1) {
    length = (length << 8) | bytes[offset++];
  }

  return { length, offset };
}

function stripLeadingZeroes(bytes: Uint8Array) {
  let offset = 0;

  while (offset < bytes.length - 1 && bytes[offset] === 0) {
    offset += 1;
  }

  return bytes.slice(offset);
}

function leftPad(bytes: Uint8Array, length: number) {
  if (bytes.length > length) {
    return bytes.slice(bytes.length - length);
  }

  const padded = new Uint8Array(length);
  padded.set(bytes, length - bytes.length);
  return padded;
}

function concatBytes(first: Uint8Array, second: Uint8Array) {
  const output = new Uint8Array(first.length + second.length);
  output.set(first, 0);
  output.set(second, first.length);
  return output;
}

function base64UrlToBytes(value: string) {
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/"));
}

function base64ToBytes(value: string) {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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
