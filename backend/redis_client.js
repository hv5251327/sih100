/**
 * ========================================================================================
 *   MINISTRY OF STATISTICS AND PROGRAMME IMPLEMENTATION (MoSPI)
 *   ENTERPRISE REDIS CACHE ENGINE & ZERO-LATENCY DATA STORE
 * ========================================================================================
 *   Provides ultra-fast caching for:
 *   - Baseline and Course Assessment Quizzes (`mospi:quiz:*`)
 *   - Grok-powered Officer Competency Evaluations (`mospi:officer:competency:*`)
 *   - Course Catalogs & Officer Learning Roadmaps (`mospi:officer:roadmap:*`)
 *   - API Metadata & Reference Tables
 *   Seamlessly falls back to High-Speed In-Memory Cache if remote Redis is unavailable.
 * ========================================================================================
 */

let Redis;
try {
    Redis = require('ioredis');
} catch (e) {
    Redis = null;
}

class RedisCacheManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.memoryStore = new Map();
        this.memoryExpiry = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            errors: 0
        };
        this.init();
    }

    init() {
        const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL || process.env.UPSTASH_REDIS_URL;
        const redisHost = process.env.REDIS_HOST || '127.0.0.1';
        const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
        const redisPassword = process.env.REDIS_PASSWORD || undefined;

        if (!Redis) {
            console.info('ℹ️ [Redis] ioredis module not loaded — Using High-Speed In-Memory L1 Cache Engine');
            return;
        }

        try {
            if (redisUrl) {
                this.client = new Redis(redisUrl, {
                    maxRetriesPerRequest: 2,
                    connectTimeout: 3500,
                    lazyConnect: true,
                    retryStrategy(times) {
                        if (times > 3) return null;
                        return Math.min(times * 1000, 3000);
                    }
                });
            } else if (process.env.REDIS_HOST || process.env.REDIS_ENABLED === 'true') {
                this.client = new Redis({
                    host: redisHost,
                    port: redisPort,
                    password: redisPassword,
                    maxRetriesPerRequest: 2,
                    connectTimeout: 3500,
                    lazyConnect: true,
                    retryStrategy(times) {
                        if (times > 3) return null;
                        return Math.min(times * 1000, 3000);
                    }
                });
            }

            if (this.client) {
                this.client.connect().then(() => {
                    this.isConnected = true;
                    console.log('⚡ [Redis] Connected successfully to Redis Cache Engine');
                }).catch((err) => {
                    this.isConnected = false;
                    console.info('ℹ️ [Redis] Remote instance note (' + err.message + ') — Using High-Speed In-Memory & Disk L1 Cache Engine');
                });

                this.client.on('error', (err) => {
                    this.isConnected = false;
                    this.stats.errors++;
                });

                this.client.on('connect', () => {
                    this.isConnected = true;
                    console.log('⚡ [Redis] Connection established');
                });

                this.client.on('close', () => {
                    this.isConnected = false;
                });
            } else {
                console.info('ℹ️ [Redis] Running in High-Speed In-Memory L1 Cache Engine mode');
            }
        } catch (e) {
            console.warn('[Redis] Initialization note:', e.message);
        }
    }

    async get(key) {
        if (!key) return null;
        const normalizedKey = key.toString();

        // 1. Try Redis Client
        if (this.isConnected && this.client) {
            try {
                const raw = await this.client.get(normalizedKey);
                if (raw !== null && raw !== undefined) {
                    this.stats.hits++;
                    try {
                        return JSON.parse(raw);
                    } catch (e) {
                        return raw;
                    }
                }
            } catch (err) {
                this.stats.errors++;
            }
        }

        // 2. High-speed In-Memory L1 fallback
        const now = Date.now();
        if (this.memoryStore.has(normalizedKey)) {
            const exp = this.memoryExpiry.get(normalizedKey);
            if (!exp || exp > now) {
                this.stats.hits++;
                return this.memoryStore.get(normalizedKey);
            } else {
                this.memoryStore.delete(normalizedKey);
                this.memoryExpiry.delete(normalizedKey);
            }
        }

        this.stats.misses++;
        return null;
    }

    async set(key, value, ttlSeconds = 86400) {
        if (!key) return false;
        const normalizedKey = key.toString();
        this.stats.sets++;

        // Store in Memory L1 Store
        this.memoryStore.set(normalizedKey, value);
        if (ttlSeconds > 0) {
            this.memoryExpiry.set(normalizedKey, Date.now() + (ttlSeconds * 1000));
        }

        // Store in Redis Client
        if (this.isConnected && this.client) {
            try {
                const serialized = (typeof value === 'object') ? JSON.stringify(value) : String(value);
                if (ttlSeconds > 0) {
                    await this.client.set(normalizedKey, serialized, 'EX', ttlSeconds);
                } else {
                    await this.client.set(normalizedKey, serialized);
                }
                return true;
            } catch (err) {
                this.stats.errors++;
            }
        }
        return true;
    }

    async del(key) {
        if (!key) return false;
        const normalizedKey = key.toString();
        this.memoryStore.delete(normalizedKey);
        this.memoryExpiry.delete(normalizedKey);

        if (this.isConnected && this.client) {
            try {
                await this.client.del(normalizedKey);
            } catch (err) {}
        }
        return true;
    }

    async flushPattern(pattern) {
        if (!pattern) return;
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const k of this.memoryStore.keys()) {
            if (regex.test(k)) {
                this.memoryStore.delete(k);
                this.memoryExpiry.delete(k);
            }
        }

        if (this.isConnected && this.client) {
            try {
                const keys = await this.client.keys(pattern);
                if (keys && keys.length > 0) {
                    await this.client.del(...keys);
                }
            } catch (err) {}
        }
    }

    getStatus() {
        return {
            connected: this.isConnected,
            type: this.isConnected ? 'REDIS_REMOTE_INSTANCE' : 'IN_MEMORY_L1_FAST_CACHE',
            memory_keys_count: this.memoryStore.size,
            stats: this.stats
        };
    }
}

const redisCache = new RedisCacheManager();
module.exports = { redisCache, RedisCacheManager };
