// api-services.js - Gerencia comunicação com o backend e estado da aplicação

// --- Variáveis para controle de estado da API ---
let eventSource = null;
let currentBatchId = null;
let isProcessing = false;
let currentBatchHadQuotaError = false; // Flag para erro de cota no lote atual

// --- Funções de comunicação com a API ---

// Conectar ao Stream SSE
function conectarAoStream(batchId) {
    // --- CORREÇÃO APLICADA AQUI (prefixo /api/) ---
    const streamUrl = `/api/stream-processing/${batchId}`;
    // ---------------------------------------------
    window.adicionarMensagemStatus(`Conectando para receber andamento da análise (stream)...`, 'info'); // Mensagem mais clara
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
         console.warn("Fechando conexão SSE anterior antes de abrir uma nova.");
         eventSource.close();
    }
    eventSource = new EventSource(streamUrl); // Cria a nova conexão

    eventSource.onopen = () => {
        console.log("Conexão SSE aberta.");
        window.adicionarMensagemStatus("Conexão estabelecida, aguardando dados...", "info");
    };

    eventSource.onmessage = (event) => {
        try {
            const updateData = JSON.parse(event.data);
            console.log('SSE Data:', updateData);

            // Adiciona ao Status (exceto resultado da instrução inicial e alguns tipos de controle)
            if(!['initial_instruction_result', 'pause', 'file_start', 'step_start', 'step_done', 'file_done', 'file_error', 'batch_done', 'batch_failed'].includes(updateData.type)) {
                // Tipos que geralmente vão para status: 'status', 'info', 'warning', 'error', 'loading' (se vierem)
                window.adicionarMensagemStatus(updateData, updateData.type || 'info');
            } else if (updateData.type === 'status' || updateData.type === 'warning' || updateData.type === 'error') {
                 // Garante que status, warning e error sempre apareçam no status
                 window.adicionarMensagemStatus(updateData, updateData.type);
            }


            // Tratar resultado da instrução inicial -> vai para o CHAT
            if (updateData.type === 'initial_instruction_result') {
                window.adicionarMensagemChat("Assistente", updateData.reply || "[Instrução inicial processada, mas IA não respondeu.]");
            }

            // Processar resultado de arquivo -> vai para a área de Resultados
            if (updateData.type === 'file_done' && updateData.result) {
                processarResultadoArquivo(updateData.result); // Função definida abaixo
                // Poderia adicionar uma mensagem de status genérica aqui também
                window.adicionarMensagemStatus(`Arquivo '${updateData.result.filename}' processado. Status: ${updateData.result.status_final}`, 'info');
            }

            // Tratar erros específicos de arquivo
            if (updateData.type === 'file_error') {
                 window.adicionarMensagemStatus(`Erro ao processar '${updateData.filename}': ${updateData.message}`, 'error');
                 // Opcional: Adicionar uma representação de erro na área de resultados
                 processarResultadoArquivo({
                     filename: updateData.filename,
                     status_final: 'Erro',
                     error_message: updateData.message,
                     file_id: updateData.file_id || null // Se o ID for enviado no erro
                 });
            }


            // Fim do Lote (Sucesso ou Falha)
            if (updateData.type === 'batch_done' || updateData.type === 'batch_failed') {
                if (eventSource) eventSource.close(); // Fecha a conexão SSE
                console.log(`Conexão SSE fechada (${updateData.type}).`);
                isProcessing = false; // Marca que o processamento acabou

                // Recupera a flag de erro de cota enviada pelo backend
                let quotaErrorDetected = updateData.quota_error === true; // Usa diretamente o valor booleano
                currentBatchHadQuotaError = quotaErrorDetected; // Atualiza estado global se necessário

                 // Atualiza mensagem final no Status
                 window.adicionarMensagemStatus(updateData.message || `Análise do lote ${updateData.type === 'batch_done' ? 'concluída' : 'falhou'}.`, updateData.type === 'batch_done' ? 'success' : 'error');


                // Habilita/Desabilita botão de processar (somente se houver arquivos na fila)
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

                        // Adiciona mensagem informativa ao chat
                        const systemMsg = quotaErrorDetected
                            ? "O chat foi desabilitado para este lote pois o limite de uso da IA foi atingido durante a análise."
                            : "O chat foi desabilitado pois a análise do lote falhou.";
                        window.adicionarMensagemChat("Sistema", systemMsg, 'system-message error');

                    } else { // batch_done e sem erro de cota
                        window.btnEnviarChat.disabled = false; // Habilita chat
                        window.chatInput.disabled = false;
                        window.chatInput.placeholder = "Digite sua pergunta sobre o lote analisado...";
                        window.adicionarMensagemChat("Sistema", "Análise concluída! Pode fazer perguntas sobre os arquivos processados.", 'system-message');
                        window.chatInput.focus(); // Foca no input do chat
                    }
                }

                // Habilita input de arquivo e botões de remover
                if (window.arquivoInput) window.arquivoInput.disabled = false;
                if (window.renderizarListaArquivos) window.renderizarListaArquivos(); // Re-renderiza para habilitar botões 'Remover'

            }
        } catch (e) {
            console.error('Erro ao processar mensagem SSE:', e, event.data);
            window.adicionarMensagemStatus(`Erro ao interpretar atualização do servidor.`, 'error');
            // Considerar fechar a conexão SSE em caso de erro grave de parse
            // if (eventSource) eventSource.close();
            // Atualizar UI para estado de erro?
        }
    };

    eventSource.onerror = (error) => {
        console.error('Erro na conexão EventSource:', error);
         // Evita mensagens duplicadas se o onmessage já tratou o fim
        if (isProcessing) { // Só mostra erro se ainda estava esperando processar
            window.adicionarMensagemStatus('Erro de conexão com o servidor. A análise pode não ter sido concluída ou atualizada.', 'error');
            isProcessing = false; // Marca que parou de processar devido ao erro

             // Reabilita controles gerais da UI para permitir nova tentativa ou upload
            if (window.btnProcessar) window.btnProcessar.disabled = (window.arquivosParaEnviar.length === 0);
            // Habilita chat apenas se um lote anterior foi concluído com sucesso e sem erro de cota
            const enableChat = !!currentBatchId && !currentBatchHadQuotaError;
            if (window.btnEnviarChat) window.btnEnviarChat.disabled = !enableChat;
            if (window.chatInput) {
                window.chatInput.disabled = !enableChat;
                 window.chatInput.placeholder = enableChat ? "Digite sua pergunta..." : "Chat indisponível";
            }
            if (window.arquivoInput) window.arquivoInput.disabled = false;
            if (window.renderizarListaArquivos) window.renderizarListaArquivos();
        }
        if(eventSource) eventSource.close(); // Garante que fechou
    };
}


