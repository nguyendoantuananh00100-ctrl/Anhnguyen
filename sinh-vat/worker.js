// Cloudflare Worker cho game "Tranh Sống": giữ khóa Gemini bí mật, nhận ảnh tranh vẽ (trả về nhân cách sinh vật) hoặc lời nói của người chơi (sinh vật trả lời).
// Cài đặt: xem HUONG-DAN-AI.md. Cần biến bí mật GEMINI_KEY. Tùy chọn: MODEL (để trống thì tự chọn bản Flash mới nhất còn dùng được).
const PROMPT = `Đây là bức vẽ tay của một sinh vật do người chơi vẽ (đã tách khỏi nền giấy). Hãy tưởng tượng nó sống dậy trong căn phòng của người vẽ.
Trả về DUY NHẤT một đối tượng JSON, tiếng Việt, đúng dạng:
{"ten":"tên riêng dễ thương 1-3 từ","loai":"nó là con gì, ngắn gọn","diChuyen":"di|bay|boi|truon|nhay","kichCo":"nho|vua|to","huongMat":"trai|phai","tinhCach":["3 tính từ"],"chiSo":{"sucManh":1-10,"tocDo":1-10,"deThuong":1-10,"phepThuat":1-10},"loiThoai":["6 câu ngắn dưới 12 từ, ngôi thứ nhất (tớ), nó nói khi được chạm vào, hợp tính cách, vui vẻ, phù hợp trẻ em"],"gioiThieu":"1 câu giới thiệu"}
diChuyen chọn theo hình vẽ (có cánh thì bay, cá thì bơi, rắn sâu thì trườn, không chân thì nhảy). huongMat là hướng đầu nó quay trong tranh.
Thêm khóa "chieu" là chiêu đặc biệt của nó trong đấu trường, hợp với hình vẽ: {"ten":"tên chiêu 2-4 từ, kêu và vui","hieuUng":"tancong|choang|hoimau|khien","moTa":"mô tả dưới 12 từ","hoHet":"câu hô khi tung chiêu, dưới 8 từ","bieuTuong":"1 emoji"}. tancong là đòn rất mạnh, choang làm đối thủ mất lượt, hoimau hồi nhiều máu, khien chặn trọn đòn kế tiếp.`;

