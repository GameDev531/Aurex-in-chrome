export class WorkflowRecorder {
  static isRecording = false;
  static currentWorkflow = [];
  static activeTabId = null;

  static async startRecording(tabId) {
    this.isRecording = true;
    this.currentWorkflow = [];
    this.activeTabId = tabId;
    
    console.log("[Aurex Recorder] Iniciando gravação...");

    // Injeta script espião na aba para capturar cliques e inputs humanos
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        window.__aurexRecorderActive = true;
        
        // Helper para gerar um CSS Path razoavelmente único
        function getCssPath(el) {
          if (!(el instanceof Element)) return;
          var path = [];
          while (el.nodeType === Node.ELEMENT_NODE) {
            var selector = el.nodeName.toLowerCase();
            if (el.id) {
              selector += '#' + el.id;
              path.unshift(selector);
              break;
            } else {
              var sib = el, nth = 1;
              while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() == selector) nth++;
              }
              if (nth != 1) selector += ":nth-of-type("+nth+")";
            }
            path.unshift(selector);
            el = el.parentNode;
          }
          return path.join(" > ");
        }

        document.addEventListener('click', (e) => {
          if (!window.__aurexRecorderActive) return;
          const selector = getCssPath(e.target);
          chrome.runtime.sendMessage({
            type: "recorder_event",
            event: { type: "click", selector: selector, timestamp: Date.now() }
          });
        }, true);

        document.addEventListener('change', (e) => {
          if (!window.__aurexRecorderActive) return;
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const selector = getCssPath(e.target);
            chrome.runtime.sendMessage({
              type: "recorder_event",
              event: { type: "type", selector: selector, value: e.target.value, timestamp: Date.now() }
            });
          }
        }, true);
      }
    });
  }

  static async stopRecording() {
    this.isRecording = false;
    if (this.activeTabId) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: this.activeTabId },
          func: () => { window.__aurexRecorderActive = false; }
        });
      } catch (e) { /* Tab might be closed */ }
    }
    console.log("[Aurex Recorder] Gravação parada. Total de passos:", this.currentWorkflow.length);
    return this.currentWorkflow;
  }

  static recordEvent(event) {
    if (this.isRecording) {
      this.currentWorkflow.push(event);
      console.log("[Aurex Recorder] Passo salvo:", event);
    }
  }

  static async saveWorkflow(name) {
    const workflow = [...this.currentWorkflow];
    return new Promise((resolve) => {
      chrome.storage.local.get(['aurex_workflows'], (result) => {
        const workflows = result.aurex_workflows || {};
        workflows[name] = workflow;
        chrome.storage.local.set({ aurex_workflows: workflows }, resolve);
      });
    });
  }

  // O Replay vai usar o Runtime.evaluate no background.js para executar os cliques baseados no seletor,
  // pois não temos o AXNode ID mapeado diretamente na gravação do DOM.
}
