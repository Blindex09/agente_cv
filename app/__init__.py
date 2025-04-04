# -*- coding: utf-8 -*-
import os
import logging
from flask import Flask

# --- Configuração do Logging ---
# (Mantido como estava, assumindo que está funcionando para você)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def create_app():
    # Criação e configuração do app Flask
    app = Flask(__name__,
                template_folder='../templates', # Caminho relativo à localização de __init__.py
                static_folder='../static')     # Caminho relativo à localização de __init__.py
    app.secret_key = os.urandom(24) # Chave secreta para sessões, etc.

    # Carregar configurações (ex: do config.py)
    from app.config import configure_app
    configure_app(app) # Passa a instância do app para a função de configuração

    # Inicializar banco de dados dentro do contexto da aplicação
    with app.app_context():
        from app.database.db_manager import init_db
        init_db() # Chama a função de inicialização do DB

    # Registrar blueprints para as rotas
    # Assume que seus arquivos de rotas estão em app/routes/
    try:
        from app.routes.main_routes import main_bp
        from app.routes.api_routes import api_bp

        # Registra o blueprint principal (rotas como '/')
        app.register_blueprint(main_bp)

        # --- CORREÇÃO APLICADA AQUI ---
        # Registra o blueprint da API com o prefixo /api
        app.register_blueprint(api_bp, url_prefix='/api')
        # -----------------------------

        logging.info("Blueprints 'main_bp' e 'api_bp' registrados com sucesso.")

    except ImportError as e:
        logging.error(f"Erro ao importar ou registrar blueprints: {e}", exc_info=True)
        # Você pode querer lançar o erro ou sair se os blueprints forem essenciais
        raise e

    return app

# Nota: Se você tiver mais blueprints, registre-os aqui também.
# Certifique-se que os caminhos de importação (ex: app.routes.main_routes)
# correspondem à estrutura real do seu projeto.