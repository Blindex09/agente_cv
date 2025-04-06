// ui-core.js - Componentes principais da UI e gerenciamento de elementos (v. com <dialog>)
// IMPORTANTE: Este script assume que o HTML foi modificado para usar <dialog id="fullContentModal">
// e que o CSS necessário (incluindo .sr-only e estilos para dialog/::backdrop) existe.

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

// Variáveis específicas do Modal <dialog>
let fullContentDialog = null; // Referência ao <dialog>
let modalTitle = null;
let modalContent = null;
let copyModalContentBtn = null;
let internalCloseModalBtn = null; // Botão de fechar INTERNO do dialog
let ultimoBotaoFocado = null; // Guarda o botão que abriu o dialog

let arquivosParaEnviar = [];

// Expondo no window (se necessário para outros módulos, mas tente evitar se possível)
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

// Função auxiliar para anunciar para leitores de tela (requer classe .sr-only no CSS)
function anunciarParaLeitorTela(mensagem, role = 'status', ariaLive = 'assertive', container = document.body) {
    // Tenta encontrar um elemento de anúncio existente dentro do container especificado
    let statusElement = container.querySelector('.sr-only-announcement');

    if (statusElement) {
        // Reutiliza o elemento existente
        statusElement.textContent = mensagem;
         // Garante que atributos ARIA estejam corretos (podem mudar entre status/alert)
        statusElement.setAttribute('role', role);
        statusElement.setAttribute('aria-live', ariaLive);
    } else {
        // Cria um novo elemento se não existir
        statusElement = document.createElement('div');
        statusElement.className = 'sr-only sr-only-announcement'; // Usa classe definida no CSS
        statusElement.setAttribute('role', role);
        statusElement.setAttribute('aria-live', ariaLive);
        statusElement.textContent = mensagem;
        container.appendChild(statusElement);

        // Agendar remoção para não poluir o DOM permanentemente
        setTimeout(() => {
            if (statusElement && statusElement.parentNode) {
                statusElement.parentNode.removeChild(statusElement);
            }
        }, 2500); // Tempo um pouco maior para garantir leitura
    }
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
        // Desabilita se processando (assume que window.isProcessing existe)
        removeBtn.disabled = typeof window.isProcessing === 'function' && window.isProcessing();
        removeBtn.addEventListener('click', (e) => {
            if (typeof window.isProcessing === 'function' && window.isProcessing()) return;
            const iToRemove = parseInt(e.target.dataset.index, 10);
            if (!isNaN(iToRemove)) {
                arquivosParaEnviar.splice(iToRemove, 1);
                renderizarListaArquivos(); // Atualiza a UI
            }
            if (arquivosParaEnviar.length === 0 && arquivoInput) {
                arquivoInput.value = null; // Limpa o input se a lista ficar vazia
            }
        });
        li.appendChild(fileInfoSpan);
        li.appendChild(fileSizeSpan);
        li.appendChild(removeBtn);
        filePreviewList.appendChild(li);
    });
    // Habilita/Desabilita botão principal
    if (btnProcessar) {
         btnProcessar.disabled = (arquivosParaEnviar.length === 0) || (typeof window.isProcessing === 'function' && window.isProcessing());
    }
}

