// ui-core.js - Componentes principais da UI e gerenciamento de elementos

// --- Referências e Variáveis Globais ---
const arquivoInput = document.getElementById('arquivoInput') || null;
const btnProcessar = document.getElementById('btnProcessar') || null;
const statusDiv = document.getElementById('status') || null;
const chkGerarRelatorio = document.getElementById('chkGerarRelatorio') || null;
const chkPesquisarWeb = document.getElementById('chkPesquisarWeb') || null;
const filePreviewList = document.getElementById('file-preview-list') || null;
const chatMessages = document.getElementById('chat-messages') || null;
const chatInput = document.getElementById('chat-input') || null;
const btnEnviarChat = document.getElementById('btnEnviarChat') || null;

let arquivosParaEnviar = [];

window.arquivoInput = arquivoInput;
window.btnProcessar = btnProcessar;
window.statusDiv = statusDiv;
window.chkGerarRelatorio = chkGerarRelatorio;
window.chkPesquisarWeb = chkPesquisarWeb;
window.filePreviewList = filePreviewList;
window.chatMessages = chatMessages;
window.chatInput = chatInput;
window.btnEnviarChat = btnEnviarChat;
window.arquivosParaEnviar = arquivosParaEnviar;

// --- Funções Auxiliares ---
function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const index = Math.min(i, sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

// --- Renderiza lista de arquivos ---
function renderizarListaArquivos() {
    if (!filePreviewList) return;
    filePreviewList.innerHTML = '';
    if (arquivosParaEnviar.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-message';
        li.textContent = 'Nenhum arquivo selecionado ou colado.';
        filePreviewList.appendChild(li);
        if (btnProcessar) btnProcessar.disabled = true;
        return;
    }
    arquivosParaEnviar.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        const fileInfoSpan = document.createElement('span');
        fileInfoSpan.className = 'file-info';
        fileInfoSpan.textContent = `${file.name} `;
        fileInfoSpan.title = `${file.name} (${formatBytes(file.size)})`;
        const fileSizeSpan = document.createElement('span');
        fileSizeSpan.className = 'file-size';
        fileSizeSpan.textContent = `(${formatBytes(file.size)})`;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remover';
        removeBtn.type = 'button';
        removeBtn.dataset.index = index;
        removeBtn.disabled = typeof window.isProcessing === 'function' && window.isProcessing();
        removeBtn.addEventListener('click', (e) => {
            if (typeof window.isProcessing === 'function' && window.isProcessing()) return;
            const iToRemove = parseInt(e.target.dataset.index, 10);
            if (!isNaN(iToRemove)) {
                arquivosParaEnviar.splice(iToRemove, 1);
                renderizarListaArquivos();
            }
            if (arquivosParaEnviar.length === 0 && arquivoInput) {
                arquivoInput.value = null;
            }
        });
        li.appendChild(fileInfoSpan);
        li.appendChild(fileSizeSpan);
        li.appendChild(removeBtn);
        filePreviewList.appendChild(li);
    });
    if (btnProcessar) {
         btnProcessar.disabled = typeof window.isProcessing === 'function' && window.isProcessing();
    }
}

// --- Eventos ---
if (arquivoInput) {
    arquivoInput.addEventListener('change', (event) => {
        const novosArquivos = Array.from(event.target.files || []);
        arquivosParaEnviar = arquivosParaEnviar.concat(novosArquivos);
        renderizarListaArquivos();
        event.target.value = null;
        if (typeof window.adicionarMensagemChat === 'function' && novosArquivos.length > 0) {
            window.adicionarMensagemChat("Sistema", `${novosArquivos.length} arquivo(s) adicionado(s) à fila via seleção.`, 'system-message info');
        }
    });
}

if (btnProcessar) {
    btnProcessar.addEventListener('click', () => {
        const initialInstruction = chatInput ? chatInput.value.trim() : '';
        if (typeof window.processarArquivos === 'function') {
            window.processarArquivos(arquivosParaEnviar, initialInstruction);
        } else {
            console.error("Função processarArquivos não disponível.");
            if (typeof window.adicionarMensagemStatus === 'function') {
                 window.adicionarMensagemStatus("Erro interno ao iniciar processamento.", "error");
            }
        }
    });
}

