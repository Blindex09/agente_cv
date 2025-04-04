// ui-handlers.js - Gerencia a interface do usuário e interações com o DOM

// --- Referências e Variáveis Globais ---
const arquivoInput = document.getElementById('arquivoInput');
const btnProcessar = document.getElementById('btnProcessar');
const statusDiv = document.getElementById('status');
const chkGerarRelatorio = document.getElementById('chkGerarRelatorio');
const chkPesquisarWeb = document.getElementById('chkPesquisarWeb');
const filePreviewList = document.getElementById('file-preview-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnEnviarChat = document.getElementById('btnEnviarChat');

let arquivosParaEnviar = [];

// Exportando referências para uso global
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
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatarTextoIA(texto) {
    if (!texto) return '';
    
    // Escapar caracteres HTML para segurança
    const escapedText = texto.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Melhorar a detecção de listas
    let html = '';
    let inList = false;
    
    // Dividir por linhas para processar o texto
    const linhas = escapedText.split('\n');
    
    for (let i = 0; i < linhas.length; i++) {
        let linha = linhas[i].trim();
        
        // Verificar se é um item de lista (começando com * ou • ou -)
        const listaMatch = linha.match(/^(\*|\•|\-)\s+(.*)/);
        
        if (listaMatch) {
            // É um item de lista
            const conteudoItem = listaMatch[2].trim();
            
            if (!inList) {
                // Iniciar nova lista
                html += '<ul>';
                inList = true;
            }
            
            // Processar marcadores de formatação no conteúdo do item da lista
            let conteudoProcessado = conteudoItem
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')  // Negrito
                .replace(/\*([^*]+)\*/g, '<em>$1</em>');             // Itálico
                
            html += `<li>${conteudoProcessado}</li>`;
        } else {
            // Não é item de lista
            if (inList) {
                // Fechar lista anterior
                html += '</ul>';
                inList = false;
            }
            
            if (linha) {
                // Processar formatação de texto (negrito, itálico)
                linha = linha
                    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')  // Negrito
                    .replace(/\*([^*]+)\*/g, '<em>$1</em>');             // Itálico
                
                html += `<p>${linha}</p>`;
            } else {
                // Linha vazia
                html += '<br>';
            }
        }
    }
    
    // Fechar lista se ainda estiver aberta
    if (inList) {
        html += '</ul>';
    }
    
    // Remover <p></p> vazios
    html = html.replace(/<p><\/p>/g, '');
    
    return html;
}

// --- Funções de UI ---

// Adiciona mensagem ao STATUS (com tratamento de erro amigável)
function adicionarMensagemStatus(mensagem, tipo = 'info') {
    const novaLinha = document.createElement('div');
    novaLinha.classList.add('status-message');
    let conteudoHtml = '';
    let mensagemOriginal = '';

    function getMensagemErroAmigavel(errorMsg) {
        if (!errorMsg) return "Ocorreu um erro inesperado.";
        let msgStr = String(errorMsg).toLowerCase();
        mensagemOriginal = errorMsg;
        if (msgStr.includes("quota") || msgStr.includes("429") || msgStr.includes("limite de uso")) {
            novaLinha.classList.add('quota-error');
            window.currentBatchHadQuotaError = true; // <-- ATUALIZA FLAG GLOBAL DO LOTE
            return "Limite de uso da IA atingido.";
        }
        if (msgStr.includes("api key not valid")) return "Chave da API inválida.";
        if (msgStr.includes("json")) return "Erro ao processar resposta da IA.";
        if (msgStr.includes("corrompido")) return "Arquivo ZIP parece estar corrompido.";
        if (msgStr.includes("extrair zip")) return "Erro ao extrair arquivo(s) do ZIP.";
        if (msgStr.includes("leitura do arquivo")) return "Erro ao ler o conteúdo do arquivo.";
        if (msgStr.includes("baixar url")) return "Erro ao tentar baixar conteúdo da web.";
        if (msgStr.includes("sumarizar")) return "Erro ao tentar resumir conteúdo da web.";
        return "Ocorreu um erro na análise."; // Genérico
    }

    try {
        if (typeof mensagem === 'object' && mensagem !== null) {
            const filenameStrong = mensagem.filename ? `<strong>${mensagem.filename}</strong>` : '[Sistema]';
            const messageText = mensagem.message || '';
            switch(mensagem.type) {
                case 'status': novaLinha.classList.add('info'); conteudoHtml = `${filenameStrong}: ${messageText}`; break;
                case 'file_start': novaLinha.classList.add('info'); conteudoHtml = `--- Iniciando análise: ${filenameStrong} (${mensagem.index}/${mensagem.total}) ---`; break;
                case 'file_done':
                    let statusFinal = mensagem.result.status_final || 'Desconhecido';
                    let statusClass = 'info';
                    if (statusFinal.toLowerCase().includes('erro')) {
                        statusClass = 'error';
                        conteudoHtml = `--- Análise de ${filenameStrong} concluída com ERROS ---`;
                        if(mensagem.result.error_message) { conteudoHtml += `<br><span class="error">Detalhe: ${getMensagemErroAmigavel(mensagem.result.error_message)}</span>`; }
                    } else {
                        statusClass = 'success';
                        conteudoHtml = `--- Análise de ${filenameStrong} concluída com SUCESSO ---`;
                        let teveFalhaIA = Object.values(mensagem.result.steps || {}).some(s => typeof s === 'string' && (s.toLowerCase().includes('erro') || s.toLowerCase().includes('falha') || s.toLowerCase().includes('limite')));
                        if (teveFalhaIA) { conteudoHtml += ` <span class="warning">(Atenção: Algumas análises da IA podem ter falhado por erro ou limite)</span>`; }
                    }
                    novaLinha.classList.add(statusClass);
                    break;
                case 'step_start': novaLinha.classList.add('info'); conteudoHtml = `${filenameStrong}: ${mensagem.step}...`; break;
                case 'step_done':
                    let stepStatus = mensagem.status || '';
                    let stepClass = 'success'; let statusText = `OK`;
                    if (stepStatus.toLowerCase().includes('erro') || stepStatus.toLowerCase().includes('falha') || stepStatus.toLowerCase().includes("limite")) {
                        stepClass = 'error'; statusText = `Falhou (${getMensagemErroAmigavel(stepStatus)})`;
                    } else if (stepStatus.toLowerCase().includes('não solicitado') || stepStatus.toLowerCase().includes('ignorado') || stepStatus.toLowerCase().includes('pulado')) {
                        stepClass = 'skipped'; statusText = `Não solicitado`;
                    } else if (stepStatus.toLowerCase().includes('aviso') || stepStatus.toLowerCase().includes('vazio') || stepStatus.toLowerCase().includes('sem texto')) {
                         stepClass = 'warning'; statusText = `${stepStatus}`; // Mostra aviso completo
                    } else if (stepStatus.startsWith("OK (")) { stepClass = 'success'; statusText = stepStatus; }
                    novaLinha.classList.add(stepClass);
                    conteudoHtml = `${filenameStrong}: ${mensagem.step}: <span class="${stepClass}">${statusText}</span>`;
                    if (mensagem.data && Object.keys(mensagem.data).length > 0) { conteudoHtml += `<pre>${JSON.stringify(mensagem.data, null, 2)}</pre>`; }
                    if (mensagem.summary) { conteudoHtml += `<div>Resumo Web:</div><pre>${mensagem.summary}</pre>`; }
                    break;
                case 'pause': novaLinha.classList.add('info'); conteudoHtml = `<span class="info">[Sistema] Pausando por ${mensagem.duration} segundos...</span>`; break;
                case 'warning': novaLinha.classList.add('warning'); conteudoHtml = `<span class="warning">${filenameStrong}: Aviso: ${messageText}</span>`; break;
                case 'error': case 'file_error': novaLinha.classList.add('error'); conteudoHtml = `<span class="error">${filenameStrong}: ERRO: ${getMensagemErroAmigavel(messageText)}</span>`; break;
                case 'batch_done': novaLinha.classList.add('success'); conteudoHtml = `<strong class="success">====== Análise do Lote Concluída ======</strong>`; break;
                case 'batch_failed': novaLinha.classList.add('error'); conteudoHtml = `<strong class="error">====== Falha Crítica na Análise do Lote ======</strong>`; break;
                default: novaLinha.classList.add(tipo || 'info'); conteudoHtml = `<span class="${tipo || 'info'}">${formatarTextoIA(messageText || JSON.stringify(mensagem))}</span>`;
            }
        } else { novaLinha.classList.add(tipo || 'info'); conteudoHtml = `<span class="${tipo || 'info'}">${formatarTextoIA(mensagem)}</span>`; }
    } catch (e) { console.error("Erro ao formatar mensagem de status:", e, mensagem); novaLinha.classList.add('error'); conteudoHtml = `<span class="error">[Erro Interno da Interface] Falha ao exibir atualização.</span>`; mensagemOriginal = JSON.stringify(mensagem); }

    if (mensagemOriginal) { console.error("Detalhe técnico do erro:", mensagemOriginal); }
    novaLinha.innerHTML = conteudoHtml;
    statusDiv.appendChild(novaLinha);
    if (statusDiv.scrollHeight - statusDiv.scrollTop <= statusDiv.clientHeight + 100) { statusDiv.scrollTo({ top: statusDiv.scrollHeight, behavior: 'smooth' }); }
}

// Adiciona mensagem ao CHAT (com tratamento de erro amigável)
function adicionarMensagemChat(remetente, texto, tipoMsg = '') {
    const div = document.createElement('div');
    const span = document.createElement('span');
    let isError = tipoMsg.includes('error');

    function getMensagemErroAmigavelChat(errorMsg) {
        if (!errorMsg) return "Ocorreu um erro inesperado no chat.";
        let msgStr = String(errorMsg).toLowerCase();
        console.error("Detalhe técnico do erro (chat):", errorMsg);
        if (msgStr.includes("quota") || msgStr.includes("429") || msgStr.includes("limite de uso")) {
            return "Desculpe, o limite de uso da IA foi atingido. O chat não está disponível no momento.";
        }
        if (msgStr.includes("lote não encontrado") || msgStr.includes("processamento não foi concluído")) {
             return "Por favor, processe um lote de arquivos com sucesso antes de fazer perguntas.";
         }
         if (msgStr.includes("contexto") || msgStr.includes("currículo válido")) {
              return "Não encontrei informações suficientes nos arquivos analisados para responder.";
         }
         return "Desculpe, ocorreu um erro ao tentar processar sua pergunta.";
    }

    if (remetente.toLowerCase() === 'usuário') { div.className = 'user-message'; span.textContent = texto; }
    else {
        div.className = remetente.toLowerCase() === 'sistema' ? 'system-message' : 'ai-message';
        if(tipoMsg) { span.classList.add(...tipoMsg.split(' ')); }
        if (isError && remetente.toLowerCase() !== 'usuário') { span.innerHTML = formatarTextoIA(getMensagemErroAmigavelChat(texto)); }
        else { span.innerHTML = formatarTextoIA(texto); }
    }
    div.appendChild(span);
    chatMessages.appendChild(div);
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

// Renderiza lista de prévia
function renderizarListaArquivos() {
    filePreviewList.innerHTML = '';
    
    if (arquivosParaEnviar.length === 0) {
        filePreviewList.innerHTML = '<li class="empty-message">Nenhum arquivo selecionado ou colado.</li>';
        btnProcessar.disabled = true;
        return;
    }
    
    arquivosParaEnviar.forEach((file, index) => {
        const li = document.createElement('li');
        
        const fileInfoSpan = document.createElement('span');
        fileInfoSpan.className = 'file-info';
        fileInfoSpan.textContent = file.name;
        fileInfoSpan.title = file.name;
        
        const fileSizeSpan = document.createElement('span');
        fileSizeSpan.className = 'file-size';
        fileSizeSpan.textContent = `(${formatBytes(file.size)})`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = 'Remover';
        removeBtn.type = 'button';
        removeBtn.dataset.index = index;
        removeBtn.disabled = window.isProcessing ? window.isProcessing() : false;
        removeBtn.addEventListener('click', e => {
            if (window.isProcessing && window.isProcessing()) return;
            const iToRemove = parseInt(e.target.dataset.index, 10);
            arquivosParaEnviar.splice(iToRemove, 1);
            renderizarListaArquivos();
            
            if (arquivosParaEnviar.length === 0) {
                arquivoInput.value = null;
            }
        });
        
        li.appendChild(fileInfoSpan);
        li.appendChild(fileSizeSpan);
        li.appendChild(removeBtn);
        filePreviewList.appendChild(li);
    });
    
    btnProcessar.disabled = window.isProcessing ? window.isProcessing() : false;
}

// --- Eventos ---

// Input de Arquivo
arquivoInput.addEventListener('change', (event) => {
    const novosArquivos = Array.from(event.target.files);
    arquivosParaEnviar = arquivosParaEnviar.concat(novosArquivos);
    renderizarListaArquivos();
    event.target.value = null;
    adicionarMensagemChat("Sistema", `${novosArquivos.length} arquivo(s) adicionado(s) à fila.`, 'system-message');
});

// Botão Processar
btnProcessar.addEventListener('click', () => {
    const initialInstruction = chatInput.value.trim();
    if (window.processarArquivos) {
        window.processarArquivos(arquivosParaEnviar, initialInstruction);
    } else {
        console.error("Função processarArquivos não disponível. Verifique se o módulo api-services.js foi carregado.");
        adicionarMensagemStatus("Erro ao iniciar processamento. Recarregue a página.", "error");
    }
});

// Listeners de Chat
btnEnviarChat.addEventListener('click', () => {
    if (window.enviarMensagemChat) {
        window.enviarMensagemChat();
    } else {
        console.error("Função enviarMensagemChat não disponível. Verifique se o módulo api-services.js foi carregado.");
        adicionarMensagemChat("Sistema", "Erro ao enviar mensagem. Recarregue a página.", "system-message error");
    }
});

chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (window.enviarMensagemChat) {
            window.enviarMensagemChat();
        } else {
            console.error("Função enviarMensagemChat não disponível. Verifique se o módulo api-services.js foi carregado.");
            adicionarMensagemChat("Sistema", "Erro ao enviar mensagem. Recarregue a página.", "system-message error");
        }
    }
});

