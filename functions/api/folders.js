// functions/api/folders.js
function getUser(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  try { return atob(authHeader.split(' ')[1]).split(':')[0]; } catch { return null; }
}

export async function onRequest(context) {
  const { request, env } = context;
  const userId = getUser(request);
  if (!userId) return Response.json({ error: "未授权" }, { status: 401 });

  const url = new URL(request.url);

  // GET: 获取所有文件夹
  if (request.method === "GET") {
    const { results } = await env.BNBD.prepare("SELECT * FROM folders WHERE user_id = ? ORDER BY created_at ASC").bind(userId).all();
    return Response.json(results);
  }

  // POST: 新建文件夹
  if (request.method === "POST") {
    const body = await request.json();
    const id = crypto.randomUUID();
    // 限制只能有2级：如果 parent_id 对应的文件夹本身也有 parent_id，则禁止创建
    if (body.parentId) {
      const parent = await env.BNBD.prepare("SELECT parent_id FROM folders WHERE id = ?").bind(body.parentId).first();
      if (parent && parent.parent_id) return Response.json({ error: "最多支持2级目录" }, { status: 400 });
    }
    await env.BNBD.prepare("INSERT INTO folders (id, user_id, name, parent_id) VALUES (?, ?, ?, ?)").bind(id, userId, body.name, body.parentId || null).run();
    return Response.json({ success: true, id });
  }

  // DELETE: 删除文件夹 (其中的笔记会移动到根目录或回收站，这里简单处理：移动到根目录)
  if (request.method === "DELETE") {
    const id = url.searchParams.get('id');
    await env.BNBD.prepare("UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?").bind(id, userId).run();
    await env.BNBD.prepare("DELETE FROM folders WHERE id = ? AND user_id = ?").bind(id, userId).run();
    return Response.json({ success: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
