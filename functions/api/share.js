// functions/api/share.js

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const shareId = url.searchParams.get('id');
  const inputPwd = url.searchParams.get('pwd');

  if (!shareId) return Response.json({ error: "链接无效" }, { status: 404 });

  // 1. 查询笔记
  const note = await context.env.BNBD.prepare("SELECT * FROM notes WHERE share_id = ?").bind(shareId).first();
  if (!note) return Response.json({ error: "笔记不存在或链接已失效" }, { status: 404 });

  // 2. 检查有效期
  if (note.share_expire_at && Math.floor(Date.now() / 1000) > note.share_expire_at) {
    return Response.json({ error: "分享链接已过期" }, { status: 403 });
  }

  // 3. 检查访问密码
  if (note.share_pwd && note.share_pwd !== inputPwd) {
    // 如果密码不对，返回特定状态码让前端弹窗输入密码
    return Response.json({ error: "需要密码", needPwd: true }, { status: 403 });
  }

  // 4. 处理阅后即焚 (读取后立即销毁 share_id)
  if (note.share_burn_after_read) {
    await context.env.BNBD.prepare("UPDATE notes SET share_id = NULL WHERE id = ?").bind(note.id).run();
  }

  // 返回安全的数据（不包含用户ID等敏感信息）
  return Response.json({
    title: note.title,
    content: note.content,
    is_encrypted: note.is_encrypted,
    created_at: note.created_at
  });
}
