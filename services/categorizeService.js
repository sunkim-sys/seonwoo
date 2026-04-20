const https = require('https');
const { API_KEY } = require('./aiService');

const CATEGORY_TREE = {
  'AI TECH': ['LLM/응용', '머신러닝', '딥러닝', '컴퓨터 비전', '자연어 처리', 'MLOps/강화학습'],
  'AI 업무생산성': ['프롬프트 엔지니어링', '서비스 기획', '업무자동화', 'AI 문서작성/OA', '콘텐츠 제작'],
  '프로그래밍': ['웹 개발', '백엔드 개발', '클라우드', '게임 개발', '블록체인', 'DevOps/보안', '개발 커리어', '모바일앱'],
  '데이터사이언스': ['데이터분석', '데이터엔지니어링', '데이터 시각화', '수학/통계'],
  '비즈니스 스킬': ['문서/OA', '기획/분석', '커뮤니케이션', '프로젝트 관리', '문제 해결'],
  '트렌드/인사이트': ['디지털전환(DX)', '산업트렌드', '경제/경영', '혁신/미래기술', '커리어인사이트', '글로벌이슈'],
  '마케팅': ['디지털마케팅', '데이터마케팅', '콘텐츠/브랜딩', 'SNS/광고', '고객경험(CX)', '마케팅전략'],
  '부동산/금융': ['회계/재무/세무', '투자/주식', '부동산', '금융실무', '자산관리'],
  '디자인': ['그래픽/브랜딩', 'UX/UI', '영상/모션', '3D/CG', '드로잉/일러스트', '디자인툴'],
  '외국어': ['영어', '중국어', '일본어', '스페인어', '프랑스어', '기타 외국어'],
  '경영/리더십': ['조직관리', '리더십', '인사/성과관리', '전략/MBA'],
  '교양': ['자기관리', '인문/역사', '취미/라이프', '독서/글쓰기'],
  '자격증': ['IT/OA', '데이터/빅데이터', '회계/세무', '금융/투자', '어학/외국어', '산업/기술', '기타전문자격'],
  '직무': ['IT', '제조', '건설', '의료', '서비스', '유통/물류', '법무/R&D', '직무 기타'],
};

function buildSystemPrompt() {
  const tree = Object.entries(CATEGORY_TREE)
    .map(([cat, subs]) => `- ${cat}: ${subs.join(', ')}`)
    .join('\n');
  return `당신은 온라인 강의를 정해진 카테고리 체계에 분류하는 전문가입니다.

분류 체계 (대분류: 서브카테고리들):
${tree}

규칙:
- 반드시 위 목록에 있는 대분류와 서브카테고리만 사용합니다.
- 서브카테고리는 해당 대분류에 속한 것 중에서만 고릅니다.
- 신뢰도(confidence)는 0~1 사이 숫자 (1이 가장 확신).
- reason은 1문장으로 짧게.
- 반드시 JSON 배열로만 응답. JSON 외 텍스트 금지.

응답 형식:
[{"name":"강의명","category":"대분류","subCategory":"서브","confidence":0.85,"reason":"..."}]`;
}

function callGroq(systemPrompt, userPrompt) {
  if (!API_KEY) return Promise.reject(new Error('AI API 키가 설정되지 않았습니다. (GROQ_API_KEY 환경변수 확인 필요)'));
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4000,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
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
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          if (body.error) return reject(new Error(body.error.message));
          resolve(body.choices[0].message.content);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

function validateAssignment(item) {
  const cat = item.category;
  const sub = item.subCategory;
  if (!CATEGORY_TREE[cat]) return false;
  if (sub && !CATEGORY_TREE[cat].includes(sub)) return false;
  return true;
}

async function classifyLectures(lectures) {
  const sysPrompt = buildSystemPrompt();
  const list = lectures.map((l, i) => {
    const intro = (l.intro || '').slice(0, 400);
    return `${i + 1}. 강의명: ${l.name}${intro ? `\n   소개: ${intro}` : ''}`;
  }).join('\n');

  const userPrompt = `아래 ${lectures.length}개 강의를 분류해주세요.

${list}

각 강의에 대해 가장 적절한 대분류와 서브카테고리를 골라 JSON 배열로 응답하세요.`;

  const raw = await callGroq(sysPrompt, userPrompt);
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');
  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) throw new Error('AI 응답이 배열이 아닙니다.');

  return parsed.map((item, i) => {
    const lecture = lectures[i] || {};
    const valid = validateAssignment(item);
    return {
      name: item.name || lecture.name || '',
      intro: lecture.intro || '',
      category: item.category || '',
      subCategory: item.subCategory || '',
      confidence: typeof item.confidence === 'number' ? item.confidence : 0,
      reason: item.reason || '',
      valid,
    };
  });
}

module.exports = { classifyLectures, CATEGORY_TREE };
