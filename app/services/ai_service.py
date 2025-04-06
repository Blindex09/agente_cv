# -*- coding: utf-8 -*-
import os
import json
import time # Import time não utilizado no código visível, mas pode ser usado em outras partes
import logging
from werkzeug.utils import secure_filename
from flask import current_app
from app.config import get_modelo_gemini, NOME_MODELO_GEMMA # Assume que essas importações existem e funcionam
import google.generativeai as genai
from google.api_core import exceptions as api_exceptions

# --- Função Modificada para Extrair Mais Dados ---
def extrair_dados_com_ia(texto_cv):
    """
    Extrai dados estruturados de um CV usando o modelo Gemma,
    incluindo informações de contato, experiência, educação e habilidades.
    """
    client = get_modelo_gemini()
    if not client:
        return None, "Cliente GenAI não configurado", False

    quota_error = False
    response = None # Inicializa response

    try:
        # Prompt atualizado para solicitar mais campos no JSON
        prompt = f"""Analise o currículo abaixo e extraia as seguintes informações em formato JSON:
 - nome_completo: Nome completo do candidato.
 - email: Endereço de e-mail principal.
 - telefone: Número de telefone principal.
 - localizacao: Cidade e Estado (ou País) de residência atual. Extrair apenas se mencionado explicitamente. (string ou null)
 - linkedin_url: URL completa do perfil LinkedIn, se disponível. (string ou null)
 - anos_experiencia_total: Calcule o número total aproximado de anos de experiência profissional com base nas datas fornecidas. Retorne um número ou null se não for possível calcular. (number ou null)
 - cargo_atual_ou_ultimo: O cargo mais recente mencionado. (string ou null)
 - nivel_escolaridade_max: O nível de educação mais alto concluído (Ex: Médio, Técnico, Graduação, Pós-graduação, Mestrado, Doutorado). (string ou null)
 - habilidades_tecnicas: Uma lista [array] das 5-10 principais habilidades técnicas (ferramentas, softwares, linguagens) mencionadas. (array de strings ou [])
 - idiomas: Uma lista [array] de objetos, cada um com "idioma" e "nivel" (Ex: Básico, Intermediário, Avançado, Fluente, Nativo), se mencionados. (array de objetos ou [])

INSTRUÇÕES DETALHADAS DE FORMATAÇÃO E EXTRAÇÃO:
 - Retorne APENAS o JSON válido, sem nenhum texto antes ou depois, e sem usar blocos de código markdown (```json ... ```).
 - Se uma informação não for encontrada ou não aplicável, use o valor JSON null (para strings/numeros) ou uma lista vazia [] (para arrays).
 - Para 'anos_experiencia_total', faça o melhor cálculo possível; se as datas forem ambíguas ou ausentes, retorne null.
 - Para 'habilidades_tecnicas', foque nas mais relevantes e repetidas.
 - Para 'idiomas', extraia apenas se o nível de proficiência também for mencionado.
 - Formate o texto de forma simples, sem usar marcadores Markdown desnecessários dentro dos valores do JSON.
--- CV ---
{texto_cv}
--- FIM CV ---"""

        logging.info("Enviando solicitação IA (extração de dados aprimorada)...")
        # Usar GenerativeModel em vez de generate_content diretamente
        model = genai.GenerativeModel(NOME_MODELO_GEMMA)
        response = model.generate_content(prompt)

        # Adiciona log da resposta bruta para depuração
        raw_text = getattr(response, 'text', '')
        logging.debug(f"Resposta bruta da IA (extração): {raw_text[:500]}...") # Loga os primeiros 500 chars

        # Limpeza da resposta - tentar remover markdown e espaços
        resposta_limpa = raw_text.strip().lstrip('```json').lstrip('```').rstrip('```').strip()

        # Tenta carregar o JSON
        dados_extraidos = json.loads(resposta_limpa)

        # Validação básica (opcional, mas útil)
        if not isinstance(dados_extraidos, dict):
             raise ValueError("Resposta da IA não é um dicionário JSON.")
        if dados_extraidos.get("nome_completo") is None:
            logging.warning("IA não extraiu 'nome_completo', mas processamento continua.")
        else:
            logging.info("JSON da extração IA interpretado com sucesso!")

        return dados_extraidos, "Dados extraídos com sucesso (versão aprimorada).", quota_error

    except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e:
        logging.error(f"Erro na API GenAI (extração): {e}", exc_info=True)
        quota_error = "quota" in str(e).lower() or "rate limit" in str(e).lower()
        msg_erro = "Erro de Cota da API (extração)" if quota_error else f"Erro na API (extração): {e}"
        return None, msg_erro, quota_error

    except (json.JSONDecodeError, ValueError) as e_json: # Captura ValueError também
        logging.error(f"Erro ao decodificar ou validar JSON: {e_json}. Resposta limpa: '{resposta_limpa[:200]}...'", exc_info=True)
        # Verifica se a resposta original parecia JSON
        resp_text = getattr(response, 'text', '') # Acesso seguro ao atributo text
        if resp_text and not resp_text.strip().startswith('{'):
            logging.warning(f"Resposta bruta da IA não parecia JSON válido: {resp_text[:200]}...")
            msg_erro = "Erro: Resposta da IA (extração) não estava em formato JSON."
        else:
             msg_erro = f"Erro no formato da resposta JSON: {e_json}"
        return None, msg_erro, quota_error

    except Exception as e_geral:
        logging.error(f"Erro geral na extração: {e_geral}", exc_info=True)
        return None, f"Erro geral inesperado na extração: {e_geral}", quota_error