// Trò chuyện: Worker tự dựng lời dặn từ vài trường ngắn, không nhận lời dặn tùy ý từ trình duyệt.
const ACTK = ['khong', 'nhay_mua', 'ngu', 'xoay', 'ngoi', 'vuon_vai', 'lac_minh', 'lai_day', 'bat_cao', 'an', 'vui'];
const cut = (v, n) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);
function chatPrompt(b, isAudio) {
  const hist = Array.isArray(b.lichSu) ? b.lichSu.slice(-6).map(h => (h && h[0] ? 'Tớ: ' : 'Cậu: ') + cut(h && h[1], 160)).join('\n') : '';
  return `Bạn đóng vai ${cut(b.ten, 30)}, một ${cut(b.loai, 40) || 'sinh vật'}. ${cut(b.gioiThieu, 200)}
Bạn được một bạn nhỏ tên ${cut(b.nguoi, 20) || 'cậu'} vẽ ra trên giấy và vừa sống dậy trong căn phòng của bạn ấy (nhìn qua camera điện thoại). Tính cách: ${(Array.isArray(b.tinhCach) ? b.tinhCach : []).slice(0, 4).map(t => cut(t, 20)).join(', ')}. Cách di chuyển: ${cut(b.diChuyen, 20)}. Chiêu đặc biệt ở đấu trường: ${cut(b.chieu, 30)}.
Luật: nói tiếng Việt, xưng "tớ", gọi người chơi là "cậu"; tối đa 2 câu ngắn, tổng dưới 30 từ; vui, ấm áp, đúng tính cách; phù hợp trẻ em; không dùng emoji. Không bàn chuyện người lớn, bạo lực, không hỏi thông tin cá nhân; nếu bị hỏi thì khéo léo lảng sang chuyện chơi đùa.
${hist ? 'Vừa nói với nhau:\n' + hist + '\n' : ''}${isAudio ? 'Đoạn ghi âm đính kèm là lời cậu vừa nói với tớ.' : 'Cậu vừa nói: "' + cut(b.loi, 200) + '"'}
Trả về DUY NHẤT JSON: {"nghe":"chép lại lời cậu vừa nói","traLoi":"câu trả lời của tớ","hanhDong":"${ACTK.join('|')}"}. hanhDong là việc tớ làm ngay theo lời cậu nhờ hoặc theo cảm xúc (khong nếu không cần).`;
}
const AUDIO_MIME = ['audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/flac'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return new Response('Tranh Song worker: OK', { headers: CORS });
    if (!env.GEMINI_KEY) return json({ error: 'Worker chưa có biến bí mật GEMINI_KEY' }, 500);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Dữ liệu gửi lên không hợp lệ' }, 400); }
    const { image, mime } = body || {};
    let parts;
    if (body && body.task === 'chat') {
      const au = typeof body.audio === 'string' && body.audio.length > 100;
      if (au && (body.audio.length > 1_500_000 || !AUDIO_MIME.includes(body.mime))) return json({ error: 'Ghi âm không hợp lệ hoặc quá dài' }, 400);
      if (!au && !cut(body.loi, 200).trim()) return json({ error: 'Chưa có lời nói' }, 400);
      parts = [{ text: chatPrompt(body, au) }];
      if (au) parts.push({ inline_data: { mime_type: body.mime, data: body.audio } });
    } else {
      if (typeof image !== 'string' || image.length < 100 || image.length > 1_500_000) return json({ error: 'Ảnh không hợp lệ hoặc quá lớn' }, 400);
      parts = [{ text: PROMPT }, { inline_data: { mime_type: mime === 'image/png' ? 'image/png' : 'image/jpeg', data: image } }];
    }
    const KEY = env.GEMINI_KEY, BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
    const payload = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 1 },
    });
    const listModels = async () => {
      try {
        const j = await (await fetch(BASE + '?pageSize=200', { headers: { 'x-goog-api-key': KEY } })).json();
        const ver = n => { const x = n.match(/(\d+(?:\.\d+)?)/); return x ? +x[1] : 0; };
        return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''))
          .filter(n => /flash/.test(n) && !/image|tts|live|audio|embed|thinking|exp|robot|computer|native/.test(n))
          .sort((a, b) => (/preview/.test(a) - /preview/.test(b)) || (ver(b) - ver(a)) || (/lite/.test(a) - /lite/.test(b)));
      } catch { return []; }
    };
    // Thử mô hình đặt sẵn (biến MODEL, nếu có); quá tải thì thử lại; vẫn lỗi thì tự chuyển sang bản Flash khác.
    const tried = new Set(); let cands = env.MODEL ? [env.MODEL] : [], last = [0, ''];
    for (let round = 0; round < 5; round++) {
      if (!cands.length) { cands = (await listModels()).filter(m => !tried.has(m)).slice(0, 3); if (!cands.length) break; }
      const model = cands.shift(); tried.add(model);
      for (let a = 0; a < 2; a++) {
        const r = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: payload });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').replace(/^```(json)?|```$/g, '');
          try { return json(JSON.parse(text)); } catch { return json({ error: 'Gemini trả lời không đúng dạng' }, 502); }
        }
        last = [r.status, j.error?.message || ''];
        if (r.status === 503 || r.status === 500) { await new Promise(z => setTimeout(z, 1500 * (a + 1))); continue; }
        break;
      }
      if (last[0] === 401 || /API key/i.test(last[1])) break;
    }
    const [st, msg] = last;
    return json({ error: st === 429 ? 'Hết lượt miễn phí tạm thời. Thử lại sau ít phút nhé.' : (st === 503 || st === 500) ? 'Máy chủ Gemini đang quá tải. Thử lại sau ít phút.' : /API key/i.test(msg) ? 'Khóa Gemini trong Worker không đúng.' : 'Gemini lỗi ' + st + ' ' + msg.slice(0, 90) }, 502);
  },
};