// --- Eventos de Upload e Interação ---
if (arquivoInput) {
    arquivoInput.addEventListener('change', (event) => {
        const novosArquivos = Array.from(event.target.files || []);
        arquivosParaEnviar = arquivosParaEnviar.concat(novosArquivos);
        renderizarListaArquivos();
        event.target.value = null; // Permite selecionar o mesmo arquivo novamente
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
            e.preventDefault(); // Impede nova linha no textarea
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
            chatInput.value = ''; // Limpa o input após colar arquivos
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


// --- Funcionalidade de Visualização de Conteúdo Completo (usando <dialog>) ---

// Inicializa o dialog e seus listeners
function inicializarDialogConteudoCompleto() {
    fullContentDialog = document.getElementById('fullContentModal');
    // Verifica se o elemento <dialog> existe no HTML
    if (!fullContentDialog || fullContentDialog.tagName !== 'DIALOG') {
        console.error("Elemento <dialog id='fullContentModal'> não encontrado ou não é um <dialog> no HTML. Verifique os pré-requisitos.");
        // Impede a inicialização dos listeners se o dialog não existir
        return;
    }

    modalTitle = document.getElementById('modal-title');
    modalContent = document.getElementById('modal-file-content'); // Ou o wrapper se preferir scroll nele
    copyModalContentBtn = document.getElementById('copyModalContentBtn');
    internalCloseModalBtn = document.getElementById('internalCloseModalBtn'); // Botão de fechar interno

    if (!modalTitle || !modalContent || !copyModalContentBtn || !internalCloseModalBtn) {
        console.error("Elementos internos do dialog (title, content, copy, #internalCloseModalBtn) não encontrados. Verifique os IDs no HTML.");
        return;
    }

    // Evento para o botão de cópia
    copyModalContentBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(modalContent.textContent || '')
            .then(() => {
                copyModalContentBtn.textContent = 'Copiado!';
                anunciarParaLeitorTela('Texto copiado para a área de transferência.', 'status', 'assertive', fullContentDialog);
                setTimeout(() => { copyModalContentBtn.textContent = 'Copiar'; }, 2000);
            })
            .catch(err => {
                console.error('Erro ao copiar texto: ', err);
                copyModalContentBtn.textContent = 'Falha!';
                anunciarParaLeitorTela('Falha ao copiar texto.', 'alert', 'assertive', fullContentDialog);
                setTimeout(() => { copyModalContentBtn.textContent = 'Copiar'; }, 2000);
            });
    });

    // Evento para o botão de fechar INTERNO (com id="internalCloseModalBtn")
    internalCloseModalBtn.addEventListener('click', () => {
        fullContentDialog.close('button'); // Fecha o dialog (passa um retorno opcional)
    });

    // Evento 'close' do dialog: disparado ao fechar (via Esc, botão com value="cancel", ou .close())
    fullContentDialog.addEventListener('close', () => {
        console.log("Dialog fechado. Valor de retorno:", fullContentDialog.returnValue); // returnValue pode ser útil
        anunciarParaLeitorTela('Janela de visualização do arquivo fechada.'); // Anuncia fechamento

        // Tenta restaurar o foco para o botão que abriu o dialog
        if (ultimoBotaoFocado) {
            console.log("Restaurando foco para:", ultimoBotaoFocado);
            ultimoBotaoFocado.focus();
            ultimoBotaoFocado = null; // Limpa a referência após restaurar
        } else {
            console.warn("Não foi possível restaurar o foco: último botão não encontrado.");
        }
        // Limpa o conteúdo ao fechar para não mostrar dados antigos na próxima abertura
         if(modalContent) modalContent.innerHTML = '';
         if(modalTitle) modalTitle.textContent = '';
    });

    // Opcional: Fechar ao clicar no backdrop (área fora do dialog)
    fullContentDialog.addEventListener('click', (event) => {
        // Verifica se o clique foi diretamente no elemento dialog (backdrop)
        if (event.target === fullContentDialog) {
            console.log("Clique no backdrop detectado.");
            fullContentDialog.close('backdrop'); // Fecha com um valor de retorno indicando a causa
        }
    });

    // Listener global para cliques nos botões 'Ver Texto'
    document.addEventListener('click', (event) => {
        const viewButton = event.target.closest('.btn-view-content');
        if (viewButton) {
            const fileId = viewButton.getAttribute('data-file-id');
            // Garante que o dialog foi encontrado na inicialização antes de tentar abrir
            if (fileId && fullContentDialog) {
                ultimoBotaoFocado = viewButton; // Guarda a referência do botão
                console.log("Botão 'Ver Texto' clicado, guardando:", ultimoBotaoFocado);
                abrirConteudoCompleto(fileId);
            } else if (!fullContentDialog) {
                console.error("Dialog de conteúdo não inicializado. O botão 'Ver Texto' não funcionará.");
            }
        }
    });

    console.log("Dialog de conteúdo completo inicializado.");
}

// Função para ABRIR o dialog e buscar o conteúdo
function abrirConteudoCompleto(fileId) {
    // Re-verifica se o dialog e seus elementos essenciais estão disponíveis
    if (!fullContentDialog || !modalTitle || !modalContent) {
        console.error("Dialog não está pronto ou elementos internos faltando. Impossível abrir.");
         if(typeof window.adicionarMensagemStatus === 'function') {
             window.adicionarMensagemStatus("Erro interno ao tentar abrir visualização.", "error");
         }
        return;
    }

    console.log("Abrindo dialog para file ID:", fileId);

    // Define estado inicial de carregamento
    modalTitle.textContent = 'Carregando...';
    // Use um estilo CSS para .loading-spinner como no seu CSS original
    modalContent.innerHTML = '<div class="loading-spinner">Carregando conteúdo completo...</div>';

    // Abre o dialog como MODAL (nativo do navegador)
    fullContentDialog.showModal();
    anunciarParaLeitorTela('Janela de visualização do arquivo aberta. Carregando conteúdo.', 'dialog'); // 'dialog' role é apropriado

    // Define o foco inicial para o título (H3 com tabindex="-1")
    // Usar setTimeout pequeno garante que o dialog esteja renderizado e pronto para receber foco
    setTimeout(() => {
        if (modalTitle) { // Verifica se o título ainda existe
           modalTitle.focus();
           console.log("Foco inicial definido para:", document.activeElement);
        } else {
            console.warn("Título do modal não encontrado para definir foco inicial.");
            // Fallback: focar no próprio dialog ou botão de fechar
            internalCloseModalBtn?.focus();
        }
    }, 100); // 100ms geralmente é seguro

    // Busca o conteúdo na API
    fetch(`/api/get-full-content/${fileId}`)
        .then(response => {
            if (!response.ok) {
                // Tenta ler o erro do JSON, senão usa o statusText
                return response.json()
                    .then(errData => { throw new Error(errData?.error || `Erro ${response.status}`); })
                    .catch(() => { throw new Error(`Erro ${response.status}: ${response.statusText || 'Erro servidor'}`); });
            }
            return response.json();
        })
        .then(data => {
            if (!data || typeof data.content === 'undefined') throw new Error("Resposta do servidor inválida ou sem conteúdo.");

            // Atualiza título e conteúdo (garante que os elementos ainda existem)
             if (modalTitle) modalTitle.textContent = `Conteúdo Completo: ${data.original_name || 'Arquivo'}`;
             if (modalContent) modalContent.innerHTML = formatarConteudoArquivo(data.content);

            anunciarParaLeitorTela('Conteúdo do arquivo carregado.', 'status', 'assertive', fullContentDialog);

             // Opcional: Mover foco para o conteúdo após carregar, se for longo e scrollable
             // const contentWrapper = document.getElementById('modal-file-content-wrapper');
             // if (contentWrapper) {
             //    contentWrapper.setAttribute('tabindex', '-1'); // Torna focável
             //    setTimeout(() => contentWrapper.focus(), 50);
             // }

        })
        .catch(error => {
            console.error("Erro ao buscar conteúdo:", error);
            // Atualiza título e conteúdo com erro (garante que os elementos ainda existem)
            if (modalTitle) modalTitle.textContent = 'Erro ao Carregar';
            if (modalContent) modalContent.innerHTML = `
                <div class="error-message">
                    <p>Não foi possível carregar o conteúdo.</p>
                    <p><small>${error.message}</small></p>
                    <button type="button" onclick="window.abrirConteudoCompleto('${fileId}')">Tentar novamente</button>
                </div>`; // Usar type="button"

            anunciarParaLeitorTela(`Erro ao carregar conteúdo: ${error.message}`, 'alert', 'assertive', fullContentDialog);
        });
}

// Formata conteúdo de texto para exibição segura no HTML
function formatarConteudoArquivo(conteudo) {
    if (conteudo === null || typeof conteudo === 'undefined') {
        // Use uma classe CSS para estilizar mensagens informativas/de erro
        return '<div class="info-message">Conteúdo não disponível ou vazio.</div>';
    }
    if (typeof conteudo !== 'string') {
        conteudo = String(conteudo);
    }
    if (conteudo.trim() === '') {
         return '<div class="info-message">O arquivo parece estar vazio.</div>';
    }
    // Escapa caracteres HTML essenciais
    const conteudoEscapado = conteudo
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Retorna apenas o conteúdo escapado. O CSS deve cuidar da formatação (white-space: pre-wrap)
    // no elemento #modal-file-content ou seu wrapper.
     return conteudoEscapado;
}


// --- Inicialização e Exportações ---
// Expõe a função para o botão de erro 'Tentar novamente' (se ainda necessário)
window.abrirConteudoCompleto = abrirConteudoCompleto;
// Expõe renderizarListaArquivos se for chamada de outros módulos
window.renderizarListaArquivos = renderizarListaArquivos;


// Inicializa o dialog quando a aplicação estiver pronta
// Assume que o evento 'app:pronto' é disparado pelo seu main.js ou similar
// IMPORTANTE: Garanta que 'app:pronto' seja disparado *depois* que o DOM estiver completo.
let appProntoDisparado = false;
document.addEventListener('app:pronto', () => {
    if(appProntoDisparado) return; // Evita inicialização dupla
    appProntoDisparado = true;
    console.log("Evento 'app:pronto' recebido. Inicializando Dialog...");
    inicializarDialogConteudoCompleto();
});

// Fallback usando DOMContentLoaded se 'app:pronto' não for confiável ou não existir
// A inicialização só ocorrerá uma vez (ou por 'app:pronto' ou por 'DOMContentLoaded')
document.addEventListener('DOMContentLoaded', () => {
    // Só inicializa via DOMContentLoaded se 'app:pronto' ainda não tiver disparado
    if (!appProntoDisparado) {
         console.log("Evento 'DOMContentLoaded' recebido ANTES de 'app:pronto'. Inicializando Dialog...");
         // Pode ser necessário um pequeno delay se outros scripts ainda não rodaram
         setTimeout(inicializarDialogConteudoCompleto, 100);
    } else {
         console.log("Evento 'DOMContentLoaded' recebido DEPOIS de 'app:pronto'. Dialog já deve estar inicializado.");
    }
});


// Renderiza a lista de arquivos inicial (caso haja algum estado pré-carregado)
renderizarListaArquivos();

// Notifica que o módulo core (potencialmente) carregou (outros módulos podem ouvir)
const coreLoadedEvent = new CustomEvent('core-loaded');
document.dispatchEvent(coreLoadedEvent);
console.log("Módulo UI Core (v. <dialog>) carregado e pronto para inicializar dialog.");