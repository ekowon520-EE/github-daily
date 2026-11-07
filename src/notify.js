// 推送通道：WxPusher（图片+markdown）、Server酱（图文卡片）、邮箱（附件原图+正文）
import nodemailer from 'nodemailer';
import { esc } from './util.js';

const TIMEOUT = 30000;

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  let j = {};
  try { j = JSON.parse(text); } catch {}
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  return j;
}

async function sendWxPusher(wx, { title, markdown, imageUrl }) {
  // SPT 极简推送：POST /api/send/message/simple-push，body 带 spt 字段
  // 应用推送：POST /api/send/message，body 带 appToken + uids/topicIds
  // contentType：1 文字 / 2 HTML / 3 markdown（WxPusher 无独立图片类型，长图用 HTML img 发）
  const useSpt = Boolean(wx.spt);
  const base = useSpt
    ? 'https://wxpusher.zjiecode.com/api/send/message/simple-push'
    : 'https://wxpusher.zjiecode.com/api/send/message';
  const target = useSpt
    ? { spt: wx.spt }
    : { appToken: wx.appToken, uids: wx.uid ? [wx.uid] : undefined, topicIds: wx.topicIds.length ? wx.topicIds : undefined };

  if (imageUrl) {
    const html = `<div style="text-align:center"><h2>${esc(title)}</h2><img src="${imageUrl}" style="max-width:100%;border-radius:12px"/></div>`;
    const r1 = await postJSON(base, { ...target, content: html, summary: title.slice(0, 100), contentType: 2 });
    console.log(`WxPusher 图片消息: code=${r1.code} ${r1.msg || ''}`);
  }
  const r2 = await postJSON(base, { ...target, content: markdown, summary: title.slice(0, 100), contentType: 3 });
  console.log(`WxPusher 文字摘要: code=${r2.code} ${r2.msg || ''}`);
}

async function sendServerChan(sc, { title, markdown, imageUrl }) {
  const url = `https://sctapi.ftqq.com/${sc.sendKey}.send`;
  const desp = (imageUrl ? `![report](${imageUrl})\n\n` : '') + markdown;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ title: title.slice(0, 32), desp: desp.slice(0, 30000) }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.code !== undefined && j.code !== 0)) throw new Error(`HTTP ${res.status} code=${j.code} ${j.message || ''}`);
  console.log(`Server酱推送成功: ${j.message || 'ok'}`);
}

async function sendEmail(mail, { title, markdown, imagePath }) {
  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: 465,
    secure: true,
    auth: { user: mail.user, pass: mail.pass },
  });
  const html = [
    '<div style="max-width:540px;margin:0 auto">',
    imagePath ? '<img src="cid:report" style="width:100%;border-radius:12px;border:1px solid #e5e9f2" alt="GitHub 每日热榜"/>' : '',
    `<pre style="font:14px/1.7 -apple-system,'Segoe UI','Microsoft YaHei',sans-serif;white-space:pre-wrap">${esc(markdown)}</pre>`,
    '</div>',
  ].join('');
  const attachments = imagePath
    ? [{ filename: imagePath.split(/[\\/]/).pop(), path: imagePath, cid: 'report' }]
    : [];
  await transporter.sendMail({
    from: `"GitHub 每日热榜" <${mail.user}>`,
    to: mail.to,
    subject: title,
    text: markdown,
    html,
    attachments,
  });
  console.log(`邮件已发送至 ${mail.to}`);
}

export async function notifyAll(cfg, { title, markdown, imagePath, imageUrl }) {
  const results = [];
  const wx = cfg.wxpusher;
  if (wx.spt || (wx.appToken && (wx.uid || wx.topicIds.length))) {
    try { await sendWxPusher(wx, { title, markdown, imageUrl }); results.push('✅ WxPusher'); }
    catch (e) { results.push(`❌ WxPusher: ${e.message}`); }
  } else results.push('⏭ WxPusher 未配置，跳过');

  if (cfg.serverchan.sendKey) {
    try { await sendServerChan(cfg.serverchan, { title, markdown, imageUrl }); results.push('✅ Server酱'); }
    catch (e) { results.push(`❌ Server酱: ${e.message}`); }
  } else results.push('⏭ Server酱 未配置，跳过');

  if (cfg.email.user && cfg.email.pass) {
    try { await sendEmail(cfg.email, { title, markdown, imagePath }); results.push('✅ 邮箱'); }
    catch (e) { results.push(`❌ 邮箱: ${e.message}`); }
  } else results.push('⏭ 邮箱 未配置，跳过');

  return results;
}
