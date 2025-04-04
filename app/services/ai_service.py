# -*- coding: utf-8 -*-
import os
import json
import time
import logging
from werkzeug.utils import secure_filename
from flask import current_app
from app.config import get_modelo_gemini, NOME_MODELO_GEMMA
from google.genai import errors

def extrair_dados_com_ia(texto_cv):
    """Extrai dados de um CV usando o modelo Gemma 3"""
    client = get_modelo_gemini()
    if not client:
        return None, "Cliente GenAI não configurado", False
    
    quota_error = False
    response = None  # Inicializa response
    
    try:
        prompt = f"""Analise o currículo e extraia JSON com: nome_completo, email, telefone.
INSTRUÇÕES DETALHADAS...
- Formate o texto de forma simples, sem usar marcadores Markdown desnecessários
- Para listas, use apenas o formato "- item" sem asteriscos adicionais
- Não use formato Markdown para negrito ou itálico
--- CV ---
{texto_cv}
--- FIM CV ---"""  # Prompt modificado com instruções de formatação
        
        logging.info("Enviando solicitação IA (extração)...")
        response = client.models.generate_content(
            model=NOME_MODELO_GEMMA,
            contents=prompt
        )
        resposta_limpa = response.text.strip().lstrip('```json').lstrip('```').rstrip('```')
        dados_extraidos = json.loads(resposta_limpa)
        
        if dados_extraidos.get("nome_completo") is None:
            logging.warning("IA não extraiu 'nome_completo'.")
        else:
            logging.info("JSON da extração IA interpretado!")
            
        return dados_extraidos, "Dados extraídos com sucesso.", quota_error
    except errors.APIError as e:
        logging.error(f"Erro na API GenAI (extração): {e}", exc_info=True)
        
        if e.code == 429 or "quota" in str(e).lower():
            quota_error = True
            msg_erro = "Erro de Cota da API (extração)"
        else:
            msg_erro = f"Erro na API (extração): {e}"
            
        return None, msg_erro, quota_error
    except json.JSONDecodeError as e_json:
        logging.error(f"Erro ao decodificar JSON: {e_json}", exc_info=True)
        
        # Verifica resposta inesperada
        resp_text = getattr(response, 'text', '')  # Acesso seguro ao atributo text
        if resp_text and not resp_text.strip().startswith('{'):
            logging.warning(f"Resposta não é JSON válido: {resp_text[:200]}...")
            msg_erro = "Erro ao processar resposta da IA (extração)"
            
        return None, f"Erro no formato JSON: {e_json}", quota_error
    except Exception as e_geral:
        logging.error(f"Erro geral na extração: {e_geral}", exc_info=True)
        return None, f"Erro geral: {e_geral}", quota_error

def gerar_e_salvar_relatorio(dados_json, texto_cv_completo, nome_arquivo_original, batch_folder):
    """Gera um relatório baseado no CV e nos dados extraídos usando Gemma 3"""
    client = get_modelo_gemini()
    if not client:
        return False, "Cliente GenAI não configurado (relatório)", False
    if not texto_cv_completo:
        return False, "Texto CV não disponível (relatório)", False
        
    logging.info(f"Gerando relatório para: {nome_arquivo_original}")
    quota_error = False
    resp = None  # Inicializa resp
    
    try:
        nome = dados_json.get('nome_completo', 'N/E')
        email = dados_json.get('email', 'N/E')
        telefone = dados_json.get('telefone', 'N/E')
        
        prompt = f"""Baseado nos dados e CV ({nome_arquivo_original}), gere relatório TXT.
Dados: Nome: {nome} Email: {email} Tel: {telefone}
--- CV ---
{texto_cv_completo}
--- FIM CV ---
Instruções: 
- Formato TXT sem Markdown
- Para listas, use apenas "- " no início de cada item (sem asteriscos)
- Não use marcação especial para negrito ou itálico
- Mantenha o texto limpo e fácil de ler"""  # Prompt modificado
        
        logging.info("Enviando solicitação IA (relatório)...")
        resp = client.models.generate_content(
            model=NOME_MODELO_GEMMA,
            contents=prompt
        )
        texto = resp.text
        
        base_name = os.path.splitext(secure_filename(nome_arquivo_original))[0]
        nome_arquivo_relatorio = f"{current_app.config['nome_arquivo_relatorio_saida_base']}_{base_name}.txt"
        caminho_relatorio = os.path.join(batch_folder, nome_arquivo_relatorio)
        
        logging.info(f"Salvando relatório em '{caminho_relatorio}'...")
        with open(caminho_relatorio, 'w', encoding='utf-8') as f:
            f.write(texto)
            
        logging.info("Relatório salvo.")
        return True, f"Relatório salvo como {nome_arquivo_relatorio}", quota_error
    except errors.APIError as e:
        logging.error(f"Erro na API GenAI (relatório): {e}", exc_info=True)
        
        if e.code == 429 or "quota" in str(e).lower():
            quota_error = True
            msg_erro = "Erro de Cota da API (relatório)"
        else:
            msg_erro = f"Erro na API (relatório): {e}"
            
        return False, msg_erro, quota_error
    except Exception as e:
        logging.error(f"Erro ao gerar/salvar relatório: {e}", exc_info=True)
        
        resp_text = getattr(resp, 'text', '')  # Acesso seguro
        if not resp_text:
            msg_erro = "Erro ao processar resposta da IA (relatório)"
        else:
            msg_erro = f"Erro geral: {e}"
            
        return False, msg_erro, quota_error

