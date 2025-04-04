// ui-formatters.js - Formatadores de texto e tratamento de mensagens

// --- Função de formatação de texto da IA ---
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

// --- Mensagens de Status ---

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
    window.statusDiv.appendChild(novaLinha);
    if (window.statusDiv.scrollHeight - window.statusDiv.scrollTop <= window.statusDiv.clientHeight + 100) { 
        window.statusDiv.scrollTo({ top: window.statusDiv.scrollHeight, behavior: 'smooth' }); 
    }
}

// --- Mensagens de Chat ---

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

    if (remetente.toLowerCase() === 'usuário') { 
        div.className = 'user-message'; 
        span.textContent = texto; 
    }
    else {
        div.className = remetente.toLowerCase() === 'sistema' ? 'system-message' : 'ai-message';
        if(tipoMsg) { span.classList.add(...tipoMsg.split(' ')); }
        if (isError && remetente.toLowerCase() !== 'usuário') { 
            span.innerHTML = formatarTextoIA(getMensagemErroAmigavelChat(texto)); 
        }
        else { 
            span.innerHTML = formatarTextoIA(texto); 
        }
    }
    div.appendChild(span);
    window.chatMessages.appendChild(div);
    window.chatMessages.scrollTo({ top: window.chatMessages.scrollHeight, behavior: 'smooth' });
}

// --- Formatadores de código ---

// Detecta e formata fragmentos de código dentro do texto
function formatarCodigo(texto) {
    // Detecta blocos de código com marcação ```
    const blocksRegex = /```(?:([a-z]+)\n)?([\s\S]*?)```/g;
    let formattedText = texto.replace(blocksRegex, (match, language, code) => {
        const lang = language || 'plaintext';
        return `<pre class="code-block ${lang}"><code>${escapeHtml(code.trim())}</code></pre>`;
    });
    
    // Detecta código inline com marcação `código`
    const inlineRegex = /`([^`]+)`/g;
    formattedText = formattedText.replace(inlineRegex, '<code class="inline-code">$1</code>');
    
    return formattedText;
}

// Função auxiliar para escapar HTML
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// --- Funções de UI avançadas ---

// Destaca termos de pesquisa no texto
function destacarTermosPesquisa(texto, termos) {
    if (!termos || !termos.length) return texto;
    let resultado = texto;
    
    termos.forEach(termo => {
        if (termo.trim().length > 2) { // Evita destacar termos muito curtos
            const regex = new RegExp(`(${termo})`, 'gi');
            resultado = resultado.replace(regex, '<mark>$1</mark>');
        }
    });
    
    return resultado;
}

// Formata URLs como links clicáveis
function formatarLinks(texto) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return texto.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// --- Exportando funções ---
window.formatarTextoIA = formatarTextoIA;
window.adicionarMensagemStatus = adicionarMensagemStatus;
window.adicionarMensagemChat = adicionarMensagemChat;
window.formatarCodigo = formatarCodigo;
window.destacarTermosPesquisa = destacarTermosPesquisa;
window.formatarLinks = formatarLinks;

// Notificar que o módulo formatters foi carregado
const formattersLoadedEvent = new CustomEvent('formatters-loaded');
document.dispatchEvent(formattersLoadedEvent);

console.log("Módulo UI Formatters carregado");