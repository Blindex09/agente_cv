# -*- coding: utf-8 -*-
import os
import logging
import google.generativeai as genai

# --- Variáveis globais ---
NOME_MODELO_GEMMA = 'gemma-3-27b-it'  # Nova versão Gemma 3 com 27B parâmetros
PAUSA_ENTRE_CHAMADAS_IA = 5
PAUSA_ENTRE_ARQUIVOS = 10
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'zip'}
CV_EXTENSIONS = {'pdf', 'docx'}
nome_arquivo_html_formulario = "interface.html"
nome_arquivo_relatorio_saida_base = "relatorio"

# Variável global para a biblioteca GenAI configurada
modelo_gemini = None

def configure_app(app):
    """Configuração da aplicação Flask"""
    # Configurações de pasta e limites
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads')
    app.config['DATABASE'] = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'agent_cv_data.db')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    app.config['ALLOWED_EXTENSIONS'] = ALLOWED_EXTENSIONS
    app.config['CV_EXTENSIONS'] = CV_EXTENSIONS
    app.config['NOME_MODELO_GEMMA'] = NOME_MODELO_GEMMA
    app.config['PAUSA_ENTRE_CHAMADAS_IA'] = PAUSA_ENTRE_CHAMADAS_IA
    app.config['PAUSA_ENTRE_ARQUIVOS'] = PAUSA_ENTRE_ARQUIVOS
    app.config['nome_arquivo_html_formulario'] = nome_arquivo_html_formulario
    app.config['nome_arquivo_relatorio_saida_base'] = nome_arquivo_relatorio_saida_base
    
    # Criar pasta de uploads se não existir
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    return app

def inicializar_modelo_gemini():
    """Inicializa a biblioteca GenAI para acessar o modelo Gemma 3 com a API Key"""
    global modelo_gemini
    logging.info("Verificando GEMINI_API_KEY...")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logging.warning("!!! ALERTA (Contexto 2025) !!! GEMINI_API_KEY não definida.")
        return False
    logging.info("Chave API encontrada (Contexto 2025).")
    try:
        # Configurar a biblioteca GenAI com a chave de API
        genai.configure(api_key=api_key)
        
        # Verificar se podemos acessar modelos (teste de validação)
        models = genai.list_models()
        if not any(NOME_MODELO_GEMMA in model.name for model in models):
            logging.warning(f"Modelo {NOME_MODELO_GEMMA} não encontrado nos modelos disponíveis.")
        
        # Atribui a biblioteca configurada à variável global
        modelo_gemini = genai
        logging.info(f"Biblioteca GenAI para modelo '{NOME_MODELO_GEMMA}' inicializada.")
        return True
    except Exception as e:
        logging.error(f"!!! ERRO (Contexto 2025) ao configurar API/Cliente GenAI: {e} !!!", exc_info=True)
        modelo_gemini = None
        return False

def get_modelo_gemini():
    """Retorna a instância global da biblioteca GenAI configurada"""
    global modelo_gemini
    return modelo_gemini