// Processar Arquivos (Upload)
function processarArquivos(arquivosParaEnviar, initialInstruction) {
    if (!arquivosParaEnviar || arquivosParaEnviar.length === 0) {
        window.adicionarMensagemStatus('Nenhum arquivo na fila para analisar.', 'warning');
        return;
    }
     if (isProcessing) {
         window.adicionarMensagemStatus('Aguarde a análise atual terminar antes de iniciar uma nova.', 'warning');
         return;
     }


    isProcessing = true; // Marca início do processamento
    currentBatchId = null; // Reseta ID do lote atual
    currentBatchHadQuotaError = false; // Reseta flag de erro de cota para novo lote

    // Desabilita controles da UI
    if (window.btnProcessar) window.btnProcessar.disabled = true;
    if (window.btnEnviarChat) window.btnEnviarChat.disabled = true; // Desabilita chat durante processamento
    if (window.chatInput) {
         // Mantém habilitado para instrução inicial, mas muda placeholder
         // window.chatInput.disabled = true; // Comentado para permitir instrução
         window.chatInput.placeholder = "Análise em andamento...";
    }
    if (window.arquivoInput) window.arquivoInput.disabled = true;
    if (window.renderizarListaArquivos) window.renderizarListaArquivos(); // Re-renderiza para desabilitar botões 'Remover'

    // Limpa áreas de status e resultados anteriores
    if (window.statusDiv) window.statusDiv.innerHTML = '';
    const resultsContainer = document.getElementById('results-container');
    if (resultsContainer) resultsContainer.innerHTML = '<h2>Resultados da Análise:</h2>'; // Limpa resultados antigos, mantém título

    window.adicionarMensagemStatus(`Iniciando envio e análise para ${arquivosParaEnviar.length} arquivo(s)...`, 'loading');

    // Se houver instrução inicial, limpa o input e loga no status
    if (initialInstruction) {
        if(window.chatInput) window.chatInput.value = '';
        window.adicionarMensagemStatus(`Instrução inicial fornecida: "${initialInstruction.substring(0,50)}..."`, 'info');
        // Opcional: Adicionar instrução ao histórico do chat como "Usuário"
        // window.adicionarMensagemChat("Instrução Inicial", initialInstruction);
    }

    // Montar FormData para envio
    const formData = new FormData();
    arquivosParaEnviar.forEach(file => formData.append('arquivo_cv', file)); // Nome do campo esperado pelo backend
    // Adiciona flags baseadas nos checkboxes (verifica se existem)
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
                // Trata erro vindo do backend ou resposta inesperada
                throw new Error(data?.error || `Falha no envio (Status: ${status})`);
            }
            // Sucesso no upload, agora conecta ao stream
            window.adicionarMensagemStatus(`Arquivos enviados (Lote ID: ${data.batch_id}). Conectando para receber andamento...`, 'info');
            currentBatchId = data.batch_id; // Guarda o ID do lote atual
            window.arquivosParaEnviar = []; // Limpa a fila de arquivos do frontend
            if(window.renderizarListaArquivos) window.renderizarListaArquivos(); // Atualiza a UI da fila (vazia)
            conectarAoStream(currentBatchId); // Conecta ao SSE para receber atualizações
        })
        .catch(error => {
            // Trata erros de rede ou erros lançados no .then()
            console.error('Erro no Upload ou resposta inicial:', error);
            window.adicionarMensagemStatus(`Falha ao iniciar análise: ${error.message}`, 'error');
            isProcessing = false; // Libera o estado de processamento
            // Reabilita controles da UI
            if (window.btnProcessar) window.btnProcessar.disabled = (window.arquivosParaEnviar.length === 0);
            // Não habilita chat aqui, pois nenhum lote foi processado
            if (window.btnEnviarChat) window.btnEnviarChat.disabled = true;
            if (window.chatInput) {
                window.chatInput.disabled = true; // Mantém desabilitado
                 window.chatInput.placeholder = "Falha ao iniciar. Recarregue ou tente novamente.";
            }
            if (window.arquivoInput) window.arquivoInput.disabled = false;
            if (window.renderizarListaArquivos) window.renderizarListaArquivos(); // Habilita botões de remover se houver arquivos
        });
}