# --- Função Modificada para Gerar Relatório Usando Mais Dados ---
def gerar_e_salvar_relatorio(dados_json, texto_cv_completo, nome_arquivo_original, batch_folder):
    """
    Gera um relatório resumido em TXT baseado no CV, utilizando os dados
    estruturados extraídos (incluindo os campos adicionais) e salva em arquivo.
    """
    client = get_modelo_gemini()
    if not client:
        return False, "Cliente GenAI não configurado (relatório)", False
    if not texto_cv_completo:
        # Pode ser interessante tentar gerar relatório apenas com dados_json se existirem
        logging.warning("Texto CV completo não disponível para gerar relatório.")
        # return False, "Texto CV não disponível (relatório)", False # Comentado para permitir gerar com dados_json
    if not dados_json:
        logging.error("Dados JSON não disponíveis para gerar relatório.")
        return False, "Dados JSON não disponíveis (relatório)", False

    logging.info(f"Gerando relatório aprimorado para: {nome_arquivo_original}")
    quota_error = False
    resp = None # Inicializa resp

    try:
        # Extrai todos os dados do JSON (com valores padrão)
        nome = dados_json.get('nome_completo', 'N/E')
        email = dados_json.get('email', 'N/E')
        telefone = dados_json.get('telefone', 'N/E')
        localizacao = dados_json.get('localizacao', 'N/E')
        linkedin = dados_json.get('linkedin_url', 'N/E')
        anos_exp = dados_json.get('anos_experiencia_total', 'N/E')
        cargo_recente = dados_json.get('cargo_atual_ou_ultimo', 'N/E')
        escolaridade = dados_json.get('nivel_escolaridade_max', 'N/E')
        habilidades = dados_json.get('habilidades_tecnicas', []) # Default lista vazia
        idiomas_lista = dados_json.get('idiomas', []) # Default lista vazia

        # Formata listas para string
        habilidades_str = ", ".join(habilidades) if habilidades else "N/E"
        idiomas_str = ", ".join([f"{lang.get('idioma', '?')} ({lang.get('nivel', '?')})" for lang in idiomas_lista]) if idiomas_lista else "N/E"

        # Prompt atualizado para incluir os dados extraídos
        prompt = f"""Baseado nos DADOS EXTRAÍDOS abaixo e no CV completo (se disponível), gere um RELATÓRIO RESUMIDO E OBJETIVO em formato TXT para um recrutador avaliar rapidamente o candidato '{nome}'.

DADOS EXTRAÍDOS DO CV:
- Nome Completo: {nome}
- Email: {email}
- Telefone: {telefone}
- Localização: {localizacao}
- LinkedIn: {linkedin}
- Anos de Experiência (Aprox.): {anos_exp}
- Cargo Mais Recente: {cargo_recente}
- Nível Escolaridade Máximo: {escolaridade}
- Habilidades Técnicas Chave: {habilidades_str}
- Idiomas: {idiomas_str}

--- CV COMPLETO (Use como referência principal para o conteúdo do relatório) ---
{texto_cv_completo if texto_cv_completo else "CV completo não fornecido, baseie-se nos dados extraídos."}
--- FIM CV COMPLETO ---

Instruções para o Relatório de Saída (FORMATO TXT):
- Crie um resumo de 3-5 linhas destacando os pontos fortes e a adequação geral (se possível inferir).
- Liste as principais experiências profissionais de forma concisa (Cargo, Empresa, Breve Descrição).
- Mencione a formação principal.
- Liste as habilidades técnicas mais relevantes mencionadas nos DADOS EXTRAÍDOS.
- Mencione os idiomas listados nos DADOS EXTRAÍDOS.
- **NÃO USE NENHUM TIPO DE MARKDOWN** (sem negrito, itálico, *, #, etc.).
- Use apenas "- " no início de cada item de lista, se precisar criar listas.
- Mantenha o texto limpo, profissional e fácil de ler em um arquivo .txt simples.
"""

        logging.info("Enviando solicitação IA (relatório aprimorado)...")
        # Usar GenerativeModel
        model = genai.GenerativeModel(NOME_MODELO_GEMMA)
        resp = model.generate_content(prompt)
        texto_relatorio = resp.text.strip() # Limpa espaços extras da resposta

        # Define o nome e caminho do arquivo de relatório
        base_name = os.path.splitext(secure_filename(nome_arquivo_original))[0]
        # Garante que a config tem a chave, senão usa um padrão
        nome_base_relatorio = current_app.config.get('nome_arquivo_relatorio_saida_base', 'Relatorio_CV')
        nome_arquivo_relatorio = f"{nome_base_relatorio}_{base_name}.txt"
        caminho_relatorio = os.path.join(batch_folder, nome_arquivo_relatorio)

        logging.info(f"Salvando relatório em '{caminho_relatorio}'...")
        with open(caminho_relatorio, 'w', encoding='utf-8') as f:
            f.write(texto_relatorio)

        logging.info("Relatório aprimorado salvo.")
        return True, f"Relatório salvo como {nome_arquivo_relatorio}", quota_error

    except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e:
        logging.error(f"Erro na API GenAI (relatório): {e}", exc_info=True)
        quota_error = "quota" in str(e).lower() or "rate limit" in str(e).lower()
        msg_erro = "Erro de Cota da API (relatório)" if quota_error else f"Erro na API (relatório): {e}"
        return False, msg_erro, quota_error

    except Exception as e:
        logging.error(f"Erro ao gerar/salvar relatório aprimorado: {e}", exc_info=True)
        # Tenta obter texto da resposta para depuração, mesmo em erro
        resp_text = getattr(resp, 'text', '') # Acesso seguro
        if not resp_text:
             msg_erro = "Erro ao processar resposta da IA (relatório - resposta vazia ou erro antes da resposta)"
        else:
            # Pode logar parte da resposta aqui se ajudar
            logging.debug(f"Texto parcial da IA (relatório) antes do erro geral: {resp_text[:200]}...")
            msg_erro = f"Erro geral ao gerar/salvar relatório: {e}"
        return False, msg_erro, quota_error


