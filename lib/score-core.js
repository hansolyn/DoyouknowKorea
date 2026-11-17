// 익명 점수 수집 로직 (저장소 객체는 주입받아 테스트 가능)
import { createHash } from "node:crypto";

// 스테이지별 구역 수 (일반 모드 기준 채점 대상 수)
export const STAGES = { sudo: 33, gangwon: 18, chung: 28, honam: 39, yeong: 43, all: 161 };
const RL_MAX = 30;      // IP당 10분에 30건
const RL_WINDOW = 600;  // 초

function isInt(v, min, max) { return Number.isInteger(v) && v >= min && v <= max; }

export function validate(b) {
  if (!b || typeof b !== "object") return null;
  const N = STAGES[b.stage];
  if (!N) return null;
  if (b.n !== N) return null;                       // 일반 모드는 전 구역이 채점 대상
  if (!isInt(b.c, 0, N)) return null;               // 정답 수
  if (!isInt(b.pen, 0, 10 * N)) return null;        // 힌트 감점
  if (!isInt(b.hints, 0, 1000)) return null;
  if (!isInt(b.secs, 0, 86400)) return null;
  if (b.secs < Math.max(10, Math.floor(b.c * 0.7))) return null; // 사람이 불가능한 속도 제외
  const p = Math.round(Math.max(0, b.c * 10 - b.pen) / (N * 10) * 100);
  return { stage: b.stage, p };
}

function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(xf) ? xf[0] : xf || "").split(",")[0].trim() || req.headers["x-real-ip"] || "unknown";
  return createHash("sha256").update(String(ip)).digest("hex").slice(0, 24); // 원본 IP는 저장하지 않음
}

function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return false;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

export async function handleScore(req, res, redis) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false }); }
  if (!sameOrigin(req)) return res.status(403).json({ ok: false });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const rec = validate(body);
  if (!rec) return res.status(400).json({ ok: false });

  const rk = "pn:rl:" + clientIp(req);
  const cnt = await redis.incr(rk);
  if (cnt === 1) await redis.expire(rk, RL_WINDOW);
  if (cnt > RL_MAX) return res.status(429).json({ ok: false });

  const hk = "pn:h:" + rec.stage;
  await redis.hincrby(hk, String(rec.p), 1);
  const h = (await redis.hgetall(hk)) || {};
  let total = 0, better = 0;
  for (const k of Object.keys(h)) {
    const n = Number(h[k]) || 0;
    total += n;
    if (Number(k) > rec.p) better += n;
  }
  return res.status(200).json({ ok: true, total, better });
}