// Enviar Mensagem do Chat
function enviarMensagemChat() {
    // Verifica se os elementos do chat existem e se a função pode ser executada
    if (!window.chatInput || !window.btnEnviarChat || !window.chatMessages) {
         console.error("Elementos do chat não encontrados.");
         return;
    }
    const mensagemUsuario = window.chatInput.value.trim();

    // Não envia se vazio, desabilitado, ou se não há lote processado
    if (!mensagemUsuario || window.chatInput.disabled || !currentBatchId) {
         if (!currentBatchId && mensagemUsuario) {
            window.adicionarMensagemChat("Sistema", "Analise um lote de arquivos antes de fazer perguntas.", 'system-message warning');
         }
         return;
    }

    // Adiciona mensagem do usuário à UI e limpa input
    window.adicionarMensagemChat("Usuário", mensagemUsuario);
    window.chatInput.value = '';
    window.btnEnviarChat.disabled = true; // Desabilita enquanto espera resposta
    // Adiciona mensagem de "pensando..."
    window.adicionarMensagemChat("Assistente", "Processando sua pergunta...", 'loading'); // Usa classe 'loading'

    // Envia para o endpoint de Chat
    fetch('/api/chat', { // <<< Assume que a rota do chat também está sob /api/
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: currentBatchId, message: mensagemUsuario })
    })
    .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, data })))
    .then(({ ok, status, data }) => {
        // Remove a mensagem "Processando..." antes de adicionar a resposta real
        const thinkingMsg = window.chatMessages.querySelector('.ai-message.loading'); // Seleciona pela classe 'loading'
        if (thinkingMsg) thinkingMsg.remove();

        if (!ok || !data || data.error) {
             // Trata erro específico retornado pelo backend
            throw new Error(data?.error || `Erro na resposta do Chat (Status: ${status})`);
        }
        // Adiciona a resposta da IA
        window.adicionarMensagemChat("Assistente", data.reply || "[Assistente não retornou uma resposta.]");
    })
    .catch(error => {
        console.error('Erro fetch chat:', error);
        // Remove a mensagem "Processando..." se ainda existir
        const thinkingMsg = window.chatMessages.querySelector('.ai-message.loading');
        if (thinkingMsg) thinkingMsg.remove();

        // Adiciona mensagem de erro ao chat
        window.adicionarMensagemChat("Sistema", `Erro ao processar pergunta: ${error.message}`, 'system-message error');

        // Se o erro indicar limite de cota, desabilita o chat permanentemente para este lote
        const isQuotaError = String(error.message).toLowerCase().includes("limite");
        if(isQuotaError) {
            window.btnEnviarChat.disabled = true;
            window.chatInput.disabled = true;
            window.chatInput.placeholder = "Chat desabilitado (limite IA atingido)";
            currentBatchHadQuotaError = true; // Marca que houve erro de cota
        }
    })
    .finally(() => {
        // Reabilita o botão de enviar APENAS se o chat não foi desabilitado por erro/cota
        if (window.btnEnviarChat && !window.btnEnviarChat.disabled) {
            // Verifica se ainda deve estar habilitado (sem erro de cota ou falha)
            if(!currentBatchHadQuotaError && currentBatchId) { // Verifica se o lote atual permite chat
                 window.btnEnviarChat.disabled = false;
                 if(window.chatInput) window.chatInput.focus(); // Foca no input novamente
            }
        }
    });
}


