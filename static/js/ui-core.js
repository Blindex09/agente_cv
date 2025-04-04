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

// Função para fechar o modal com ESC
function fecharModalComEsc(event) {
    if (event.key === 'Escape' && fullContentModal && fullContentModal.style.display === "block") {
        fecharModal();
    }
}

// Função para fechar o modal
function fecharModal() {
    if (fullContentModal) {
        fullContentModal.style.display = "none";
        document.body.style.overflow = ""; // Restaurar rolagem do corpo
        window.removeEventListener('keydown', fecharModalComEsc); // Remover o evento
        
        // Anunciar para leitores de tela que o modal foi fechado
        const statusElement = document.createElement('div');
        statusElement.className = 'sr-only';
        statusElement.setAttribute('role', 'status');
        statusElement.setAttribute('aria-live', 'assertive');
        statusElement.textContent = 'Janela de visualização do arquivo fechada.';
        document.body.appendChild(statusElement);
        
        // Remover o elemento de status após ser lido
        setTimeout(() => {
            if (statusElement.parentNode) {
                statusElement.parentNode.removeChild(statusElement);
            }
        }, 1000);
        
        // Restaurar o foco ao botão que abriu o modal (para acessibilidade)
        const lastButton = document.querySelector('.btn-view-content[data-last-focus="true"]');
        if (lastButton) {
            lastButton.focus();
            lastButton.removeAttribute('data-last-focus');
        }
    }
}

// Função para configurar armadilha de foco (para acessibilidade)
function configurarArmadilhaFoco(modalElement) {
    const focusableElements = modalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length > 0) {
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        // Adicionar evento keydown para capturar Tab
        modalElement.addEventListener('keydown', function(e) {
            // Se pressionar tab com shift, vai para o elemento anterior
            if (e.key === 'Tab' && e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                }
            } 
            // Se pressionar tab sem shift, vai para o próximo elemento
            else if (e.key === 'Tab') {
                if (document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        });
    }
}

