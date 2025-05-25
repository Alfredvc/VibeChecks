import * as fs from 'fs';
import * as path from 'path';

export class Cache<T = any> {
    private cache: Map<string, T> = new Map();
    private cacheFilePath: string;

    constructor(cacheFilePath: string) {
        this.cacheFilePath = cacheFilePath;
        this.loadFromDisk();
    }

    private loadFromDisk() {
        try {
            if (this.cacheFilePath && fs.existsSync(this.cacheFilePath)) {
                const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
                const obj = JSON.parse(raw);
                this.cache = new Map(Object.entries(obj));
            }
        } catch (e) {
            // Optionally log error
        }
    }

    private saveToDisk() {
        try {
            if (this.cacheFilePath) {
                const obj = Object.fromEntries(this.cache.entries());
                fs.mkdirSync(path.dirname(this.cacheFilePath), { recursive: true });
                fs.writeFileSync(this.cacheFilePath, JSON.stringify(obj), 'utf-8');
            }
        } catch (e) {
            // Optionally log error
        }
    }

    get(key: string): T | undefined {
        return this.cache.get(key);
    }

    set(key: string, value: T) {
        this.cache.set(key, value);
        this.saveToDisk();
    }

    clear() {
        this.cache.clear();
        this.saveToDisk();
    }

    deleteFile() {
        if (this.cacheFilePath && fs.existsSync(this.cacheFilePath)) {
            try {
                fs.unlinkSync(this.cacheFilePath);
            } catch (e) {
                // Optionally log error
            }
        }
    }
}
