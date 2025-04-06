// api-services.js - Gerencia comunicação com o backend e estado da aplicação
// VERSÃO MODIFICADA PARA EXIBIR DADOS EXTRAS DA EXTRAÇÃO

// --- Variáveis para controle de estado da API ---
let eventSource = null;
let currentBatchId = null;
let isProcessing = false;
let currentBatchHadQuotaError = false; // Flag para erro de cota no lote atual

// --- Funções de comunicação com a API ---

// Conectar ao Stream SSE
function conectarAoStream(batchId) {
    const streamUrl = `/api/stream-processing/${batchId}`; // Assumindo que a rota está correta
    window.adicionarMensagemStatus(`Conectando para receber andamento da análise (stream)...`, 'info');
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
        console.warn("Fechando conexão SSE anterior antes de abrir uma nova.");
        eventSource.close();
    }
    eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
        console.log("Conexão SSE aberta.");
        window.adicionarMensagemStatus("Conexão estabelecida, aguardando dados...", "info");
    };

    eventSource.onmessage = (event) => {
        try {
            const updateData = JSON.parse(event.data);
            console.log('SSE Data:', updateData);

            // --- Lógica de tratamento de mensagens SSE (Mantida) ---
            // Adiciona ao Status (exceto tipos específicos)
             if(!['initial_instruction_result', 'pause', 'file_start', 'step_start', 'step_done', 'file_done', 'file_error', 'batch_done', 'batch_failed'].includes(updateData.type) && !['status', 'warning', 'error'].includes(updateData.type)) {
                 // Tipos genéricos ou 'info'
                window.adicionarMensagemStatus(updateData.message || JSON.stringify(updateData), updateData.type || 'info');
             } else if (['status', 'warning', 'error'].includes(updateData.type)) {
                 // Garante que status, warning e error sempre apareçam
                 window.adicionarMensagemStatus(updateData, updateData.type); // Passa objeto para tratamento no formatter
             }


            // Tratar resultado da instrução inicial -> vai para o CHAT
            if (updateData.type === 'initial_instruction_result') {
                window.adicionarMensagemChat("Assistente", updateData.reply || "[Instrução inicial processada, mas IA não respondeu.]");
            }

            // Processar resultado de arquivo -> vai para a área de Resultados
            if (updateData.type === 'file_done' && updateData.result) {
                processarResultadoArquivo(updateData.result); // Função que chama criarElementoArquivoResultado
                window.adicionarMensagemStatus(`Arquivo '${updateData.result.filename}' processado. Status: ${updateData.result.status_final}`, 'info');
            }

            // Tratar erros específicos de arquivo
            if (updateData.type === 'file_error') {
                 window.adicionarMensagemStatus(updateData, updateData.type); // Usa o formatter para erro
                 // Adiciona uma representação de erro na área de resultados
                 processarResultadoArquivo({
                     filename: updateData.filename,
                     status_final: 'Erro',
                     error_message: updateData.message,
                     file_id: updateData.file_id || null
                 });
            }

            // Fim do Lote (Sucesso ou Falha)
            if (updateData.type === 'batch_done' || updateData.type === 'batch_failed') {
                if (eventSource) eventSource.close();
                console.log(`Conexão SSE fechada (${updateData.type}).`);
                isProcessing = false;

                let quotaErrorDetected = updateData.quota_error === true;
                currentBatchHadQuotaError = quotaErrorDetected;

                 // Atualiza mensagem final no Status usando o formatter
                window.adicionarMensagemStatus(updateData, updateData.type);

                // Habilita/Desabilita botão de processar
                if (window.btnProcessar) {
                    window.btnProcessar.disabled = (window.arquivosParaEnviar.length === 0);
                }

                // Lógica para habilitar/desabilitar chat
                const chatFailed = updateData.type === 'batch_failed';
                if (window.btnEnviarChat && window.chatInput) {
                    if (chatFailed || quotaErrorDetected) {
                        window.btnEnviarChat.disabled = true;
                        window.chatInput.disabled = true;
                        window.chatInput.placeholder = chatFailed ? "Chat desabilitado (falha na análise)" : "Chat desabilitado (limite IA atingido)";
                        const systemMsg = quotaErrorDetected
                            ? "O chat foi desabilitado para este lote pois o limite de uso da IA foi atingido durante a análise."
                            : "O chat foi desabilitado pois a análise do lote falhou.";
                        window.adicionarMensagemChat("Sistema", systemMsg, 'system-message error');
                    } else { // batch_done e sem erro de cota
                        window.btnEnviarChat.disabled = false;
                        window.chatInput.disabled = false;
                        window.chatInput.placeholder = "Digite sua pergunta sobre o lote analisado...";
                        window.adicionarMensagemChat("Sistema", "Análise concluída! Pode fazer perguntas sobre os arquivos processados.", 'system-message info'); // Mudado para info
                        window.chatInput.focus();
                    }
                }

                // Habilita input de arquivo e botões de remover
                if (window.arquivoInput) window.arquivoInput.disabled = false;
                if (window.renderizarListaArquivos) window.renderizarListaArquivos();

            }
        } catch (e) {
            console.error('Erro ao processar mensagem SSE:', e, event.data);
            window.adicionarMensagemStatus(`Erro ao interpretar atualização do servidor.`, 'error');
        }
    };

    eventSource.onerror = (error) => {
        console.error('Erro na conexão EventSource:', error);
        if (isProcessing) {
            window.adicionarMensagemStatus('Erro de conexão com o servidor. A análise pode não ter sido concluída ou atualizada.', 'error');
            isProcessing = false;
            // Reabilita controles gerais
            if (window.btnProcessar) window.btnProcessar.disabled = (window.arquivosParaEnviar.length === 0);
            const enableChat = !!currentBatchId && !currentBatchHadQuotaError;
            if (window.btnEnviarChat) window.btnEnviarChat.disabled = !enableChat;
            if (window.chatInput) {
                window.chatInput.disabled = !enableChat;
                window.chatInput.placeholder = enableChat ? "Digite sua pergunta..." : "Chat indisponível";
            }
            if (window.arquivoInput) window.arquivoInput.disabled = false;
            if (window.renderizarListaArquivos) window.renderizarListaArquivos();
        }
        if(eventSource) eventSource.close();
    };
}


