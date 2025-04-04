# -*- coding: utf-8 -*-
import json
import time
import logging
import requests
from bs4 import BeautifulSoup
from flask import current_app
from app.config import get_modelo_gemini, NOME_MODELO_GEMMA
import google.generativeai as genai
from google.api_core import exceptions as api_exceptions

def pesquisar_e_sumarizar_web(texto_cv_completo):
    """Pesquisa na web conteúdo relacionado ao CV e o sumariza usando Gemma 3"""
    client = get_modelo_gemini()
    if not client:
        return "Erro: Cliente GenAI não configurado (pesquisa)", None, False
    if not texto_cv_completo:
        return "Erro: Texto CV não disponível (pesquisa)", None, False
        
    logging.info("Iniciando Pesquisa e Sumarização Web")
    resultado_pesquisa_final = None
    status_final = "Pesquisa não iniciada"
    quota_error_ocorreu = False
    resp_ia = None
    response_resumo = None  # Inicializa
    
    try:
        prompt_ia = f"Analise CV. 1. Identifique UMA tecnologia/ferramenta/empresa principal. 2. Sugira URL relevante. Retorne JSON: {{\"topico\": \"[Tópico]\", \"url_sugerida\": \"[URL]\"}}\n--- CV ---\n{texto_cv_completo}\n--- FIM ---"  # Prompt abreviado
        logging.info("Solicitando IA (tópico/URL)...")
        
        try:
            # Usar GenerativeModel em vez de generate_content diretamente
            model = genai.GenerativeModel(NOME_MODELO_GEMMA)
            resp_ia = model.generate_content(prompt_ia)
            resp_limpa = resp_ia.text.strip().lstrip('```json').lstrip('```').rstrip('```')
            dados = json.loads(resp_limpa)
            topico = dados.get("topico")
            url = dados.get("url_sugerida")
        except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e_api:
            logging.error(f"Erro API GenAI (tópico/URL): {e_api}", exc_info=True)
            status_final = "Erro ao identificar tópico/URL com IA."
            
            if "quota" in str(e_api).lower() or "rate limit" in str(e_api).lower():
                quota_error_ocorreu = True
                status_final = "Erro de Cota da API (tópico/URL)"
            
            return status_final, None, quota_error_ocorreu
        except json.JSONDecodeError as e_json:
            logging.error(f"Erro JSON (tópico/URL): {e_json}", exc_info=True)
            
            resp_ia_text = getattr(resp_ia, 'text', '')  # Acesso seguro
            if resp_ia_text and not resp_ia_text.strip().startswith('{'):
                status_final = "Erro ao processar resposta da IA (tópico/URL)"
                
            return status_final, None, quota_error_ocorreu
        except Exception as e_topic_url:
            logging.error(f"Erro IA (tópico/URL): {e_topic_url}", exc_info=True)
            status_final = "Erro geral ao identificar tópico/URL com IA."
            return status_final, None, quota_error_ocorreu
            
        if not topico or not url:
            status_final = "IA não identificou tópico/URL."
            return status_final, None, quota_error_ocorreu
            
        logging.info(f"IA identificou: Tópico='{topico}', URL='{url}'")
        logging.info(f"Baixando conteúdo de: {url} ...")
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'}
        
        try:
            resp_web = requests.get(url, headers=headers, timeout=15)
            resp_web.raise_for_status()
            logging.info("Página baixada.")
        except requests.exceptions.RequestException as e_web:
            status_final = f"Erro ao baixar URL '{url}': {e_web}"
            logging.error(status_final)
            return status_final, None, quota_error_ocorreu
            
        logging.info("Analisando HTML...")
        soup = BeautifulSoup(resp_web.text, 'html.parser')
        titulo = soup.title.string.strip() if soup.title and soup.title.string else "N/E"
        
        main_content = soup.find('main') or soup.find('article') or soup.find('body')
        paragrafos = main_content.find_all('p', limit=5) if main_content else []
        conteudo_texto = "\n".join([p.get_text(strip=True) for p in paragrafos if p.get_text(strip=True)])
        
        if not conteudo_texto:
            conteudo_texto = soup.get_text(separator='\n', strip=True)[:1000]
            
        if not conteudo_texto:
            conteudo_texto = "N/E"
            
        logging.info(f"Título: {titulo} | Conteúdo (prévia): {conteudo_texto[:100]}...")
        
        if titulo != "N/E" or conteudo_texto != "N/E":
            logging.info("Enviando conteúdo web para IA sumarizar...")
            logging.info(f"Pausa de {current_app.config['PAUSA_ENTRE_CHAMADAS_IA']}s...")
            time.sleep(current_app.config['PAUSA_ENTRE_CHAMADAS_IA'])
            
            prompt_resumo = f"Resuma o conteúdo web sobre '{topico}' em 2-4 frases.\nTítulo: {titulo}\nConteúdo: {conteudo_texto[:2000]}\nResumo Conciso:"
            
            try:
                # Usar GenerativeModel em vez de generate_content diretamente
                model = genai.GenerativeModel(NOME_MODELO_GEMMA)
                response_resumo = model.generate_content(prompt_resumo)
                resumo_web = response_resumo.text.strip()
                
                if not resumo_web:
                    raise ValueError("IA retornou resumo vazio.")
                    
                resultado_pesquisa_final = f"Fonte: {url}\nResumo (IA): {resumo_web}"
                status_final = "Pesquisa e sumarização concluídas."
                logging.info("Sumarização web concluída.")
            except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e_api:
                logging.error(f"Erro API GenAI (sumarização): {e_api}", exc_info=True)
                status_final = "Erro ao sumarizar conteúdo web."
                
                if "quota" in str(e_api).lower() or "rate limit" in str(e_api).lower():
                    quota_error_ocorreu = True
                    status_final = "Erro de Cota da API (sumarização)"
                    
                return status_final, None, quota_error_ocorreu
            except Exception as e_sumario:
                logging.error(f"Erro ao sumarizar: {e_sumario}", exc_info=True)
                status_final = "Erro geral ao sumarizar conteúdo web."
                
                response_resumo_text = getattr(response_resumo, 'text', '')  # Acesso seguro
                if not response_resumo_text:
                    status_final = "Erro ao processar resposta da IA (sumarização)"
        else:
            status_final = "Não foi possível extrair conteúdo da página."
            logging.warning(status_final)
    except Exception as e_geral:
        logging.error(f"Erro inesperado pesquisa web: {e_geral}", exc_info=True)
        status_final = f"Erro inesperado pesquisa web."
        
    return status_final, resultado_pesquisa_final, quota_error_ocorreu