// --- Funções para manipulação de resultados de arquivo ---

// Criar elemento HTML para exibir o resultado de um arquivo processado
function criarElementoArquivoResultado(fileData) {
    if (!fileData) return null;

    // Cria o container principal para o resultado do arquivo
    const fileElement = document.createElement('div');
    fileElement.className = 'file-result'; // Classe para estilização geral
     // Adiciona ID para referência futura, se necessário
    fileElement.id = `file-${fileData.file_id || Date.now()}`; // Usa timestamp como fallback se ID faltar

    // --- Cabeçalho do Resultado (Nome do Arquivo e Botões) ---
    const fileHeader = document.createElement('div');
    fileHeader.className = 'file-header'; // Classe para estilizar o cabeçalho

    // Título (Nome do arquivo)
    const fileTitle = document.createElement('h3');
    fileTitle.textContent = fileData.filename || 'Arquivo Desconhecido';
    fileTitle.title = fileData.filename || ''; // Tooltip com nome completo
    fileHeader.appendChild(fileTitle);

    // Container para os botões (para melhor layout)
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'file-actions'; // Classe para estilizar botões

    // Botão "Ver Conteúdo Completo" (se houver file_id)
    if (fileData.file_id && fileData.status_final !== 'Erro') { // Só mostra se não deu erro e tem ID
        const viewButton = document.createElement('button');
        viewButton.className = 'btn-view-content'; // Classe importante para o listener em ui-core.js
        viewButton.setAttribute('data-file-id', fileData.file_id); // Guarda o ID no botão
        viewButton.textContent = 'Ver Texto'; // Texto mais curto
        viewButton.title = 'Visualizar o texto completo extraído do arquivo';
        buttonContainer.appendChild(viewButton);
    }

    // Botão "Baixar Original" (se houver file_id)
    if (fileData.file_id) {
        const downloadButton = document.createElement('button');
        downloadButton.className = 'btn-download-original'; // Classe para estilização
        downloadButton.textContent = 'Baixar'; // Texto mais curto
        downloadButton.title = 'Baixar o arquivo original';
        // Abre a URL de download em nova aba ao clicar
        downloadButton.onclick = () => { window.open(`/api/download-file/${fileData.file_id}`, '_blank'); };
        buttonContainer.appendChild(downloadButton);
    }
    fileHeader.appendChild(buttonContainer); // Adiciona container de botões ao header
    fileElement.appendChild(fileHeader); // Adiciona o header completo ao elemento principal

    // --- Corpo do Resultado (Detalhes, Resumo Web, Status) ---
    const fileBody = document.createElement('div');
    fileBody.className = 'file-body'; // Classe para estilizar corpo

    // Mensagem de erro (se houver)
     if (fileData.status_final === 'Erro' && fileData.error_message) {
        const errorSection = document.createElement('div');
        errorSection.className = 'file-error-details';
        errorSection.innerHTML = `<h4>Falha no Processamento</h4><p class="status-error">${fileData.error_message}</p>`;
        fileBody.appendChild(errorSection);
    }
    // Detalhes extraídos (se houver e não deu erro)
    else if (fileData.data) {
        const detailsSection = document.createElement('div');
        detailsSection.className = 'extracted-details';
        detailsSection.innerHTML = '<h4>Informações Extraídas:</h4>'; // Título da seção

        const detailsList = document.createElement('ul');
        const fieldsToDisplay = [
            {key: 'nome_completo', label: 'Nome'}, {key: 'email', label: 'Email'},
            {key: 'telefone', label: 'Telefone'}, {key: 'resumo', label: 'Resumo'},
            {key: 'skills', label: 'Habilidades'}, {key: 'experiencia', label: 'Experiência'}
        ];

        let hasData = false; // Flag para verificar se algum dado foi realmente adicionado
        fieldsToDisplay.forEach(field => {
            // Verifica se a chave existe e não é vazia/nula
            if (fileData.data[field.key] && String(fileData.data[field.key]).trim()) {
                const item = document.createElement('li');
                // Sanitiza o conteúdo antes de inserir como HTML (exemplo básico)
                const sanitizedValue = String(fileData.data[field.key])
                                        .replace(/&/g, '&amp;')
                                        .replace(/</g, '&lt;')
                                        .replace(/>/g, '&gt;');
                item.innerHTML = `<strong>${field.label}:</strong> ${sanitizedValue}`;
                detailsList.appendChild(item);
                hasData = true;
            }
        });

        // Adiciona a lista apenas se contiver algum item
        if (hasData) {
             detailsSection.appendChild(detailsList);
             fileBody.appendChild(detailsSection);
        } else {
             detailsSection.innerHTML += '<p><i>Nenhuma informação chave extraída automaticamente.</i></p>';
             fileBody.appendChild(detailsSection);
        }

    } else if (fileData.status_final !== 'Erro') {
         // Se não deu erro mas não tem dados (ex: arquivo vazio)
         const noDataSection = document.createElement('div');
         noDataSection.innerHTML = '<h4>Informações Extraídas:</h4><p><i>Não foram extraídos dados estruturados deste arquivo.</i></p>';
         fileBody.appendChild(noDataSection);
    }


    // Resumo da Web (se houver e não deu erro)
    if (fileData.web_summary && fileData.status_final !== 'Erro') {
        const webSection = document.createElement('div');
        webSection.className = 'web-summary'; // Classe para estilização
        const sanitizedSummary = String(fileData.web_summary)
                                    .replace(/&/g, '&amp;')
                                    .replace(/</g, '&lt;')
                                    .replace(/>/g, '&gt;');
        webSection.innerHTML = `<h4>Pesquisa Web Relacionada:</h4><p>${sanitizedSummary}</p>`;
        fileBody.appendChild(webSection);
    }

    // Status Final (mostra mesmo em caso de erro, se não foi mostrado antes)
     if (fileData.status_final && !(fileData.status_final === 'Erro' && fileData.error_message)) {
         const statusSection = document.createElement('div');
         statusSection.className = 'file-status'; // Classe para estilização
         const statusClass = fileData.status_final.includes('Sucesso') ? 'status-success' : 'status-error'; // Define classe CSS baseada no status
         statusSection.innerHTML = `<strong>Status Final:</strong> <span class="${statusClass}">${fileData.status_final}</span>`;
         fileBody.appendChild(statusSection);
     }


    fileElement.appendChild(fileBody); // Adiciona o corpo ao elemento principal

    return fileElement; // Retorna o elemento HTML completo para este arquivo
}


