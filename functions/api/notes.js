function getUserFromRequest(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  try {
    const token = authHeader.split(' ')[1];
    return atob(token).split(':')[0] || null;
  } catch (e) { return null; }
}

export async function onRequestGet(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  const { results } = await context.env.BNBD.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
  return Response.json(results);
}

export async function onRequestPost(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  const body = await context.request.json();
  const id = crypto.randomUUID();
  // 存入 is_encrypted 状态
  await context.env.BNBD.prepare("INSERT INTO notes (id, user_id, title, content, is_encrypted) VALUES (?, ?, ?, ?, ?)")
    .bind(id, userId, body.title, body.content, body.is_encrypted ? 1 : 0).run();
  return Response.json({ success: true, id });
}

// 新增 PATCH 方法：用于生成分享链接
export async function onRequestPatch(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  
  const body = await context.request.json();
  const { noteId, days, burn, pwd } = body;
  
  const shareId = Math.random().toString(36).substring(2, 10);
  const expireAt = days > 0 ? Math.floor(Date.now() / 1000) + (days * 86400) : null;

  await context.env.BNBD.prepare(
    "UPDATE notes SET share_id = ?, share_pwd = ?, share_expire_at = ?, share_burn_after_read = ? WHERE id = ? AND user_id = ?"
  ).bind(shareId, pwd, expireAt, burn ? 1 : 0, noteId, userId).run();

  return Response.json({ success: true, shareId });
}

export async function onRequestDelete(context) {
  const userId = getUserFromRequest(context.request);
  const url = new URL(context.request.url);
  await context.env.BNBD.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(url.searchParams.get('id'), userId).run();
  return Response.json({ success: true });
}