if (btnEnviarChat && chatInput) {
    btnEnviarChat.addEventListener('click', () => {
        if (typeof window.enviarMensagemChat === 'function') {
            window.enviarMensagemChat();
        } else {
            console.error("Função enviarMensagemChat não disponível.");
             if (typeof window.adicionarMensagemChat === 'function') {
                 window.adicionarMensagemChat("Sistema", "Erro interno ao enviar mensagem.", "system-message error");
             }
        }
    });
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
             if (typeof window.enviarMensagemChat === 'function') {
                 window.enviarMensagemChat();
             } else {
                 console.error("Função enviarMensagemChat não disponível.");
                 if (typeof window.adicionarMensagemChat === 'function') {
                    window.adicionarMensagemChat("Sistema", "Erro interno ao enviar mensagem.", "system-message error");
                 }
             }
        }
    });
    chatInput.addEventListener('paste', (event) => {
        const pastedFiles = Array.from(event.clipboardData?.files || []);
        if (pastedFiles.length > 0) {
            event.preventDefault();
            const extensoesPermitidas = /(\.pdf|\.docx|\.zip)$/i;
            const arquivosValidos = pastedFiles.filter(f => extensoesPermitidas.test(f.name));
            const arquivosInvalidosCount = pastedFiles.length - arquivosValidos.length;
            if (arquivosValidos.length > 0) {
                arquivosParaEnviar = arquivosParaEnviar.concat(arquivosValidos);
                renderizarListaArquivos();
                let feedbackMsg = `${arquivosValidos.length} arquivo(s) colado(s) e adicionado(s) à fila.`;
                if (arquivosInvalidosCount > 0) {
                    feedbackMsg += ` ${arquivosInvalidosCount} arquivo(s) foram ignorados (tipo inválido).`;
                }
                if (typeof window.adicionarMensagemChat === 'function') {
                    window.adicionarMensagemChat("Sistema", feedbackMsg, 'system-message info');
                }
            } else if (arquivosInvalidosCount > 0) {
                 if (typeof window.adicionarMensagemChat === 'function') {
                    window.adicionarMensagemChat("Sistema", `${arquivosInvalidosCount} arquivo(s) colado(s) ignorados (tipo inválido).`, 'system-message warning');
                 }
            }
            chatInput.value = '';
        }
    });
}

// --- Melhorias de UX (Drag and Drop) ---
let dragCounter = 0;
document.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; document.body.classList.add('dragging'); });
document.addEventListener('dragleave', (e) => { e.preventDefault(); dragCounter--; if (dragCounter === 0) { document.body.classList.remove('dragging'); } });
document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    document.body.classList.remove('dragging');
    const droppedFiles = Array.from(e.dataTransfer?.files || []);
    if (droppedFiles.length > 0) {
        const extensoesPermitidas = /(\.pdf|\.docx|\.zip)$/i;
        const arquivosValidos = droppedFiles.filter(f => extensoesPermitidas.test(f.name));
        const arquivosInvalidosCount = droppedFiles.length - arquivosValidos.length;
        if (arquivosValidos.length > 0) {
            arquivosParaEnviar = arquivosParaEnviar.concat(arquivosValidos);
            renderizarListaArquivos();
            let feedbackMsg = `${arquivosValidos.length} arquivo(s) arrastado(s) e adicionado(s).`;
            if (arquivosInvalidosCount > 0) {
                feedbackMsg += ` ${arquivosInvalidosCount} ignorados (tipo inválido).`;
            }
            if (typeof window.adicionarMensagemChat === 'function') {
                 window.adicionarMensagemChat("Sistema", feedbackMsg, 'system-message info');
            }
        } else if (arquivosInvalidosCount > 0) {
             if (typeof window.adicionarMensagemChat === 'function') {
                 window.adicionarMensagemChat("Sistema", `${arquivosInvalidosCount} arquivo(s) arrastado(s) ignorados (tipo inválido).`, 'system-message warning');
             }
        }
    }
});