// Processar Arquivos (Upload) - Função Mantida
function processarArquivos(arquivosParaEnviar, initialInstruction) {
    if (!arquivosParaEnviar || arquivosParaEnviar.length === 0) {
        window.adicionarMensagemStatus('Nenhum arquivo na fila para analisar.', 'warning');
        return;
    }
     if (isProcessing) {
         window.adicionarMensagemStatus('Aguarde a análise atual terminar antes de iniciar uma nova.', 'warning');
         return;
     }

    isProcessing = true;
    currentBatchId = null;
    currentBatchHadQuotaError = false;

    // Desabilita UI
    if (window.btnProcessar) window.btnProcessar.disabled = true;
    if (window.btnEnviarChat) window.btnEnviarChat.disabled = true;
    if (window.chatInput) window.chatInput.placeholder = "Análise em andamento...";
    if (window.arquivoInput) window.arquivoInput.disabled = true;
    if (window.renderizarListaArquivos) window.renderizarListaArquivos();

    // Limpa áreas
    if (window.statusDiv) window.statusDiv.innerHTML = '';
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) resultsContainer.innerHTML = '<h2>Resultados da Análise:</h2>';

    window.adicionarMensagemStatus(`Iniciando envio e análise para ${arquivosParaEnviar.length} arquivo(s)...`, 'loading');

    if (initialInstruction) {
        if(window.chatInput) window.chatInput.value = '';
        window.adicionarMensagemStatus(`Instrução inicial fornecida: "${initialInstruction.substring(0,50)}..."`, 'info');
    }

    // Montar FormData
    const formData = new FormData();
    arquivosParaEnviar.forEach(file => formData.append('arquivo_cv', file));
    formData.append('gerar_relatorio', window.chkGerarRelatorio ? window.chkGerarRelatorio.checked : false);
    formData.append('pesquisar_web', window.chkPesquisarWeb ? window.chkPesquisarWeb.checked : false);
    if (initialInstruction) {
        formData.append('initial_instruction', initialInstruction);
    }

    // Enviar para o endpoint de Upload
    fetch('/upload', { method: 'POST', body: formData })
        .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, data })))
        .then(({ ok, status, data }) => {
            if (!ok || !data || data.error || !data.batch_id) {
                throw new Error(data?.error || `Falha no envio (Status: ${status})`);
            }
            window.adicionarMensagemStatus(`Arquivos enviados (Lote ID: ${data.batch_id}). Conectando para receber andamento...`, 'info');
            currentBatchId = data.batch_id;
            window.arquivosParaEnviar = []; // Limpa fila frontend
            if(window.renderizarListaArquivos) window.renderizarListaArquivos();
            conectarAoStream(currentBatchId);
        })
        .catch(error => {
            console.error('Erro no Upload ou resposta inicial:', error);
            window.adicionarMensagemStatus(`Falha ao iniciar análise: ${error.message}`, 'error');
            isProcessing = false; // Libera o estado
            // Reabilita UI
            if (window.btnProcessar) window.btnProcessar.disabled = (window.arquivosParaEnviar.length === 0);
            if (window.btnEnviarChat) window.btnEnviarChat.disabled = true;
            if (window.chatInput) {
                window.chatInput.disabled = true;
                window.chatInput.placeholder = "Falha ao iniciar. Recarregue ou tente novamente.";
            }
            if (window.arquivoInput) window.arquivoInput.disabled = false;
            if (window.renderizarListaArquivos) window.renderizarListaArquivos();
        });
}


