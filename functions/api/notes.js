function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 简单的鉴权帮助函数
function getUserFromRequest(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  
  // 解析我们在 auth.js 里生成的 token (Base64 of user_id:random)
  try {
    const token = authHeader.split(' ')[1]; // Bearer <token>
    const decoded = atob(token);
    const userId = decoded.split(':')[0];
    if (!userId) return null;
    return userId;
  } catch (e) {
    return null;
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const userId = getUserFromRequest(request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  // ★ 关键：只查询当前用户的笔记
  const { results } = await env.BNBD.prepare(
    "SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(userId).all();
  
  return Response.json(results);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const userId = getUserFromRequest(request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const body = await request.json();
  const id = uuidv4();
  
  // ★ 关键：插入时绑定 user_id
  await env.BNBD.prepare(
    "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
  ).bind(id, userId, body.title, body.content).run();

  return Response.json({ success: true, id });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const userId = getUserFromRequest(request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // ★ 关键：删除时也要验证 user_id，防止删除别人的笔记
  const res = await env.BNBD.prepare(
    "DELETE FROM notes WHERE id = ? AND user_id = ?"
  ).bind(id, userId).run();
  
  return Response.json({ success: true });
}