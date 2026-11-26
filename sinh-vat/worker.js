// Cloudflare Worker cho game "Tranh Sống": giữ khóa Gemini bí mật, chỉ nhận ảnh tranh vẽ và trả về nhân cách sinh vật.
// Cài đặt: xem HUONG-DAN-AI.md. Cần biến bí mật GEMINI_KEY. Tùy chọn: MODEL (để trống thì tự chọn bản Flash mới nhất còn dùng được).
const PROMPT = `Đây là bức vẽ tay của một sinh vật do người chơi vẽ (đã tách khỏi nền giấy). Hãy tưởng tượng nó sống dậy trong căn phòng của người vẽ.
Trả về DUY NHẤT một đối tượng JSON, tiếng Việt, đúng dạng:
{"ten":"tên riêng dễ thương 1-3 từ","loai":"nó là con gì, ngắn gọn","diChuyen":"di|bay|boi|truon|nhay","kichCo":"nho|vua|to","huongMat":"trai|phai","tinhCach":["3 tính từ"],"chiSo":{"sucManh":1-10,"tocDo":1-10,"deThuong":1-10,"phepThuat":1-10},"loiThoai":["6 câu ngắn dưới 12 từ, ngôi thứ nhất (tớ), nó nói khi được chạm vào, hợp tính cách, vui vẻ, phù hợp trẻ em"],"gioiThieu":"1 câu giới thiệu"}
diChuyen chọn theo hình vẽ (có cánh thì bay, cá thì bơi, rắn sâu thì trườn, không chân thì nhảy). huongMat là hướng đầu nó quay trong tranh.`;

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
    if (typeof image !== 'string' || image.length < 100 || image.length > 1_500_000) return json({ error: 'Ảnh không hợp lệ hoặc quá lớn' }, 400);
    const KEY = env.GEMINI_KEY, BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime === 'image/png' ? 'image/png' : 'image/jpeg', data: image } }] }],
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
