# -*- coding: utf-8 -*-
import os
import logging
from google import genai

# --- Variáveis globais ---
NOME_MODELO_GEMMA = 'gemma-3-27b-it'  # Nova versão Gemma 3 com 27B parâmetros
PAUSA_ENTRE_CHAMADAS_IA = 5
PAUSA_ENTRE_ARQUIVOS = 10
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'zip'}
CV_EXTENSIONS = {'pdf', 'docx'}
nome_arquivo_html_formulario = "interface.html"
nome_arquivo_relatorio_saida_base = "relatorio"

# Variável global para o cliente GenAI
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
    """Inicializa o cliente GenAI para acessar o modelo Gemma 3 com a API Key"""
    global modelo_gemini
    logging.info("Verificando GEMINI_API_KEY...")
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logging.warning("!!! ALERTA (Contexto 2025) !!! GEMINI_API_KEY não definida.")
        return False
    logging.info("Chave API encontrada (Contexto 2025).")
    try:
        # Criar o cliente com a nova API GenAI
        modelo_gemini = genai.Client(api_key=api_key)
        logging.info(f"Cliente GenAI para modelo '{NOME_MODELO_GEMMA}' inicializado.")
        return True
    except Exception as e:
        logging.error(f"!!! ERRO (Contexto 2025) ao configurar API/Cliente GenAI: {e} !!!", exc_info=True)
        modelo_gemini = None
        return False

def get_modelo_gemini():
    """Retorna a instância global do cliente GenAI"""
    global modelo_gemini
    return modelo_gemini