// Inicializa o modal (cria se não existir, configura botões e listeners)
function inicializarModalConteudoCompleto() {
    fullContentModal = document.getElementById('fullContentModal');
    if (!fullContentModal) {
        // Cria HTML do modal dinamicamente
        const modalHTML = `
            <div id="fullContentModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-file-content">
                <div class="modal-content">
                    <span class="close-modal" title="Fechar" aria-label="Fechar" tabindex="0" role="button">&times;</span>
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
        
        fullContentModal = document.getElementById('fullContentModal'); // Pega referência após criar
    }

    // Adiciona classe para ajudar com Z-index
    fullContentModal.classList.add('modal-high-priority');

    // Configurar elementos internos e listeners
    modalTitle = document.getElementById('modal-title');
    modalContent = document.getElementById('modal-file-content');
    closeModalBtn = fullContentModal.querySelector('.close-modal');
    const copyBtn = document.getElementById('copyModalContentBtn');

    if (!modalTitle || !modalContent || !closeModalBtn) {
        console.error("Elementos essenciais do modal não encontrados");
        return;
    }

    // Configurar os eventos explicitamente
    closeModalBtn.onclick = fecharModal;
    closeModalBtn.onkeydown = function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fecharModal();
        }
    };
    
    // Evento de clique fora do modal
    window.onclick = function(event) {
        if (event.target === fullContentModal) {
            fecharModal();
        }
    };

    // Evento para o botão de cópia
    if (copyBtn) {
        copyBtn.onclick = function() {
            navigator.clipboard.writeText(modalContent.textContent || '')
                .then(() => { 
                    copyBtn.textContent = 'Copiado!'; 
                    // Anunciar para leitores de tela
                    const statusElement = document.createElement('div');
                    statusElement.className = 'sr-only';
                    statusElement.setAttribute('role', 'status');
                    statusElement.setAttribute('aria-live', 'assertive');
                    statusElement.textContent = 'Texto copiado para a área de transferência.';
                    fullContentModal.appendChild(statusElement);
                    
                    // Limpar
                    setTimeout(() => {
                        copyBtn.textContent = 'Copiar';
                        if (statusElement.parentNode) {
                            statusElement.parentNode.removeChild(statusElement);
                        }
                    }, 2000); 
                })
                .catch(err => { 
                    console.error('Erro ao copiar texto: ', err); 
                    copyBtn.textContent = 'Falha!'; 
                    setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 2000); 
                });
        };
    }

    // Listener para botões 'Ver Texto'
    document.addEventListener('click', function(event) {
        const viewButton = event.target.closest('.btn-view-content');
        if (viewButton) {
            const fileId = viewButton.getAttribute('data-file-id');
            if (fileId) {
                // Marca o botão que foi clicado para restaurar o foco depois
                document.querySelectorAll('.btn-view-content[data-last-focus="true"]').forEach(btn => {
                    btn.removeAttribute('data-last-focus');
                });
                viewButton.setAttribute('data-last-focus', 'true');
                
                abrirConteudoCompleto(fileId);
            }
        }
    });

    console.log("Modal inicializado com sucesso");
}

// Função para abrir o modal e buscar o conteúdo (Lógica Principal)
function abrirConteudoCompleto(fileId) {
    console.log("Abrindo conteúdo para file ID:", fileId); // Log para depuração
    
    // Garantir que o modal existe e está inicializado
    if (!fullContentModal) {
        console.log("Modal não encontrado, inicializando novamente");
        inicializarModalConteudoCompleto();
    }
    
    // Verificar novamente após inicialização
    if (!fullContentModal || !modalTitle || !modalContent) {
        console.error("Erro crítico: Modal não pode ser inicializado");
        if(typeof window.adicionarMensagemStatus === 'function') {
            window.adicionarMensagemStatus("Erro interno ao abrir visualização. Recarregue a página.", "error");
        }
        return;
    }

    // Definir estado inicial e mostrar o modal - FORÇAR DISPLAY BLOCK
    modalContent.innerHTML = '<div class="loading-spinner">Carregando conteúdo completo...</div>';
    modalTitle.textContent = 'Carregando...';
    
    // Importante para acessibilidade - configurar atributos ARIA
    fullContentModal.setAttribute('role', 'dialog');
    fullContentModal.setAttribute('aria-modal', 'true');
    fullContentModal.setAttribute('aria-labelledby', 'modal-title');
    fullContentModal.setAttribute('aria-describedby', 'modal-file-content');
    
    // Tornar o modal visível e ajustar o foco
    fullContentModal.style.display = "block"; 
    document.body.style.overflow = "hidden"; // Impedir rolagem do corpo da página
    
    // Anunciar para leitores de tela que o modal foi aberto
    const statusElement = document.createElement('div');
    statusElement.className = 'sr-only';
    statusElement.setAttribute('role', 'status');
    statusElement.setAttribute('aria-live', 'assertive');
    statusElement.textContent = 'Janela de visualização do arquivo aberta. Carregando conteúdo.';
    fullContentModal.appendChild(statusElement);
    
    // Remover o elemento de status após ser lido
    setTimeout(() => {
        if (statusElement.parentNode) {
            statusElement.parentNode.removeChild(statusElement);
        }
    }, 1000);
    
    // Dar foco ao primeiro elemento focável dentro do modal (importante para acessibilidade)
    setTimeout(() => {
        const closeBtn = fullContentModal.querySelector('.close-modal');
        if (closeBtn) closeBtn.focus();
    }, 50);

    // Adicionar evento para a tecla ESC
    window.addEventListener('keydown', fecharModalComEsc);
    
    // Armadilha de foco para acessibilidade
    configurarArmadilhaFoco(fullContentModal);
    
    // Busca o conteúdo na API
    fetch(`/api/get-full-content/${fileId}`)
        .then(response => {
            if (!response.ok) {
                return response.json()
                    .then(errData => { throw new Error(errData?.error || `Erro ${response.status}`); })
                    .catch(() => { throw new Error(`Erro ${response.status}: ${response.statusText || 'Erro servidor'}`); });
            }
            return response.json();
        })
        .then(data => {
            if (!data) throw new Error("Resposta do servidor inválida.");
            
            // Atualiza título e conteúdo do modal
            modalTitle.textContent = `Conteúdo Completo: ${data.original_name || 'Arquivo'}`;
            modalContent.innerHTML = formatarConteudoArquivo(data.content);
            
            // Anunciar para leitores de tela que o conteúdo foi carregado
            const statusElement = document.createElement('div');
            statusElement.className = 'sr-only';
            statusElement.setAttribute('role', 'status');
            statusElement.setAttribute('aria-live', 'assertive');
            statusElement.textContent = 'Conteúdo do arquivo carregado.';
            fullContentModal.appendChild(statusElement);
            
            // Remover o elemento de status após ser lido
            setTimeout(() => {
                if (statusElement.parentNode) {
                    statusElement.parentNode.removeChild(statusElement);
                }
            }, 1000);
        })
        .catch(error => {
            console.error("Erro ao buscar conteúdo:", error);
            modalTitle.textContent = 'Erro ao Carregar';
            modalContent.innerHTML = `
                <div class="error-message">
                    <p>Não foi possível carregar o conteúdo.</p>
                    <p><small>${error.message}</small></p>
                    <button onclick="window.abrirConteudoCompleto('${fileId}')">Tentar novamente</button>
                </div>`;
            
            // Anunciar erro para leitores de tela
            const statusElement = document.createElement('div');
            statusElement.className = 'sr-only';
            statusElement.setAttribute('role', 'alert');
            statusElement.textContent = 'Erro ao carregar o conteúdo do arquivo.';
            fullContentModal.appendChild(statusElement);
            
            setTimeout(() => {
                if (statusElement.parentNode) {
                    statusElement.parentNode.removeChild(statusElement);
                }
            }, 1000);
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
console.log("Módulo UI Core carregado (versão com acessibilidade melhorada)");