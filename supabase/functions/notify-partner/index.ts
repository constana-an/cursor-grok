import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OrderRow = {
  id: string;
  couple_id: string;
  created_by: string;
  item_name: string;
  from_name: string;
  to_name: string;
  price: number;
};

/**
 * The wording is built here, from the order row, so a client can never choose
 * what the other phone is told. `order.created` goes to the partner; every
 * status event goes back to whoever placed the wish and paid for it — without
 * that, the person who spent the coins never learns they were answered.
 */
const NOTICES: Record<string, { audience: "partner" | "sender"; of: (order: OrderRow) => { title: string; body: string } }> = {
  "order.created": {
    audience: "partner",
    of: (order) => ({ title: "点单小铺收到新订单", body: `💕 ${order.from_name} 点了「${order.item_name}」` }),
  },
  "order.accepted": {
    audience: "sender",
    of: (order) => ({ title: `${order.to_name}接单啦`, body: `「${order.item_name}」已经安排上了` }),
  },
  "order.doing": {
    audience: "sender",
    of: (order) => ({ title: `${order.to_name}开始准备了`, body: `「${order.item_name}」正在准备中` }),
  },
  "order.done": {
    audience: "sender",
    of: (order) => ({ title: "心愿完成 💕", body: `${order.to_name}完成了「${order.item_name}」` }),
  },
  "order.rejected": {
    audience: "sender",
    of: (order) => ({ title: "这次没有接单", body: `「${order.item_name}」的 ${order.price} 甜心币已经退回给你` }),
  },
  "order.cancelled": {
    audience: "partner",
    of: (order) => ({ title: "对方撤回了一个心愿", body: `「${order.item_name}」已经撤回，甜心币退回了` }),
  },
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    // A client from before status notifications only sends `orderId`.
    const { orderId, event = "order.created" } = await request.json();
    const notice = NOTICES[event];
    if (!notice) return new Response("Unknown event", { status: 400, headers: corsHeaders });

    const { data: order, error } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (error || !order) return new Response("Order not found", { status: 404, headers: corsHeaders });
    // maybeSingle: a non-member has no row, which is a 403 — `single()` turned
    // that into a thrown 500.
    const { data: membership } = await admin
      .from("profiles").select("couple_id")
      .eq("user_id", userData.user.id).eq("couple_id", order.couple_id)
      .maybeSingle();
    if (!membership) return new Response("Forbidden", { status: 403, headers: corsHeaders });

    const recipients = admin.from("push_subscriptions").select("*").neq("user_id", userData.user.id);
    const { data: subscriptions } = await (notice.audience === "sender"
      ? recipients.eq("user_id", order.created_by)
      : recipients.eq("couple_id", order.couple_id));

    webpush.setVapidDetails(
      "mailto:couple-shop@example.com",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );
    const { title, body } = notice.of(order as OrderRow);
    const payload = JSON.stringify({ title, body, orderId: order.id, url: `/?order=${order.id}` });

    let delivered = 0;
    const gone: string[] = [];
    await Promise.all((subscriptions ?? []).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
        );
        delivered += 1;
      } catch (sendError) {
        // 404/410 mean the push service retired this endpoint for good. Keeping
        // the row would let the app keep reporting that it notified someone.
        const status = (sendError as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(subscription.endpoint);
      }
    }));
    if (gone.length > 0) await admin.from("push_subscriptions").delete().in("endpoint", gone);

    return new Response(
      JSON.stringify({ subscribed: subscriptions?.length ?? 0, delivered, pruned: gone.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
