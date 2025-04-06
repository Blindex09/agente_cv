# -*- coding: utf-8 -*-
# Imports necessários para ESTA função (adapte se já importados no seu arquivo)
import json
import time
import logging
import random # Importado para seleção de keyword
import requests
from bs4 import BeautifulSoup
from flask import current_app # Assume que está rodando em um contexto Flask

# --- CORREÇÃO: Descomentada/Adicionada a linha de importação ---
from app.config import get_modelo_gemini, NOME_MODELO_GEMMA # Assume que essas funções/constantes existem no seu ambiente app.config

import google.generativeai as genai
from google.api_core import exceptions as api_exceptions

# === CÓDIGO DA FUNÇÃO (Abordagem 2: Keywords, com import corrigido) ===
def pesquisar_e_sumarizar_web(texto_cv_completo):
    """
    Extrai keywords do CV, seleciona uma, busca uma URL relevante para ela (via IA),
    baixa o conteúdo da URL e o sumariza usando Gemma 3.
    """
    # Pré-requisito: Assume que get_modelo_gemini() e NOME_MODELO_GEMMA estão definidos
    # e que current_app.config contém 'PAUSA_ENTRE_CHAMADAS_IA'
    try:
        # Agora get_modelo_gemini() deve ser encontrado devido ao import acima
        client = get_modelo_gemini()
        if not client:
            # Este erro agora é menos provável de ser NameError, mas pode ocorrer se a função retornar None
            logging.error("Falha ao obter cliente GenAI. get_modelo_gemini() retornou None.")
            return "Erro: Cliente GenAI não configurado (pesquisa)", None, False
    except NameError:
         # Este except NameError agora é menos provável de ser atingido, mas mantido por segurança
         logging.error("Função get_modelo_gemini() não encontrada (verifique imports e definição).")
         return "Erro: Configuração interna da IA ausente (cliente)", None, False
    except Exception as e_client:
         logging.error(f"Erro ao obter cliente GenAI: {e_client}", exc_info=True)
         return "Erro: Falha ao inicializar IA (cliente)", None, False

    if not texto_cv_completo:
        return "Erro: Texto CV não disponível (pesquisa)", None, False

    logging.info("Iniciando Pesquisa Web Dinâmica por Keyword")
    resultado_pesquisa_final = None
    status_final = "Pesquisa não iniciada"
    quota_error_ocorreu = False
    lista_keywords = []
    topico_selecionado = None
    url_encontrada = None
    response_keywords = None # Resposta da IA para keywords
    response_url = None      # Resposta da IA para URL
    response_resumo = None   # Resposta da IA para resumo

    # Bloco principal para capturar erros gerais inesperados
    try:
        # --- Passo 1: Extrair Keywords do CV (Modificado) ---
        prompt_keywords = f"""Analise o CV abaixo e extraia uma lista [array] das 5 a 7 palavras-chave ou entidades mais relevantes (Ex: tecnologias específicas, nomes de empresas importantes, conceitos de projetos, metodologias). Dê preferência a termos técnicos ou específicos da área. Retorne APENAS um array JSON de strings, sem nenhum outro texto.
--- CV ---
{texto_cv_completo}
--- FIM CV ---"""
        logging.info("Solicitando IA (extração de keywords)...")
        resp_limpa_kw = "" # Inicializa para o bloco except

        try:
            # Assume NOME_MODELO_GEMMA está definido via import
            model_kw = genai.GenerativeModel(NOME_MODELO_GEMMA)
            response_keywords = model_kw.generate_content(prompt_keywords)
            raw_text_kw = getattr(response_keywords, 'text', '')
            logging.debug(f"Resposta bruta IA (keywords): {raw_text_kw[:200]}...")
            # Limpeza da resposta - tentar remover markdown e espaços
            resp_limpa_kw = raw_text_kw.strip().lstrip('```json').lstrip('```').rstrip('```').strip()
            lista_keywords = json.loads(resp_limpa_kw)

            if not isinstance(lista_keywords, list) or not lista_keywords:
                raise ValueError("Resposta da IA não é uma lista de keywords válida ou está vazia.")

            logging.info(f"Keywords extraídas: {lista_keywords}")

        except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e_api_kw:
            logging.error(f"Erro API GenAI (keywords): {e_api_kw}", exc_info=True)
            quota_error_ocorreu = "quota" in str(e_api_kw).lower() or "rate limit" in str(e_api_kw).lower()
            status_final = "Erro de Cota da API (keywords)" if quota_error_ocorreu else "Erro na API ao extrair keywords."
            return status_final, None, quota_error_ocorreu # Retorna erro e para
        except (json.JSONDecodeError, ValueError) as e_json_kw:
            # Log inclui a resposta que falhou no parse
            logging.error(f"Erro JSON/Valor (keywords): {e_json_kw}. Resposta: '{resp_limpa_kw[:200]}...'", exc_info=True)
            status_final = "Erro ao processar keywords da IA (formato inválido)."
            return status_final, None, quota_error_ocorreu # Retorna erro e para
        except Exception as e_kw:
            logging.error(f"Erro inesperado na extração de keywords: {e_kw}", exc_info=True)
            status_final = "Erro geral ao extrair keywords com IA."
            return status_final, None, quota_error_ocorreu # Retorna erro e para

        # --- Passo 2: Selecionar uma Keyword (Modificado) ---
        # <<< IMPORTANTE: Revise e personalize esta lógica de seleção! >>>
        if lista_keywords:
            # Exemplo simples: escolher aleatoriamente da lista
            topico_selecionado = random.choice(lista_keywords)
            # Outras opções: lista_keywords[0], lógica baseada em prioridade, etc.
            logging.info(f"Keyword selecionada para pesquisa: '{topico_selecionado}'")
        else:
            # Segurança extra, caso a validação falhe
            status_final = "Nenhuma keyword válida foi extraída para pesquisa."
            logging.warning(status_final)
            return status_final, None, quota_error_ocorreu # Retorna e para

        # --- Passo 3: Encontrar URL para a Keyword Selecionada (Novo Bloco) ---
        # Método atual: Usando IA para sugerir URL.
        # Alternativa: Usar API de Busca Externa (Google/Bing etc.)
        prompt_url_lookup = f"Sugira a melhor URL (página oficial, documentação, artigo de referência confiável) para saber mais sobre o tópico: '{topico_selecionado}'. Retorne APENAS a URL completa como texto simples."
        logging.info(f"Solicitando IA (busca de URL para '{topico_selecionado}')...")

        # Pausa entre chamadas de IA (configurável via Flask app.config)
        # Pega da config, usa default 1 segundo se não existir
        pausa = current_app.config.get('PAUSA_ENTRE_CHAMADAS_IA', 1)
        logging.info(f"Pausa de {pausa}s antes da busca de URL...")
        time.sleep(pausa)

        try:
            model_url = genai.GenerativeModel(NOME_MODELO_GEMMA)
            response_url = model_url.generate_content(prompt_url_lookup)
            url_encontrada = getattr(response_url, 'text', '').strip()

            # Validação básica da URL (começa com http:// ou https://)
            if not url_encontrada or not url_encontrada.startswith(('http://', 'https://')):
                 # Loga a resposta inválida antes de levantar o erro
                 logging.warning(f"IA retornou URL inválida para '{topico_selecionado}'. Resposta: '{url_encontrada}'")
                 raise ValueError(f"IA não retornou uma URL válida.")

            logging.info(f"URL sugerida pela IA: {url_encontrada}")

        except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e_api_url:
            logging.error(f"Erro API GenAI (URL lookup): {e_api_url}", exc_info=True)
            quota_error_ocorreu = "quota" in str(e_api_url).lower() or "rate limit" in str(e_api_url).lower()
            status_final = "Erro de Cota da API (busca URL)" if quota_error_ocorreu else "Erro na API ao buscar URL."
            return status_final, None, quota_error_ocorreu # Retorna erro e para
        except ValueError as e_val_url:
             # Erro já logado no bloco if/raise acima
             status_final = f"IA não encontrou URL válida para '{topico_selecionado}'."
             return status_final, None, quota_error_ocorreu # Retorna erro e para
        except Exception as e_url:
            logging.error(f"Erro inesperado (URL lookup): {e_url}", exc_info=True)
            status_final = f"Erro geral ao buscar URL com IA para '{topico_selecionado}'."
            return status_final, None, quota_error_ocorreu # Retorna erro e para

        # --- Passo 4: Baixar Conteúdo da URL Encontrada (Adaptado) ---
        logging.info(f"Baixando conteúdo de: {url_encontrada} ...")
        # User agent mais comum pode ajudar a evitar bloqueios simples
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        conteudo_texto = "N/E" # Default inicial

        try:
            # Timeout aumentado para requisições web
            resp_web = requests.get(url_encontrada, headers=headers, timeout=20)
            resp_web.raise_for_status() # Verifica erros HTTP (4xx, 5xx)
            logging.info(f"Página baixada com sucesso (Status: {resp_web.status_code}).")

            # --- Passo 5: Extrair Texto do HTML (Mantido, com melhorias) ---
            logging.info("Analisando HTML...")
            # Usar resp_web.content para melhor detecção de encoding pelo BeautifulSoup
            soup = BeautifulSoup(resp_web.content, 'html.parser')
            titulo = soup.title.string.strip() if soup.title and soup.title.string else "Título não encontrado"

            # Remover elementos que geralmente não contêm conteúdo principal
            for element in soup(["script", "style", "header", "footer", "nav", "aside", "form", "button", "img", "iframe"]):
                element.decompose()

            # Tentar encontrar o conteúdo principal de forma mais robusta
            main_content = soup.find('main') or soup.find('article') or soup.find('div', role='main') or soup.find(id='content') or soup.find(class_='content') or soup.body

            conteudo_texto_extraido = "N/E"
            if main_content:
                # Extrai texto priorizando parágrafos, mas juntando todo texto do main_content se parágrafos forem poucos
                paragrafos = main_content.find_all('p', limit=15) # Limite maior
                conteudo_paragrafos = "\n".join([p.get_text(strip=True) for p in paragrafos if p.get_text(strip=True)])

                if len(conteudo_paragrafos) > 200: # Usa parágrafos se tiver um bom volume
                    conteudo_texto_extraido = conteudo_paragrafos
                    logging.info("Conteúdo extraído dos parágrafos principais.")
                else:
                    logging.info("Conteúdo dos parágrafos insuficiente, tentando extração geral da área principal...")
                    # Extrai todo texto da área principal encontrada
                    conteudo_texto_geral = main_content.get_text(separator='\n', strip=True)
                    # Remove linhas em branco excessivas
                    conteudo_texto_geral = "\n".join(line for line in conteudo_texto_geral.splitlines() if line.strip())

                    if len(conteudo_texto_geral) > 100: # Verifica se extraiu algo significativo
                         conteudo_texto_extraido = conteudo_texto_geral
                         logging.info("Conteúdo extraído do texto geral da área principal (após limpeza).")
                    else:
                         logging.warning("Não foi possível extrair conteúdo textual significativo da área principal da página.")
                         conteudo_texto_extraido = "N/E (Conteúdo principal não extraído)"
            else:
                 logging.warning("Não foi possível encontrar a área de conteúdo principal (main, article, etc.).")
                 conteudo_texto_extraido = "N/E (Estrutura HTML não reconhecida)"

            conteudo_texto = conteudo_texto_extraido # Atribui o resultado da extração

            logging.debug(f"Título: {titulo} | Conteúdo (prévia): {conteudo_texto[:150]}...")

        except requests.exceptions.RequestException as e_web:
            # Erro ao baixar a página
            status_final = f"Erro ao baixar URL '{url_encontrada}': {e_web}"
            logging.error(status_final, exc_info=True)
            # Se não baixou, não há o que sumarizar, então retorna
            return status_final, None, quota_error_ocorreu
        except Exception as e_parse:
             # Erro ao processar o HTML
             logging.error(f"Erro ao analisar HTML da URL '{url_encontrada}': {e_parse}", exc_info=True)
             status_final = "Erro ao processar conteúdo da página web."
             # Define conteudo_texto como N/E explicitamente para indicar falha
             conteudo_texto = "N/E"
             # Não retorna aqui, tentará sumarizar (ou pulará se N/E)

        # --- Passo 6: Sumarizar Conteúdo Web com IA (Adaptado) ---
        if conteudo_texto != "N/E":
            logging.info("Enviando conteúdo web para IA sumarizar...")

            # Pausa antes da terceira chamada de IA
            pausa_sum = current_app.config.get('PAUSA_ENTRE_CHAMADAS_IA', 1)
            logging.info(f"Pausa de {pausa_sum}s antes da sumarização...")
            time.sleep(pausa_sum)

            # Limita o contexto para a sumarização para evitar erros/custos
            # Aumentado o limite para dar mais contexto à IA
            contexto_para_sumarizar = conteudo_texto[:8000]

            # Prompt de sumarização usa o tópico selecionado
            prompt_resumo = f"Você é um assistente que resume conteúdo técnico. Resuma o seguinte conteúdo web sobre '{topico_selecionado}' em 3 a 5 frases concisas e informativas para um recrutador. Foque nos pontos chave e na relevância do tópico.\n\nTítulo da Página: {titulo}\n\nConteúdo Extraído:\n{contexto_para_sumarizar}\n\n---\nResumo Conciso (em português, formato TXT simples):"

            try:
                model_sum = genai.GenerativeModel(NOME_MODELO_GEMMA)
                response_resumo = model_sum.generate_content(prompt_resumo)
                resumo_web = getattr(response_resumo, 'text', '').strip()

                if not resumo_web:
                    # Se a IA retornar vazio, considera um erro leve
                    logging.warning(f"IA retornou resumo vazio para '{topico_selecionado}'.")
                    status_final = f"IA não gerou resumo para '{topico_selecionado}'."
                    # Não define resultado_pesquisa_final
                else:
                    # Formata o resultado final SÓ SE HOUVER RESUMO
                    resultado_pesquisa_final = f"Fonte: {url_encontrada}\nResumo (IA) sobre '{topico_selecionado}': {resumo_web}"
                    status_final = "Pesquisa e sumarização web concluídas."
                    logging.info("Sumarização web concluída.")

            except (api_exceptions.ResourceExhausted, api_exceptions.PermissionDenied) as e_api_sum:
                logging.error(f"Erro API GenAI (sumarização): {e_api_sum}", exc_info=True)
                quota_error_ocorreu = "quota" in str(e_api_sum).lower() or "rate limit" in str(e_api_sum).lower()
                status_final = "Erro de Cota da API (sumarização)" if quota_error_ocorreu else "Erro na API ao sumarizar."
                # resultado_pesquisa_final permanece None
            except Exception as e_sumario:
                logging.error(f"Erro ao sumarizar: {e_sumario}", exc_info=True)
                status_final = "Erro geral ao sumarizar conteúdo web."
                # resultado_pesquisa_final permanece None
        else:
            # Se conteudo_texto era "N/E"
            status_final = f"Não foi possível extrair conteúdo relevante da página para sumarizar sobre '{topico_selecionado}'."
            logging.warning(status_final)
            # resultado_pesquisa_final permanece None

    except Exception as e_geral:
        # Captura qualquer outro erro inesperado não previsto nos blocos internos
        logging.error(f"Erro inesperado na pesquisa web dinâmica: {e_geral}", exc_info=True)
        status_final = f"Erro inesperado e grave durante a pesquisa web."
        resultado_pesquisa_final = None # Garante que é None em erro geral
        # Considerar se quota_error_ocorreu deve ser True em caso de dúvida

    # Retorna o status final, o resultado (string formatada ou None) e o flag de erro de cota
    return status_final, resultado_pesquisa_final, quota_error_ocorreu
# === FIM DA FUNÇÃO pesquisar_e_sumarizar_web ===