export async function onRequest(context) {
  const url = new URL(context.request.url);
  const shareId = url.searchParams.get('id');
  const inputPwd = url.searchParams.get('pwd');

  const note = await context.env.BNBD.prepare("SELECT * FROM notes WHERE share_id = ?").bind(shareId).first();
  if (!note) return Response.json({ error: "链接已失效或不存在" }, { status: 404 });

  // 1. 检查有效期
  if (note.share_expire_at && Math.floor(Date.now() / 1000) > note.share_expire_at) {
    return Response.json({ error: "分享已过期" }, { status: 403 });
  }

  // 2. 检查密码
  if (note.share_pwd && note.share_pwd !== inputPwd) {
    return Response.json({ error: "密码错误", needPwd: true }, { status: 403 });
  }

  // 3. 阅后即焚处理
  if (note.share_burn_after_read) {
    await context.env.BNBD.prepare("UPDATE notes SET share_id = NULL WHERE id = ?").bind(note.id).run();
  }

  return Response.json({
    title: note.title,
    content: note.content,
    is_encrypted: note.is_encrypted,
    created_at: note.created_at
  });
}