# --- Funções de Chat (Permanecem Iguais ao Original) ---

def processar_instrucao_inicial(batch_id, initial_instruction, resultados_dict):
    """Processa uma instrução inicial após o processamento do lote usando Gemma 3"""
    client = get_modelo_gemini()
    if not client:
        return "Cliente GenAI não configurado para instrução inicial", False

    contexto_cvs = ""
    valid_cv_count = 0

    # Assume que resultados_dict tem a estrutura esperada
    for res_data in resultados_dict.values():
        if res_data.get('status_final','').startswith('Sucesso') and res_data.get('texto_completo'):
            valid_cv_count += 1
            contexto_cvs += f"\n--- CURRÍCULO {valid_cv_count} ({res_data.get('filename','?')}) ---\n{res_data['texto_completo'][:15000]}\n--- FIM CURRÍCULO {valid_cv_count} ---\n"

    if valid_cv_count == 0:
        return "Instrução inicial não processada: Nenhum CV válido no lote.", False

    prompt_chat = f"""Você é um assistente de RH...
INSTRUÇÕES DE FORMATAÇÃO:
- Use texto simples sem marcadores Markdown desnecessários
- Para listas, use apenas "- " no início de cada item (sem asteriscos adicionais)
- Não use formatos especiais para negrito ou itálico
- Mantenha o texto limpo e fácil de ler

CURRÍCULOS:
{contexto_cvs}

PERGUNTA INICIAL:
{initial_instruction}

RESPOSTA:""" # Prompt original mantido

    try:
        logging.info(f"Chamando IA Instrução Inicial Batch {batch_id}...")
        # Usar GenerativeModel em vez de generate_content diretamente
        model = genai.GenerativeModel(NOME_MODELO_GEMMA)
        response = model.generate_content(prompt_chat)
        ai_reply = response.text.strip()
        logging.info("Resposta Instrução Inicial IA recebida.")
        return ai_reply, False # Retorna (resposta, quota_error=False)
    except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e:
        logging.error(f"Erro IA instrução inicial: {e}", exc_info=True)
        is_quota_error = "quota" in str(e).lower() or "rate limit" in str(e).lower()
        msg = "Erro de Cota da API (instrução inicial)" if is_quota_error else f"Erro na API (instrução inicial): {e}"
        return msg, is_quota_error # Retorna (mensagem_erro, quota_error)
    except Exception as e_initial_chat:
        logging.error(f"Erro IA instrução inicial: {e_initial_chat}", exc_info=True)
        return "Erro ao processar instrução inicial.", False # Retorna (mensagem_erro, quota_error=False)

