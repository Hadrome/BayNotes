// functions/api/notes.js

function getUserFromRequest(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  try {
    const token = authHeader.split(' ')[1];
    const userId = atob(token).split(':')[0];
    return userId ? userId : null;
  } catch (e) { return null; }
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// GET: 获取笔记列表
export async function onRequestGet(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  const { results } = await context.env.BNBD.prepare("SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
  return Response.json(results);
}

// POST: 创建/保存笔记 (支持加密标记)
export async function onRequestPost(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  
  const body = await context.request.json();
  const id = uuidv4();
  
  // 插入数据，包括 is_encrypted
  await context.env.BNBD.prepare(
    "INSERT INTO notes (id, user_id, title, content, is_encrypted) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, userId, body.title, body.content, body.is_encrypted ? 1 : 0).run();
  
  return Response.json({ success: true, id });
}

// PATCH: 生成分享链接配置 (新增功能)
export async function onRequestPatch(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const body = await context.request.json();
  const { noteId, days, burn, pwd } = body;

  // 生成8位随机分享ID
  const shareId = Math.random().toString(36).substring(2, 10);
  
  // 计算过期时间戳 (days=0 代表永久，这里存 NULL)
  const expireAt = days > 0 ? Math.floor(Date.now() / 1000) + (days * 86400) : null;

  await context.env.BNBD.prepare(
    "UPDATE notes SET share_id = ?, share_pwd = ?, share_expire_at = ?, share_burn_after_read = ? WHERE id = ? AND user_id = ?"
  ).bind(shareId, pwd, expireAt, burn ? 1 : 0, noteId, userId).run();

  return Response.json({ success: true, shareId });
}

// DELETE: 删除笔记
export async function onRequestDelete(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  const url = new URL(context.request.url);
  await context.env.BNBD.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(url.searchParams.get('id'), userId).run();
  return Response.json({ success: true });
}