// Processar e exibir o resultado de um arquivo na UI
function processarResultadoArquivo(result) {
    if (!result) return;

    // Cria o elemento HTML para o resultado do arquivo
    const fileElement = criarElementoArquivoResultado(result);

    // Adiciona o elemento ao container de resultados no DOM
    if (fileElement) {
        let resultsContainer = document.getElementById('results-container');
        // Se o container não existe, cria-o dinamicamente
        if (!resultsContainer) {
            console.warn("Container #results-container não encontrado, criando...");
            resultsContainer = document.createElement('div');
            resultsContainer.id = 'results-container';
            resultsContainer.className = 'results-container'; // Classe para estilização
            resultsContainer.innerHTML = '<h2>Resultados da Análise:</h2>'; // Adiciona título

            // Tenta inserir após a seção de status, senão no final do .container ou body
            const statusSectionDiv = document.getElementById('status-section');
            const mainContainer = document.querySelector('.container');
            if (statusSectionDiv?.parentNode) {
                statusSectionDiv.parentNode.insertBefore(resultsContainer, statusSectionDiv.nextSibling);
            } else if (mainContainer) {
                mainContainer.appendChild(resultsContainer);
            } else {
                document.body.appendChild(resultsContainer); // Último recurso
            }
        }

        // Adiciona o elemento de resultado do arquivo ao container
        resultsContainer.appendChild(fileElement);
    }
}