def processar_instrucao_inicial(batch_id, initial_instruction, resultados_dict):
    """Processa uma instrução inicial após o processamento do lote usando Gemma 3"""
    client = get_modelo_gemini()
    if not client:
        return "Cliente GenAI não configurado para instrução inicial", False
        
    contexto_cvs = ""
    valid_cv_count = 0
    
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

RESPOSTA:"""  # Prompt modificado
    
    try:
        logging.info(f"Chamando IA Instrução Inicial Batch {batch_id}...")
        response = client.models.generate_content(
            model=NOME_MODELO_GEMMA,
            contents=prompt_chat
        )
        ai_reply = response.text.strip()
        logging.info("Resposta Instrução Inicial IA recebida.")
        return ai_reply, False
    except errors.APIError as e:
        logging.error(f"Erro IA instrução inicial: {e}", exc_info=True)
        
        if e.code == 429 or "quota" in str(e).lower():
            return "Erro de Cota da API (instrução inicial)", True
            
        return f"Erro na API (instrução inicial): {e}", False
    except Exception as e_initial_chat:
        logging.error(f"Erro IA instrução inicial: {e_initial_chat}", exc_info=True)
        return "Erro ao processar instrução inicial.", False

def processar_mensagem_chat(batch_id, user_message, resultados_texto_cv, historico_chat):
    """Processa uma mensagem de chat do usuário usando Gemma 3"""
    client = get_modelo_gemini()
    if not client:
        return None, "Cliente GenAI não configurado para chat", False
    
    contexto_cvs = ""
    for i, cv_info in enumerate(resultados_texto_cv):
        contexto_cvs += f"\n--- CURRÍCULO {i+1} ({cv_info['original_name']}) ---\n{cv_info['texto_completo'][:15000]}\n--- FIM CURRÍCULO {i+1} ---\n"
    
    # Formatar histórico
    prompt_history = "\n".join([f"Usuário: {h['user_message']}\nAssistente: {h['model_reply']}" for h in reversed(historico_chat)])
    
    # Montar prompt completo
    prompt_chat = f"""Você é um assistente de RH...
INSTRUÇÕES DE FORMATAÇÃO:
- Use texto simples sem marcadores Markdown desnecessários
- Para listas, use apenas "- " no início do item (sem asteriscos adicionais)
- Não use formatos especiais para negrito ou itálico
- Mantenha respostas limpas e fáceis de ler

HISTÓRICO:
{prompt_history}

CURRÍCULOS:
{contexto_cvs}

PERGUNTA:
{user_message}

RESPOSTA:"""  # Prompt modificado
    
    try:
        logging.info(f"Chamando IA Chat Batch {batch_id}...")
        response = client.models.generate_content(
            model=NOME_MODELO_GEMMA,
            contents=prompt_chat
        )
        ai_reply = response.text.strip()
        
        if not ai_reply:
            return None, "IA retornou resposta vazia.", False
            
        return ai_reply, None, False
    except errors.APIError as e:
        logging.error(f"Erro IA Chat Batch {batch_id}: {e}", exc_info=True)
        
        if e.code == 429 or "quota" in str(e).lower():
            return None, "Limite de uso da IA atingido.", True
        else:
            return None, f"Erro na API (chat): {e}", False
    except Exception as e_chat_ia:
        logging.error(f"Erro IA Chat Batch {batch_id}: {e_chat_ia}", exc_info=True)
        return None, "Erro ao comunicar com a IA.", False