// Enviar Mensagem do Chat - Função Mantida
function enviarMensagemChat() {
    if (!window.chatInput || !window.btnEnviarChat || !window.chatMessages) return;
    const mensagemUsuario = window.chatInput.value.trim();
    if (!mensagemUsuario || window.chatInput.disabled || !currentBatchId) {
        if (!currentBatchId && mensagemUsuario) {
             window.adicionarMensagemChat("Sistema", "Analise um lote de arquivos antes de fazer perguntas.", 'system-message warning');
         }
        return;
    }

    window.adicionarMensagemChat("Usuário", mensagemUsuario);
    window.chatInput.value = '';
    window.btnEnviarChat.disabled = true;
    window.adicionarMensagemChat("Assistente", "Processando sua pergunta...", 'loading'); // Classe 'loading'

    fetch('/api/chat', { // Rota do chat
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: currentBatchId, message: mensagemUsuario })
    })
    .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, data })))
    .then(({ ok, status, data }) => {
        const thinkingMsg = window.chatMessages.querySelector('.ai-message.loading');
        if (thinkingMsg) thinkingMsg.remove();

        if (!ok || !data || data.error) {
            throw new Error(data?.error || `Erro na resposta do Chat (Status: ${status})`);
        }
        window.adicionarMensagemChat("Assistente", data.reply || "[Assistente não retornou uma resposta.]");
    })
    .catch(error => {
        console.error('Erro fetch chat:', error);
        const thinkingMsg = window.chatMessages.querySelector('.ai-message.loading');
        if (thinkingMsg) thinkingMsg.remove();
        window.adicionarMensagemChat("Sistema", `Erro ao processar pergunta: ${error.message}`, 'system-message error'); // Usa o formatter que trata erros

        // Se for erro de cota, desabilita chat
        const isQuotaError = String(error.message).toLowerCase().includes("limite") || String(error.message).toLowerCase().includes("quota");
        if(isQuotaError) {
            if(window.btnEnviarChat) window.btnEnviarChat.disabled = true;
            if(window.chatInput) {
                window.chatInput.disabled = true;
                window.chatInput.placeholder = "Chat desabilitado (limite IA atingido)";
            }
            currentBatchHadQuotaError = true;
        }
    })
    .finally(() => {
        // Reabilita botão APENAS se o chat ainda deve estar ativo
         if (window.btnEnviarChat && !currentBatchHadQuotaError && currentBatchId) {
              window.btnEnviarChat.disabled = false;
              if(window.chatInput && !window.chatInput.disabled) window.chatInput.focus();
         }
    });
}


