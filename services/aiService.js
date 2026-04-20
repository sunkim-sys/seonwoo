const https = require('https');
const fs = require('fs');
const path = require('path');

// Load API key from environment variable (cloud), fall back to .env file (local dev)
function loadApiKey() {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY.trim();
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/GROQ_API_KEY=(.+)/);
    return match ? match[1].trim() : '';
  } catch { return ''; }
}

const API_KEY = loadApiKey();

function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content: `당신은 온라인 강의 정보를 포스터용으로 요약하는 한국어 전문 카피라이터입니다.

규칙:
- 강의정보(info): 반드시 1문장, 핵심 가치를 담아 "~하세요." 또는 "~합니다." 로 끝냅니다.
- 학습 Point(point1, point2, point3): 반드시 3개, 각각 1문장, "~합니다." 또는 "~수 있습니다." 로 끝냅니다.
- 간결하고 실무 중심으로 작성합니다.
- 반드시 아래 JSON 형식으로만 응답합니다. JSON 외에 다른 텍스트는 절대 포함하지 마세요.

응답 형식:
{"info": "...", "point1": "...", "point2": "...", "point3": "..."}`
        },
        { role: 'user', content: prompt }
      ]
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (body.error) {
            reject(new Error(body.error.message));
            return;
          }
          const content = body.choices[0].message.content;
          resolve(content);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

async function summarizeLecture(lecture, retries = 2) {
  const prompt = `아래 강의 정보를 요약해주세요.

교육명: ${lecture.name}
과정소개: ${lecture.intro}
학습목표: ${lecture.goals}
학습대상: ${lecture.target}
학습목차 (일부): ${lecture.curriculum ? lecture.curriculum.substring(0, 800) : ''}

반드시 아래 JSON 형식으로만 응답하세요:
{"info": "강의정보 요약 1문장", "point1": "학습 Point 1", "point2": "학습 Point 2", "point3": "학습 Point 3"}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await callGroq(prompt);
      console.log(`[AI] ${lecture.name} - 응답 수신 (attempt ${attempt + 1})`);

      // Parse JSON from response
      const jsonMatch = result.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) throw new Error('JSON not found in response');

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate all fields exist
      if (!parsed.info || !parsed.point1 || !parsed.point2 || !parsed.point3) {
        throw new Error('Missing fields in response');
      }

      return parsed;
    } catch (err) {
      console.log(`[AI] ${lecture.name} - 시도 ${attempt + 1} 실패: ${err.message}`);
      if (attempt === retries) throw err;
      // Wait before retry
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function extractKeywords(lectures) {
  const list = lectures.map((l, i) => `${i + 1}. ${l.name} (${l.category}) - ${l.intro}`).join('\n');

  const prompt = `아래 강의 목록에서 각 강의의 핵심 키워드를 2개씩 추출해주세요.
키워드는 짧고 명확하게 (예: "데이터 분석", "리더십", "Python") 작성합니다.

${list}

반드시 아래 JSON 형식으로만 응답하세요:
{"결과": [{"name": "강의명", "keywords": ["키워드1", "키워드2"]}, ...]}`;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const result = await callGroq(prompt);
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON not found');

      const parsed = JSON.parse(jsonMatch[0]);
      const items = parsed['결과'] || parsed.results || parsed.data || [];

      const map = {};
      items.forEach(item => {
        if (item.name && item.keywords) {
          map[item.name] = item.keywords.slice(0, 2);
        }
      });

      // Also match by index if name doesn't match exactly
      if (Object.keys(map).length < lectures.length) {
        items.forEach((item, i) => {
          if (i < lectures.length && item.keywords) {
            map[lectures[i].name] = item.keywords.slice(0, 2);
          }
        });
      }

      return map;
    } catch (err) {
      console.log(`[AI] Keyword extraction attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === 2) return {};
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return {};
}

module.exports = { summarizeLecture, extractKeywords, loadApiKey, API_KEY };