// --- Funcionalidade de Visualização de Conteúdo Completo ---
let fullContentModal = null;
let modalTitle = null;
let modalContent = null;
let closeModalBtn = null;

// Inicializa o modal (cria se não existir, configura botões e listeners)
function inicializarModalConteudoCompleto() {
    fullContentModal = document.getElementById('fullContentModal');
    if (!fullContentModal) {
        // Cria HTML do modal dinamicamente
        const modalHTML = `
            <div id="fullContentModal" class="modal">
                <div class="modal-content">
                    <span class="close-modal" title="Fechar">&times;</span>
                    <h3 id="modal-title">Conteúdo Completo do Arquivo</h3>
                    <div id="modal-file-content-wrapper">
                         <div id="modal-file-content"></div>
                    </div>
                    <div id="modal-actions">
                        <button id="copyModalContentBtn" title="Copiar Texto">Copiar</button>
                    </div>
                </div>
            </div>`;
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer.firstElementChild);

        // Adiciona estilos CSS dinamicamente (ESTILOS ORIGINAIS, NÃO O VERMELHO/AMARELO)
        const modalStyles = document.createElement('style');
        modalStyles.textContent = `
            .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6); }
            .modal-content { position: relative; background-color: #fefefe; margin: 5% auto; padding: 25px; border: 1px solid #ccc; width: 85%; max-width: 800px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column; max-height: 85vh; }
            .close-modal { color: #aaa; position: absolute; top: 10px; right: 15px; font-size: 28px; font-weight: bold; cursor: pointer; line-height: 1; }
            .close-modal:hover, .close-modal:focus { color: #333; text-decoration: none; }
            #modal-title { margin-top: 0; margin-bottom: 15px; color: #333; font-size: 1.4em; border-bottom: 1px solid #eee; padding-bottom: 10px; }
            #modal-file-content-wrapper { flex-grow: 1; overflow-y: auto; margin-bottom: 15px; }
            #modal-file-content { white-space: pre-wrap; word-wrap: break-word; font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace; font-size: 0.9em; line-height: 1.5; background-color: #f9f9f9; border: 1px solid #ddd; padding: 15px; border-radius: 4px; min-height: 100px; }
            #modal-actions { text-align: right; padding-top: 10px; border-top: 1px solid #eee; }
            #modal-actions button { background-color: #007bff; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 0.9em; }
            #modal-actions button:hover { background-color: #0056b3; }
            .loading-spinner, .error-message { text-align: center; padding: 30px; font-size: 1.1em; }
            .error-message { color: #dc3545; } .error-message button { margin-top: 10px; }`;
        document.head.appendChild(modalStyles);
        fullContentModal = document.getElementById('fullContentModal'); // Pega referência após criar
    }

    // Configura elementos internos e listeners se o modal existe
    if (fullContentModal) {
        modalTitle = document.getElementById('modal-title');
        modalContent = document.getElementById('modal-file-content');
        closeModalBtn = fullContentModal.querySelector('.close-modal');
        const copyBtn = document.getElementById('copyModalContentBtn');

        if (!modalTitle || !modalContent || !closeModalBtn || !copyBtn) {
             console.error("Erro ao inicializar modal: um ou mais elementos internos não encontrados (#modal-title, #modal-file-content, .close-modal, #copyModalContentBtn).");
             return; // Impede configuração adicional se elementos essenciais faltam
        }


        // --- Configuração dos Eventos ---
        // Fechar modal
        closeModalBtn.onclick = function() { fullContentModal.style.display = "none"; };
        window.addEventListener('click', function(event) {
            if (event.target === fullContentModal) { fullContentModal.style.display = "none"; }
        });
        window.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && fullContentModal.style.display === "block") { fullContentModal.style.display = "none"; }
        });

        // Copiar conteúdo
        copyBtn.onclick = function() {
            navigator.clipboard.writeText(modalContent.textContent || '')
                .then(() => { copyBtn.textContent = 'Copiado!'; setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000); })
                .catch(err => { console.error('Erro ao copiar texto: ', err); copyBtn.textContent = 'Falha!'; setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000); });
        };

        // Listener de clique para botões 'Ver Texto' (delegação no documento)
        document.addEventListener('click', function(event) {
            const viewButton = event.target.closest('.btn-view-content'); // Encontra o botão mesmo se clicar no ícone dentro dele
            if (viewButton) {
                const fileId = viewButton.getAttribute('data-file-id');
                if (fileId) {
                    abrirConteudoCompleto(fileId); // Chama a função principal
                }
            }
        });
        console.log("Modal inicializado e listeners configurados."); // Log normal
    } else {
         console.error("Falha crítica ao encontrar ou criar o elemento #fullContentModal.");
    }
}