// --- Funções utilitárias ---

// Verificação de status da API (exemplo, não usado ativamente no fluxo principal)
// function verificarConexao() {
//     return fetch('/api/status') // Assume endpoint /api/status existe
//         .then(response => response.ok)
//         .catch(() => false);
// }

// Monitorar conexão SSE e tentar reconectar se cair durante processamento ativo
let reconectarTimeout = null; // Controle para evitar múltiplas tentativas rápidas
function monitorarConexao() {
    setInterval(() => {
        // Verifica se está processando, tem um ID de lote, e a conexão SSE não está aberta (OPEN = 1)
        if (isProcessing && currentBatchId && (!eventSource || eventSource.readyState !== EventSource.OPEN)) {
             // Verifica também se não está tentando conectar (CONNECTING = 0) e se não há timeout pendente
            if ((!eventSource || eventSource.readyState !== EventSource.CONNECTING) && !reconectarTimeout) {
                console.warn("Conexão SSE inativa ou perdida durante processamento. Tentando reconectar em 5s...");
                window.adicionarMensagemStatus("Conexão perdida. Tentando reconectar...", "warning");
                // Define um timeout para tentar reconectar após um pequeno intervalo
                reconectarTimeout = setTimeout(() => {
                    conectarAoStream(currentBatchId); // Tenta reconectar
                    reconectarTimeout = null; // Limpa o controle de timeout
                }, 5000); // Tenta reconectar após 5 segundos
            }
        } else if (reconectarTimeout && (!isProcessing || (eventSource && eventSource.readyState === EventSource.OPEN))) {
             // Se a conexão voltou ou o processamento parou, cancela a tentativa de reconexão
             clearTimeout(reconectarTimeout);
             reconectarTimeout = null;
        }
    }, 10000); // Verifica o estado da conexão a cada 10 segundos
}


