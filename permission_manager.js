export class PermissionManager {
  static _memoryFallback = [];

  static async getAllowlist() {
    return new Promise((resolve) => {
      if (chrome.storage.session) {
        chrome.storage.session.get(['aurex_allowed_origins'], (result) => {
          resolve(result.aurex_allowed_origins || []);
        });
      } else {
        resolve(this._memoryFallback);
      }
    });
  }

  static async checkPermission(origin) {
    if (!origin || origin === 'null') return true; // Local files or extensions might have null origin
    const allowlist = await this.getAllowlist();
    return allowlist.includes(origin);
  }

  static async grantPermission(origin) {
    if (!origin || origin === 'null') return;
    const allowlist = await this.getAllowlist();
    if (!allowlist.includes(origin)) {
      allowlist.push(origin);
      if (chrome.storage.session) {
        return new Promise((resolve) => {
          chrome.storage.session.set({ aurex_allowed_origins: allowlist }, resolve);
        });
      } else {
        this._memoryFallback = allowlist;
      }
    }
  }

  static async revokePermission(origin) {
    const allowlist = await this.getAllowlist();
    const newList = allowlist.filter(o => o !== origin);
    if (chrome.storage.session) {
      return new Promise((resolve) => {
        chrome.storage.session.set({ aurex_allowed_origins: newList }, resolve);
      });
    } else {
      this._memoryFallback = newList;
    }
  }

  static pendingResolvers = {};

  // Intercepta a chamada no background e avisa o popup caso não tenha permissão
  static async requirePermission(tabId, origin) {
    const hasPerm = await this.checkPermission(origin);
    if (hasPerm) return true;

    // SECURITY FIX: Token imprevisível
    const token = crypto.randomUUID();

    console.warn(`[Aurex PermissionManager] Acesso pausado para a origem: ${origin}. Aguardando aprovação do usuário...`);
    
    // Pausa a execução do agente retornando uma Promise que só resolve quando o usuário clicar
    return new Promise((resolve) => {
      this.pendingResolvers[origin] = {
        resolve: resolve,
        token: token
      };

      // Registra o pending request antes de expor a aprovação ao popup.
      chrome.runtime.sendMessage({
        type: "permission_required",
        origin: origin,
        tabId: tabId,
        token: token
      });
    });
  }

  static resolvePending(origin, granted = true) {
    if (this.pendingResolvers[origin]) {
      this.pendingResolvers[origin].resolve(granted);
      delete this.pendingResolvers[origin];
    }
  }
}