def processar_mensagem_chat(batch_id, user_message, resultados_texto_cv, historico_chat):
    """Processa uma mensagem de chat do usuário usando Gemma 3"""
    client = get_modelo_gemini()
    if not client:
        # Retorna (None como resposta, Mensagem de erro, quota_error=False)
        return None, "Cliente GenAI não configurado para chat", False

    contexto_cvs = ""
    # Assume que resultados_texto_cv é uma lista de dicts
    for i, cv_info in enumerate(resultados_texto_cv):
        # Verifica se cv_info é um dicionário e tem as chaves esperadas
        if isinstance(cv_info, dict) and 'original_name' in cv_info and 'texto_completo' in cv_info:
             contexto_cvs += f"\n--- CURRÍCULO {i+1} ({cv_info['original_name']}) ---\n{cv_info['texto_completo'][:15000]}\n--- FIM CURRÍCULO {i+1} ---\n"
        else:
             logging.warning(f"Item inválido encontrado em resultados_texto_cv no índice {i}")


    # Formatar histórico (assume que historico_chat é lista de dicts com chaves corretas)
    prompt_history = ""
    try:
        prompt_history = "\n".join([f"Usuário: {h['user_message']}\nAssistente: {h['model_reply']}" for h in reversed(historico_chat)])
    except (TypeError, KeyError) as e_hist:
         logging.warning(f"Erro ao formatar histórico do chat: {e_hist}. Histórico pode estar incompleto no prompt.")
         # Continua sem o histórico ou com parte dele

    # Montar prompt completo
    prompt_chat = f"""Você é um assistente de RH...
INSTRUÇÕES DE FORMATAÇÃO:
- Use texto simples sem marcadores Markdown desnecessários
- Para listas, use apenas "- " no início do item (sem asteriscos adicionais)
- Não use formatos especiais para negrito ou itálico
- Mantenha respostas limpas e fáceis de ler

HISTÓRICO DA CONVERSA RECENTE (se houver):
{prompt_history}

CURRÍCULOS EM CONTEXTO:
{contexto_cvs}

PERGUNTA ATUAL DO USUÁRIO:
{user_message}

RESPOSTA DO ASSISTENTE:""" # Prompt original mantido

    try:
        logging.info(f"Chamando IA Chat Batch {batch_id}...")
        # Usar GenerativeModel
        model = genai.GenerativeModel(NOME_MODELO_GEMMA)
        response = model.generate_content(prompt_chat)
        ai_reply = response.text.strip()

        if not ai_reply:
            logging.warning("IA retornou resposta vazia para o chat.")
            # Retorna (None como resposta, Mensagem de erro, quota_error=False)
            return None, "A IA não forneceu uma resposta desta vez.", False

        # Retorna (Resposta da IA, None como msg de erro, quota_error=False)
        return ai_reply, None, False
    except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e:
        logging.error(f"Erro IA Chat Batch {batch_id}: {e}", exc_info=True)
        is_quota_error = "quota" in str(e).lower() or "rate limit" in str(e).lower()
        msg = "Limite de uso da IA atingido. Tente novamente mais tarde." if is_quota_error else f"Erro na API do chat: {e}"
        # Retorna (None como resposta, Mensagem de erro, quota_error)
        return None, msg, is_quota_error
    except Exception as e_chat_ia:
        logging.error(f"Erro IA Chat Batch {batch_id}: {e_chat_ia}", exc_info=True)
        # Retorna (None como resposta, Mensagem de erro, quota_error=False)
        return None, "Ocorreu um erro inesperado ao comunicar com a IA.", False