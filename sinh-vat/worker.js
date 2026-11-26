// Cloudflare Worker cho game "Tranh Sống": giữ khóa Gemini bí mật, chỉ nhận ảnh tranh vẽ và trả về nhân cách sinh vật.
// Cài đặt: xem HUONG-DAN-AI.md. Cần biến bí mật GEMINI_KEY. Tùy chọn: MODEL (mặc định gemini-2.5-flash).
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
    const model = env.MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime === 'image/png' ? 'image/png' : 'image/jpeg', data: image } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 1 },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: r.status === 429 ? 'Hết lượt miễn phí tạm thời, thử lại sau ít phút' : 'Gemini lỗi ' + r.status }, 502);
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').replace(/^```(json)?|```$/g, '');
    try { return json(JSON.parse(text)); } catch { return json({ error: 'Gemini trả lời không đúng dạng' }, 502); }
  },
};