// Listener de Paste
chatInput.addEventListener('paste', (event) => {
    const items = event.clipboardData?.files || [];
    if (items.length > 0) {
        console.log(`Arquivos colados detectados: ${items.length}`);
        event.preventDefault();
        const arquivosColados = Array.from(items);
        const extensoesPermitidas = /(\.pdf|\.docx|\.zip)$/i;
        const arquivosValidos = arquivosColados.filter(f => extensoesPermitidas.test(f.name));
        const arquivosInvalidos = arquivosColados.length - arquivosValidos.length;
        
        if (arquivosValidos.length > 0) {
            arquivosParaEnviar = arquivosParaEnviar.concat(arquivosValidos);
            renderizarListaArquivos();
            let feedbackMsg = `${arquivosValidos.length} arquivo(s) colado(s) e adicionado(s) à fila.`;
            if (arquivosInvalidos > 0) {
                feedbackMsg += ` ${arquivosInvalidos} arquivo(s) foram ignorados (tipo inválido).`;
            }
            adicionarMensagemChat("Sistema", feedbackMsg, 'system-message');
        } else if (arquivosInvalidos > 0) {
            adicionarMensagemChat("Sistema", `${arquivosInvalidos} arquivo(s) colado(s) foram ignorados (tipo inválido). Tipos permitidos: PDF, DOCX, ZIP.`, 'system-message warning');
        }
        chatInput.value = '';
    }
});

