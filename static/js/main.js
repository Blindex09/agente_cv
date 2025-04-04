// main.js - Arquivo principal que carrega os módulos e inicializa o aplicativo

// Função para carregar script de forma assíncrona
function carregarScript(url, callback) {
    const script = document.createElement('script');
    script.src = url;
    
    // Configurar callback para quando o script terminar de carregar
    if (callback) {
        script.onload = callback;
    }
    
    // Adicionar script ao documento
    document.head.appendChild(script);
    console.log(`Carregando: ${url}`);
}

// Controle de dependências carregadas
let modulosCarregados = {
    formatters: false,
    core: false,
    api: false
};

// Verificar se todos módulos estão carregados e inicializar app
function verificarInicializacao() {
    if (modulosCarregados.formatters && modulosCarregados.core && modulosCarregados.api) {
        console.log("Todos os módulos carregados - Sistema pronto!");
        const evento = new CustomEvent('app:pronto');
        document.dispatchEvent(evento);
        
        // Inicializar estado da UI após todos os módulos carregados
        if (window.renderizarListaArquivos) {
            window.renderizarListaArquivos();
            window.btnProcessar.disabled = true;
            window.btnEnviarChat.disabled = true;
            window.chatInput.disabled = true;
            window.chatInput.placeholder = "Analise arquivos para habilitar o chat...";
        }
    }
}

// Registrar eventos de carregamento dos módulos
document.addEventListener('formatters-loaded', function() {
    modulosCarregados.formatters = true;
    console.log("✓ Módulo Formatters inicializado");
    verificarInicializacao();
});

document.addEventListener('core-loaded', function() {
    modulosCarregados.core = true;
    console.log("✓ Módulo Core inicializado");
    verificarInicializacao();
});

document.addEventListener('api-loaded', function() {
    modulosCarregados.api = true;
    console.log("✓ Módulo API inicializado");
    verificarInicializacao();
});

// Tratamento de erros nos módulos
window.addEventListener('error', function(e) {
    console.error('Erro ao carregar módulo:', e);
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-banner';
    errorMsg.innerHTML = `
        <strong>Erro ao inicializar aplicativo</strong>
        <p>Ocorreu um erro ao carregar os componentes necessários. Por favor, recarregue a página.</p>
        <button onclick="window.location.reload()">Recarregar</button>
    `;
    document.body.prepend(errorMsg);
});

// Inicialização da aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    console.log("Inicializando Assistente de Currículos (2025) - v3: DB + Feedback Melhorado");
    
    // Verificar navegadores não suportados
    const navegadorAntigo = !window.EventSource || !window.fetch || !window.Promise;
    if (navegadorAntigo) {
        alert("Seu navegador parece desatualizado e pode não suportar todos os recursos necessários. Recomendamos usar Chrome, Firefox, Safari ou Edge atualizados.");
    }
    
    // Implementar timeout para detecção de problemas de carregamento
    const timeoutCarregamento = setTimeout(function() {
        if (!modulosCarregados.formatters || !modulosCarregados.core || !modulosCarregados.api) {
            console.warn("Timeout de carregamento - Nem todos os módulos foram inicializados!");
            const warningMsg = document.createElement('div');
            warningMsg.className = 'warning-banner';
            warningMsg.innerHTML = `
                <strong>Carregamento incompleto</strong>
                <p>Alguns componentes não foram carregados corretamente. O aplicativo pode não funcionar como esperado.</p>
                <button onclick="window.location.reload()">Tentar novamente</button>
            `;
            document.body.prepend(warningMsg);
        }
    }, 10000); // 10 segundos de timeout
    
    // Adicionar evento para limpar timeout quando app estiver pronto
    document.addEventListener('app:pronto', function() {
        clearTimeout(timeoutCarregamento);
    });
    
    // Carregar módulos na ordem correta com tratamento de falhas
    carregarScript('/static/js/ui-formatters.js', function() {
        // Formatters carregado, agora carrega Core
        carregarScript('/static/js/ui-core.js', function() {
            // Core carregado, agora carrega API
            carregarScript('/static/js/api-services.js');
        });
    });
    
    // Detectar se o usuário está offline
    window.addEventListener('offline', function() {
        const offlineMsg = document.createElement('div');
        offlineMsg.id = 'offline-message';
        offlineMsg.textContent = 'Você está offline. Algumas funcionalidades podem não estar disponíveis.';
        document.body.prepend(offlineMsg);
    });
    
    // Remover mensagem offline quando voltar online
    window.addEventListener('online', function() {
        const offlineMsg = document.getElementById('offline-message');
        if (offlineMsg) {
            offlineMsg.remove();
        }
    });
    
    // Verificar se já está offline no carregamento inicial
    if (!navigator.onLine) {
        const offlineMsg = document.createElement('div');
        offlineMsg.id = 'offline-message';
        offlineMsg.textContent = 'Você está offline. Algumas funcionalidades podem não estar disponíveis.';
        document.body.prepend(offlineMsg);
    }
    
    // Exibir versão do aplicativo no console
    console.log("Versão: 3.2.0 - Estrutura Modular");
    console.log("© 2025 - Assistente de Análise de Currículos");
});

// Função global para reiniciar aplicativo
window.reiniciarApp = function() {
    location.reload();
};

// Detectar problemas e oferecer ajuda
window.addEventListener('unhandledrejection', function(e) {
    console.error('Promessa não tratada:', e);
    // Evita mostrar múltiplos alertas de erro
    if (!document.querySelector('.error-banner')) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-banner';
        errorMsg.innerHTML = `
            <strong>Ocorreu um erro inesperado</strong>
            <p>Alguns recursos podem não funcionar corretamente.</p>
            <button onclick="window.reiniciarApp()">Reiniciar aplicativo</button>
        `;
        document.body.prepend(errorMsg);
    }
});