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

    // --- REDIS LIST & QUEUE OPERATIONS ---
    async rpush(key, value) {
        if (!key) return 0;
        const normalizedKey = key.toString();
        const serialized = (typeof value === 'object') ? JSON.stringify(value) : String(value);

        if (!this.memoryStore.has(normalizedKey) || !Array.isArray(this.memoryStore.get(normalizedKey))) {
            this.memoryStore.set(normalizedKey, []);
        }
        const arr = this.memoryStore.get(normalizedKey);
        arr.push(typeof value === 'object' ? value : serialized);

        if (this.isConnected && this.client) {
            try {
                return await this.client.rpush(normalizedKey, serialized);
            } catch (err) {
                this.stats.errors++;
            }
        }
        return arr.length;
    }

    async lpop(key) {
        if (!key) return null;
        const normalizedKey = key.toString();

        let inMemItem = null;
        if (this.memoryStore.has(normalizedKey) && Array.isArray(this.memoryStore.get(normalizedKey))) {
            const arr = this.memoryStore.get(normalizedKey);
            if (arr.length > 0) inMemItem = arr.shift();
        }

        if (this.isConnected && this.client) {
            try {
                const raw = await this.client.lpop(normalizedKey);
                if (raw !== null && raw !== undefined) {
                    try { return JSON.parse(raw); } catch (e) { return raw; }
                }
            } catch (err) {
                this.stats.errors++;
            }
        }
        return inMemItem;
    }

    async llen(key) {
        if (!key) return 0;
        const normalizedKey = key.toString();

        if (this.isConnected && this.client) {
            try {
                return await this.client.llen(normalizedKey);
            } catch (err) {
                this.stats.errors++;
            }
        }

        if (this.memoryStore.has(normalizedKey) && Array.isArray(this.memoryStore.get(normalizedKey))) {
            return this.memoryStore.get(normalizedKey).length;
        }
        return 0;
    }

    async lrange(key, start = 0, stop = -1) {
        if (!key) return [];
        const normalizedKey = key.toString();

        if (this.isConnected && this.client) {
            try {
                const list = await this.client.lrange(normalizedKey, start, stop);
                return (list || []).map(item => {
                    try { return JSON.parse(item); } catch (e) { return item; }
                });
            } catch (err) {
                this.stats.errors++;
            }
        }

        if (this.memoryStore.has(normalizedKey) && Array.isArray(this.memoryStore.get(normalizedKey))) {
            const arr = this.memoryStore.get(normalizedKey);
            const endIdx = stop === -1 ? arr.length : stop + 1;
            return arr.slice(start, endIdx);
        }
        return [];
    }

    async incr(key, ttlSeconds = 0) {
        if (!key) return 1;
        const normalizedKey = key.toString();

        let curr = (this.memoryStore.get(normalizedKey) || 0);
        curr = Number(curr) + 1;
        this.memoryStore.set(normalizedKey, curr);
        if (ttlSeconds > 0) {
            this.memoryExpiry.set(normalizedKey, Date.now() + (ttlSeconds * 1000));
        }

        if (this.isConnected && this.client) {
            try {
                const val = await this.client.incr(normalizedKey);
                if (ttlSeconds > 0) await this.client.expire(normalizedKey, ttlSeconds);
                return val;
            } catch (err) {
                this.stats.errors++;
            }
        }
        return curr;
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

/**
 * ========================================================================================
 *   ⚡ ENTERPRISE REDIS SANDBOX QUEUE & CONCURRENCY MANAGER
 * ========================================================================================
 *   Serializes and queues execution jobs through Redis FIFO queue with concurrency limits.
 *   Guards server memory and CPU during heavy interactive data analytics & ML workloads.
 * ========================================================================================
 */
class SandboxRedisQueueManager {
    constructor(redisManager, maxConcurrency = 4) {
        this.redis = redisManager;
        this.maxConcurrency = maxConcurrency;
        this.activeWorkers = 0;
        this.waitingQueue = [];
        this.queueKey = 'mospi:sandbox:queue:jobs';
        this.statsKey = 'mospi:sandbox:stats';
    }

    async enqueueAndExecute(jobPayload, executorFn) {
        const jobId = `sbx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const enqueuedAt = Date.now();
        const jobMeta = {
            job_id: jobId,
            language: jobPayload.language || 'python',
            queued_at: new Date(enqueuedAt).toISOString(),
            status: 'queued'
        };

        // 1. Enqueue job into Redis Queue and increment telemetry
        await this.redis.rpush(this.queueKey, jobMeta);
        await this.redis.incr('mospi:sandbox:stats:total_queued');
        await this.redis.set(`mospi:sandbox:job:${jobId}`, jobMeta, 3600);

        // 2. Wait for concurrency slot in execution worker pool
        const queueWaitStart = Date.now();
        await this._acquireSlot();
        const queueWaitMs = Date.now() - queueWaitStart;

        try {
            // 3. Update status to running in Redis
            jobMeta.status = 'running';
            jobMeta.started_at = new Date().toISOString();
            jobMeta.queue_wait_ms = queueWaitMs;
            await this.redis.set(`mospi:sandbox:job:${jobId}`, jobMeta, 3600);

            // 4. Run execution callback
            const result = await executorFn();

            // 5. Update status to completed in Redis
            jobMeta.status = 'completed';
            jobMeta.completed_at = new Date().toISOString();
            jobMeta.exec_duration_ms = Date.now() - (enqueuedAt + queueWaitMs);
            jobMeta.total_duration_ms = Date.now() - enqueuedAt;
            await this.redis.set(`mospi:sandbox:job:${jobId}`, jobMeta, 3600);
            await this.redis.incr('mospi:sandbox:stats:total_completed');

            return {
                ...result,
                queue_info: {
                    job_id: jobId,
                    queued_in_redis: true,
                    queue_wait_ms: queueWaitMs,
                    active_concurrency: this.activeWorkers,
                    status: 'COMPLETED_VIA_REDIS_QUEUE'
                }
            };
        } catch (error) {
            jobMeta.status = 'failed';
            jobMeta.error = error.message;
            await this.redis.set(`mospi:sandbox:job:${jobId}`, jobMeta, 3600);
            throw error;
        } finally {
            // 6. Dequeue job from Redis and release concurrency worker slot
            await this.redis.lpop(this.queueKey);
            this._releaseSlot();
        }
    }

    _acquireSlot() {
        if (this.activeWorkers < this.maxConcurrency) {
            this.activeWorkers++;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this.waitingQueue.push(resolve);
        });
    }

    _releaseSlot() {
        this.activeWorkers--;
        if (this.waitingQueue.length > 0) {
            this.activeWorkers++;
            const next = this.waitingQueue.shift();
            next();
        }
    }

    async getQueueStatus() {
        const queueLen = await this.redis.llen(this.queueKey);
        const totalQueued = await this.redis.get('mospi:sandbox:stats:total_queued') || 0;
        const totalCompleted = await this.redis.get('mospi:sandbox:stats:total_completed') || 0;
        const pendingJobs = await this.redis.lrange(this.queueKey, 0, 5);

        return {
            active_workers: this.activeWorkers,
            max_concurrency: this.maxConcurrency,
            pending_in_queue: queueLen || this.waitingQueue.length,
            total_jobs_queued: Number(totalQueued),
            total_jobs_completed: Number(totalCompleted),
            pending_jobs: pendingJobs,
            engine: this.redis.isConnected ? 'REDIS_DISTRIBUTED_QUEUE' : 'IN_MEMORY_MANAGED_QUEUE'
        };
    }
}

const redisCache = new RedisCacheManager();
const sandboxQueue = new SandboxRedisQueueManager(redisCache, 4);

module.exports = { redisCache, RedisCacheManager, sandboxQueue, SandboxRedisQueueManager };

