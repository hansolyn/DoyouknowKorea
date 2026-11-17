import { Redis } from "@upstash/redis";
import { handleScore } from "../lib/score-core.js";

let redis;
export default async function handler(req, res) {
  try {
    if (!redis) redis = Redis.fromEnv(); // UPSTASH_REDIS_REST_* 또는 KV_REST_API_* 자동 인식
    return await handleScore(req, res, redis);
  } catch (e) {
    // 저장소 미연결/장애 시에도 게임은 기준표로 계속 동작한다
    return res.status(503).json({ ok: false });
  }
}