// --- Funções para manipulação de resultados de arquivo ---

// Função auxiliar para escapar HTML básico (usada em criarElementoArquivoResultado)
function escapeHTML(str) {
    if (typeof str !== 'string') return ''; // Retorna string vazia se não for string
    return str
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#039;');
}


// Criar elemento HTML para exibir o resultado de um arquivo processado (MODIFICADA)
function criarElementoArquivoResultado(fileData) {
    if (!fileData) return null;

    // Container principal
    const fileElement = document.createElement('div');
    fileElement.className = 'file-result';
    // Usa file_id se existir, senão usa nome do arquivo sanitizado + timestamp
    const elementId = fileData.file_id || (fileData.filename ? fileData.filename.replace(/[^a-zA-Z0-9]/g, '-') + '-' + Date.now() : Date.now());
    fileElement.id = `file-${elementId}`;

    // Cabeçalho (Nome do Arquivo e Botões)
    const fileHeader = document.createElement('div');
    fileHeader.className = 'file-header';
    const fileTitle = document.createElement('h3');
    fileTitle.textContent = fileData.filename || 'Arquivo Desconhecido';
    fileTitle.title = fileData.filename || '';
    fileHeader.appendChild(fileTitle);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'file-actions';

    // Botão "Ver Texto" (usando o file_id)
    if (fileData.file_id && fileData.status_final !== 'Erro') {
        const viewButton = document.createElement('button');
        viewButton.className = 'btn-view-content';
        viewButton.setAttribute('data-file-id', fileData.file_id);
        viewButton.textContent = 'Ver Texto';
        viewButton.title = 'Visualizar o texto completo extraído do arquivo';
        buttonContainer.appendChild(viewButton);
    }

    // Botão "Baixar Original" (usando o file_id)
    if (fileData.file_id) {
        const downloadButton = document.createElement('button');
        downloadButton.className = 'btn-download-original';
        downloadButton.textContent = 'Baixar';
        downloadButton.title = 'Baixar o arquivo original';
        downloadButton.onclick = () => { window.open(`/api/download-file/${fileData.file_id}`, '_blank'); };
        buttonContainer.appendChild(downloadButton);
    }
    fileHeader.appendChild(buttonContainer);
    fileElement.appendChild(fileHeader);

    // Corpo (Detalhes, Resumo Web, Status)
    const fileBody = document.createElement('div');
    fileBody.className = 'file-body';

    // Mensagem de erro específica do arquivo
    if (fileData.status_final === 'Erro' && fileData.error_message) {
        const errorSection = document.createElement('div');
        errorSection.className = 'file-error-details';
        // Usa o formatter para exibir o erro de forma amigável
        const friendlyError = window.adicionarMensagemStatus ? window.adicionarMensagemStatus({message: fileData.error_message}, 'error').textContent : escapeHTML(fileData.error_message); // Hack para pegar texto do formatter
        errorSection.innerHTML = `<h4>Falha no Processamento</h4><p class="status-error">${friendlyError || escapeHTML(fileData.error_message)}</p>`;
        fileBody.appendChild(errorSection);
    }
    // Exibe dados extraídos se não deu erro
    else if (fileData.data) {
        const detailsSection = document.createElement('div');
        detailsSection.className = 'extracted-details';
        detailsSection.innerHTML = '<h4>Informações Extraídas:</h4>';

        const detailsList = document.createElement('ul');
        let hasData = false;

        // Função interna para adicionar item à lista
        function addDetailItem(label, value, isHtml = false) {
            // Verifica se valor existe e não é vazio/nulo/undefined/[]
             if (value !== null && typeof value !== 'undefined' && String(value).trim() !== '' && (!Array.isArray(value) || value.length > 0) ) {
                const item = document.createElement('li');
                item.innerHTML = `<strong>${escapeHTML(label)}:</strong> `; // Escapa o label

                // Adiciona o valor (texto ou HTML seguro)
                if (isHtml) {
                     // Assume que o HTML já foi sanitizado ou é seguro (como o link)
                     const span = document.createElement('span');
                     span.innerHTML = value;
                     item.appendChild(span);
                } else {
                     item.appendChild(document.createTextNode(String(value))); // Adiciona como texto
                }

                detailsList.appendChild(item);
                hasData = true;
             }
        }

        // --- Exibição dos Dados Extraídos (Novos e Antigos) ---
        const data = fileData.data || {}; // Garante que data é um objeto

        addDetailItem('Nome', escapeHTML(data.nome_completo));
        addDetailItem('Email', escapeHTML(data.email));
        addDetailItem('Telefone', escapeHTML(data.telefone));
        addDetailItem('Localização', escapeHTML(data.localizacao));

        // Formata LinkedIn como link clicável
        if (data.linkedin_url && String(data.linkedin_url).startsWith('http')) {
             const escapedUrl = escapeHTML(data.linkedin_url);
             addDetailItem('LinkedIn', `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${escapedUrl}</a>`, true);
        }

        addDetailItem('Experiência (anos)', escapeHTML(data.anos_experiencia_total));
        addDetailItem('Cargo Recente', escapeHTML(data.cargo_atual_ou_ultimo));
        addDetailItem('Escolaridade Máx.', escapeHTML(data.nivel_escolaridade_max));

        // Formata lista de Habilidades Técnicas
        if (data.habilidades_tecnicas && Array.isArray(data.habilidades_tecnicas) && data.habilidades_tecnicas.length > 0) {
             const skillsText = data.habilidades_tecnicas.map(skill => escapeHTML(skill)).join(', ');
             addDetailItem('Habilidades Técnicas', skillsText);
        }

        // Formata lista de Idiomas
        if (data.idiomas && Array.isArray(data.idiomas) && data.idiomas.length > 0) {
             const languagesText = data.idiomas.map(lang => {
                 const idioma = escapeHTML(lang.idioma || '?');
                 const nivel = escapeHTML(lang.nivel || '?');
                 return `${idioma} (${nivel})`;
             }).join('; '); // Usa ponto e vírgula para separar idiomas
             addDetailItem('Idiomas', languagesText);
        }
        // --- Fim da Exibição ---

        // Adiciona a lista ou mensagem de "sem dados"
        if (hasData) {
            detailsSection.appendChild(detailsList);
        } else {
             const noDataPara = document.createElement('p');
             noDataPara.innerHTML = '<i>Nenhuma informação chave extraída automaticamente.</i>';
             detailsSection.appendChild(noDataPara);
        }
         fileBody.appendChild(detailsSection);

    } else if (fileData.status_final !== 'Erro') {
        // Caso não tenha dado erro, mas não retornou 'data'
        const noDataSection = document.createElement('div');
         noDataSection.innerHTML = '<h4>Informações Extraídas:</h4><p><i>Não foram extraídos dados estruturados deste arquivo.</i></p>';
         fileBody.appendChild(noDataSection);
    }

    // Resumo da Web (se houver)
    if (fileData.web_summary && fileData.status_final !== 'Erro') {
        const webSection = document.createElement('div');
        webSection.className = 'web-summary';
        // A string web_summary já vem formatada com "Fonte: ... Resumo: ..."
        // Apenas escapamos para segurança, mas usamos <p> e <br> para formatar
        const escapedSummary = escapeHTML(fileData.web_summary);
        const formattedSummary = escapedSummary.replace(/\n/g, '<br>'); // Troca \n por <br>
        webSection.innerHTML = `<h4>Pesquisa Web Relacionada:</h4><p>${formattedSummary}</p>`;
        fileBody.appendChild(webSection);
    }

    // Status Final (mostra se não for um erro já exibido acima)
    if (fileData.status_final && !(fileData.status_final === 'Erro' && fileData.error_message)) {
        const statusSection = document.createElement('div');
        statusSection.className = 'file-status';
        const statusClass = fileData.status_final.toLowerCase().includes('sucesso') ? 'status-success' : (fileData.status_final === 'Erro' ? 'status-error' : 'status-info');
        statusSection.innerHTML = `<strong>Status Final:</strong> <span class="${statusClass}">${escapeHTML(fileData.status_final)}</span>`;
        fileBody.appendChild(statusSection);
    }

    fileElement.appendChild(fileBody);
    return fileElement;
}


