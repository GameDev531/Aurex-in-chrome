const ALLOWLIST_KEY = 'aurex_allowed_origins';
const PENDING_KEY = 'aurex_pending_permissions';

// Pedidos de permissão expiram para não deixar tokens válidos para sempre
// caso o usuário nunca responda e volte ao site horas depois.
const PENDING_TTL_MS = 30 * 60 * 1000;

export class PermissionManager {
  static _memoryAllowlist = [];
  static _memoryPending = {};

  static _hasSessionStorage() {
    return !!(chrome.storage && chrome.storage.session);
  }

  static _sessionGet(key, fallback) {
    return new Promise((resolve) => {
      chrome.storage.session.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[Aurex PermissionManager] Falha ao ler storage.session:', chrome.runtime.lastError.message);
          resolve(fallback);
          return;
        }
        resolve(result[key] === undefined ? fallback : result[key]);
      });
    });
  }

  static _sessionSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.session.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Aurex PermissionManager] Falha ao gravar storage.session:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  }

  // ---------- Allowlist de origens aprovadas ----------

  static async getAllowlist() {
    if (!this._hasSessionStorage()) return this._memoryAllowlist.slice();
    const list = await this._sessionGet(ALLOWLIST_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  static async checkPermission(origin) {
    // Páginas locais (file://) e páginas internas reportam origin "null":
    // não há origem para aprovar, então não bloqueamos.
    if (!origin || origin === 'null') return true;
    const allowlist = await this.getAllowlist();
    return allowlist.includes(origin);
  }

  static async grantPermission(origin) {
    if (!origin || origin === 'null') return;
    const allowlist = await this.getAllowlist();
    if (allowlist.includes(origin)) return;
    allowlist.push(origin);
    if (this._hasSessionStorage()) {
      await this._sessionSet(ALLOWLIST_KEY, allowlist);
    } else {
      this._memoryAllowlist = allowlist;
    }
  }

  static async revokePermission(origin) {
    const allowlist = await this.getAllowlist();
    const newList = allowlist.filter((o) => o !== origin);
    if (this._hasSessionStorage()) {
      await this._sessionSet(ALLOWLIST_KEY, newList);
    } else {
      this._memoryAllowlist = newList;
    }
  }

  // ---------- Pedidos pendentes ----------
  //
  // Ficam em storage.session (e não em memória) porque o service worker do
  // Manifest V3 é encerrado após alguns segundos de ociosidade. Se o token
  // vivesse só na memória, ele sumiria enquanto o usuário lê o pedido e o
  // clique em "Permitir acesso" seria rejeitado como tentativa de forja.

  static async _getPendingMap() {
    if (!this._hasSessionStorage()) return Object.assign({}, this._memoryPending);
    const map = await this._sessionGet(PENDING_KEY, {});
    return map && typeof map === 'object' ? map : {};
  }

  static async _setPendingMap(map) {
    if (this._hasSessionStorage()) {
      await this._sessionSet(PENDING_KEY, map);
    } else {
      this._memoryPending = map;
    }
  }

  static _dropExpired(map) {
    const now = Date.now();
    let changed = false;
    for (const origin of Object.keys(map)) {
      const entry = map[origin];
      if (!entry || typeof entry.createdAt !== 'number' || now - entry.createdAt > PENDING_TTL_MS) {
        delete map[origin];
        changed = true;
      }
    }
    return changed;
  }

  // Cria (ou reaproveita) o pedido pendente de uma origem e devolve o token.
  // Reaproveitar é importante: quando o modelo dispara várias ferramentas para
  // o mesmo site, um token novo invalidaria o widget já exibido na tela.
  static async createPendingRequest(origin) {
    const map = await this._getPendingMap();
    const expired = this._dropExpired(map);

    const existing = map[origin];
    if (existing && existing.token) {
      if (expired) await this._setPendingMap(map);
      return existing.token;
    }

    const token = crypto.randomUUID();
    map[origin] = { token, createdAt: Date.now() };
    await this._setPendingMap(map);
    return token;
  }

  // Valida e consome o pedido. Retorna { ok, reason } para o chamador poder
  // distinguir "não existe pedido" de "token inválido".
  static async consumePendingRequest(origin, token) {
    const map = await this._getPendingMap();
    this._dropExpired(map);

    const entry = map[origin];
    if (!entry) {
      await this._setPendingMap(map);
      return { ok: false, reason: 'no_pending' };
    }
    if (entry.token !== token) {
      return { ok: false, reason: 'bad_token' };
    }

    delete map[origin];
    await this._setPendingMap(map);
    return { ok: true };
  }
}
