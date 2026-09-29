// 일회성 설정 도구: 알림 봇의 chat id 조회. GitHub Actions에서 TELEGRAM_BOT_TOKEN으로 실행.
// 봇 username(추가용)·웹훅 여부·최근 대화 chat id 를 로그로 출력한다(비밀값 아님).
const T = process.env.TELEGRAM_BOT_TOKEN;
if (!T) { console.log('NO_TOKEN'); process.exit(0); }
async function api(m: string) {
  const r = await fetch(`https://api.telegram.org/bot${T}/${m}`, { signal: AbortSignal.timeout(10000) });
  return r.json();
}
const me = await api('getMe');
console.log('BOT_USERNAME @' + (me?.result?.username ?? '(unknown)'), 'id', me?.result?.id ?? '?');
const wh = await api('getWebhookInfo');
console.log('WEBHOOK_URL', JSON.stringify(wh?.result?.url ?? ''));
const up = await api('getUpdates?limit=50&timeout=0');
if (up?.ok === false) { console.log('GETUPDATES_ERROR', JSON.stringify(up?.description ?? up)); process.exit(0); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chats = new Map<number, string>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const u of (up?.result ?? []) as any[]) {
  const c = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat || u.edited_message?.chat;
  if (c) chats.set(c.id, `${c.type} | ${c.title || c.username || [c.first_name, c.last_name].filter(Boolean).join(' ') || ''}`);
}
console.log('CHATS:');
for (const [id, label] of chats) console.log(`  CHAT_ID ${id}  (${label})`);
if (!chats.size) console.log('  (none) — 알림 봇을 그룹에 추가하고 그룹에서 "/start@봇username" 을 보낸 뒤 다시 실행하세요.');

// KL_TELEGRAM_CHAT_ID 가 주어지면 그 방으로 테스트 발신(멤버십·전달 확인)
const KC = process.env.KL_TELEGRAM_CHAT_ID;
if (KC) {
  const r = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: KC, text: '✅ KOSPI LAB 연결 테스트 — 앞으로 코인선물 규율 알림이 이 방으로 옵니다.' }),
  });
  const jr = await r.json();
  console.log('TEST_SEND', jr?.ok ? 'OK' : 'FAIL', JSON.stringify(jr?.description ?? ('msg_id=' + jr?.result?.message_id)));
}