// --- Inicialização e Exportações ---

// Iniciar monitoramento de conexão SSE
monitorarConexao();

// Exportando funções para serem usadas por outros módulos (ui-core.js)
window.conectarAoStream = conectarAoStream; // Necessário para iniciar após upload
window.processarArquivos = processarArquivos; // Chamado pelo botão em ui-core.js
window.enviarMensagemChat = enviarMensagemChat; // Chamado pelo chat em ui-core.js
window.isProcessing = () => isProcessing; // Usado para desabilitar botões em ui-core.js
window.getCurrentBatchId = () => currentBatchId; // Usado pelo chat

// Funções internas não precisam ser exportadas globalmente, a menos que outro módulo precise delas
// window.criarElementoArquivoResultado = criarElementoArquivoResultado;
// window.processarResultadoArquivo = processarResultadoArquivo;


// --- Adicionar estilos CSS dinamicamente (Mantido como estava) ---
const styleElement = document.createElement('style');
styleElement.textContent = `
    /* Estilos para results-container, file-result, file-header, file-body, etc. */
    /* Cole aqui os estilos CSS que você tinha antes para esses elementos, */
    /* garantindo que as classes usadas em criarElementoArquivoResultado */
    /* (como .file-result, .file-header, .file-body, .file-actions, */
    /* .extracted-details, .web-summary, .file-status, .status-success, */
    /* .status-error, .btn-view-content, .btn-download-original) */
    /* estejam definidas. */

    /* Exemplo básico (adapte com seus estilos anteriores): */
     .results-container { margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px; }
     .results-container h2 { margin-bottom: 15px; font-size: 1.3em; color: #333; }
     .file-result { margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
     .file-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px; }
     .file-header h3 { margin: 0; font-size: 1.1em; color: #222; word-break: break-all; flex-grow: 1; min-width: 150px; /* Evita espremer muito */ }
     .file-actions { display: flex; gap: 8px; flex-shrink: 0; }
     .file-actions button { padding: 6px 12px; font-size: 0.85em; border: none; border-radius: 4px; cursor: pointer; color: white; transition: background-color 0.2s ease; white-space: nowrap; }
     .btn-view-content { background-color: #28a745; } .btn-view-content:hover { background-color: #218838; }
     .btn-download-original { background-color: #007bff; } .btn-download-original:hover { background-color: #0056b3; }
     .file-body { font-size: 0.9em; line-height: 1.6; color: #555; }
     .file-body h4 { margin: 15px 0 8px; font-size: 1em; color: #333; border-bottom: 1px dotted #ccc; padding-bottom: 4px; }
     .extracted-details ul { list-style: none; padding-left: 0; margin: 5px 0 10px; }
     .extracted-details li { margin-bottom: 6px; word-wrap: break-word; }
     .extracted-details li strong { color: #111; margin-right: 5px; }
     .web-summary { margin-top: 15px; padding: 12px; background-color: #f0f5ff; border-left: 4px solid #007bff; border-radius: 4px; }
     .web-summary p { margin: 5px 0 0 0; white-space: pre-wrap; }
     .file-status { margin-top: 15px; font-weight: bold; }
     .status-success { color: #28a745; }
     .status-error { color: #dc3545; }
     .file-error-details p { margin: 5px 0; }

`;
document.head.appendChild(styleElement);


// --- CORREÇÃO ANTERIOR MANTIDA ---
// Notificar que o módulo API foi carregado (importante para main.js)
const apiLoadedEvent = new CustomEvent('api-loaded');
document.dispatchEvent(apiLoadedEvent);
// ----------------------------------

console.log("Módulo de serviços API carregado (com correções aplicadas)");