// Função para abrir o modal e buscar o conteúdo (Lógica Principal)
function abrirConteudoCompleto(fileId) {
    // Verifica se os elementos essenciais do modal foram inicializados
    if (!fullContentModal || !modalTitle || !modalContent) {
        console.error("Erro: Tentativa de abrir modal não inicializado.");
        // Adicionar feedback ao usuário, se possível
        if(typeof window.adicionarMensagemStatus === 'function') {
           window.adicionarMensagemStatus("Erro interno ao abrir visualização. Recarregue a página.", "error");
        }
        return;
    }

    // Define estado inicial e mostra o modal
    modalContent.innerHTML = '<div class="loading-spinner">Carregando conteúdo completo...</div>';
    modalTitle.textContent = 'Carregando...';
    fullContentModal.style.display = "block"; // Torna o modal visível

    // Busca o conteúdo na API
    fetch(`/api/get-full-content/${fileId}`)
        .then(response => {
            if (!response.ok) { // Trata erros HTTP
                 return response.json().then(errData => { throw new Error(errData?.error || `Erro ${response.status}`); })
                           .catch(() => { throw new Error(`Erro ${response.status}: ${response.statusText || 'Erro servidor'}`); });
            }
            return response.json(); // Processa JSON se OK
        })
        .then(data => {
            if (!data) throw new Error("Resposta do servidor inválida."); // Valida dados

            // Atualiza título e conteúdo do modal
            modalTitle.textContent = `Conteúdo Completo: ${data.original_name || 'Arquivo'}`;
            modalContent.innerHTML = formatarConteudoArquivo(data.content); // Usa função auxiliar para formatar/escapar
        })
        .catch(error => {
            // Exibe erro no modal em caso de falha
            console.error("Erro ao buscar ou processar conteúdo completo:", error);
            modalTitle.textContent = 'Erro ao Carregar';
            modalContent.innerHTML = `<div class="error-message"><p>Não foi possível carregar o conteúdo.</p><p><small>${error.message}</small></p><button onclick="abrirConteudoCompleto('${fileId}')">Tentar novamente</button></div>`;
        });
}

// Formata conteúdo de texto para exibição segura no HTML
function formatarConteudoArquivo(conteudo) {
    if (conteudo === null || typeof conteudo === 'undefined') {
        return '<div class="error-message">Conteúdo não disponível ou vazio.</div>';
    }
    if (typeof conteudo !== 'string') {
        conteudo = String(conteudo);
    }
    if (conteudo.trim() === '') {
         return '<div class="error-message">O arquivo parece estar vazio.</div>';
    }
    // Escapa caracteres HTML essenciais
    const conteudoEscapado = conteudo
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    // Retorna o conteúdo escapado (o CSS com white-space: pre-wrap cuidará das quebras de linha)
    return `${conteudoEscapado}`;
}

// --- Inicialização e Exportações ---
window.abrirConteudoCompleto = abrirConteudoCompleto; // Exposta para o botão de erro
document.addEventListener('app:pronto', inicializarModalConteudoCompleto); // Inicializa o modal quando tudo estiver carregado
window.renderizarListaArquivos = renderizarListaArquivos;
renderizarListaArquivos(); // Renderiza a lista inicial

// Notifica que o módulo core foi carregado
const coreLoadedEvent = new CustomEvent('core-loaded');
document.dispatchEvent(coreLoadedEvent);
console.log("Módulo UI Core carregado (versão limpa)");