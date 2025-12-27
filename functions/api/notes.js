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
  const id = uuidv4();
  await context.env.BNBD.prepare("INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)").bind(id, userId, body.title, body.content).run();
  return Response.json({ success: true, id });
}

export async function onRequestDelete(context) {
  const userId = getUserFromRequest(context.request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });
  const url = new URL(context.request.url);
  await context.env.BNBD.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(url.searchParams.get('id'), userId).run();
  return Response.json({ success: true });
}