// Processar e exibir o resultado de um arquivo na UI (Função Mantida)
function processarResultadoArquivo(result) {
    if (!result) return;
    const fileElement = criarElementoArquivoResultado(result);
    if (fileElement) {
        let resultsContainer = document.getElementById('results-container');
        if (!resultsContainer) {
            console.warn("Container #results-container não encontrado, criando...");
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'results-container';
            resultsContainer.className = 'results-container';
            resultsContainer.innerHTML = '<h2>Resultados da Análise:</h2>';
            const statusSectionDiv = document.getElementById('status-section');
            const mainContainer = document.querySelector('.container');
            if (statusSectionDiv?.parentNode) {
                statusSectionDiv.parentNode.insertBefore(resultsContainer, statusSectionDiv.nextSibling);
            } else if (mainContainer) {
                mainContainer.appendChild(resultsContainer);
            } else {
                document.body.appendChild(resultsContainer);
            }
        }
        resultsContainer.appendChild(fileElement);
    }
}

// --- Funções utilitárias ---
// Monitorar conexão SSE (Função Mantida)
let reconectarTimeout = null;
function monitorarConexao() {
    setInterval(() => {
        if (isProcessing && currentBatchId && (!eventSource || eventSource.readyState !== EventSource.OPEN)) {
             if ((!eventSource || eventSource.readyState !== EventSource.CONNECTING) && !reconectarTimeout) {
                 console.warn("Conexão SSE inativa ou perdida durante processamento. Tentando reconectar em 5s...");
                 window.adicionarMensagemStatus("Conexão perdida. Tentando reconectar...", "warning");
                 reconectarTimeout = setTimeout(() => {
                     conectarAoStream(currentBatchId);
                     reconectarTimeout = null;
                 }, 5000);
             }
        } else if (reconectarTimeout && (!isProcessing || (eventSource && eventSource.readyState === EventSource.OPEN))) {
             clearTimeout(reconectarTimeout);
             reconectarTimeout = null;
        }
    }, 10000); // Verifica a cada 10 segundos
}

// --- Inicialização e Exportações ---

// Iniciar monitoramento de conexão SSE
monitorarConexao();

// Exportando funções para serem usadas por outros módulos
window.conectarAoStream = conectarAoStream;
window.processarArquivos = processarArquivos;
window.enviarMensagemChat = enviarMensagemChat;
window.isProcessing = () => isProcessing;
window.getCurrentBatchId = () => currentBatchId;

// REMOVIDO: Injeção dinâmica de CSS. Garanta que os estilos estejam no seu arquivo CSS principal.
// const styleElement = document.createElement('style');
// styleElement.textContent = `...`;
// document.head.appendChild(styleElement);

// Notificar que o módulo API foi carregado
const apiLoadedEvent = new CustomEvent('api-loaded');
document.dispatchEvent(apiLoadedEvent);

console.log("Módulo de serviços API carregado (Resultados Aprimorados)");