// --- Melhorias de UX ---

// Feedback visual quando arrastar arquivos
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
});

document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML') {
        document.body.classList.remove('dragging');
    }
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const extensoesPermitidas = /(\.pdf|\.docx|\.zip)$/i;
    const arquivosValidos = droppedFiles.filter(f => extensoesPermitidas.test(f.name));
    
    if (arquivosValidos.length > 0) {
        arquivosParaEnviar = arquivosParaEnviar.concat(arquivosValidos);
        renderizarListaArquivos();
        adicionarMensagemChat("Sistema", `${arquivosValidos.length} arquivo(s) arrastado(s) e adicionado(s) à fila.`, 'system-message');
    }
});

// Fechar mensagens de alerta após alguns segundos
function configurarFechamentoAutomaticoAlertas() {
    const alertas = document.querySelectorAll('.alert-dismissible');
    alertas.forEach(alerta => {
        setTimeout(() => {
            if (alerta && alerta.parentNode) {
                alerta.classList.add('fade-out');
                setTimeout(() => {
                    if (alerta && alerta.parentNode) {
                        alerta.parentNode.removeChild(alerta);
                    }
                }, 500);
            }
        }, 5000);
    });
}

// Verifica se há alertas para fechar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', configurarFechamentoAutomaticoAlertas);

// Exportando funções
window.adicionarMensagemStatus = adicionarMensagemStatus;
window.adicionarMensagemChat = adicionarMensagemChat;
window.renderizarListaArquivos = renderizarListaArquivos;
window.formatarTextoIA = formatarTextoIA;

// Estado inicial da UI
renderizarListaArquivos();
btnProcessar.disabled = true;
btnEnviarChat.disabled = true;
chatInput.disabled = true; // Começa desabilitado até um lote ser processado com sucesso
chatInput.placeholder = "Analise arquivos para habilitar o chat...";

console.log("Módulo UI carregado");