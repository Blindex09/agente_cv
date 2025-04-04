# -*- coding: utf-8 -*-
import os
import uuid
import json
import time
import logging
import shutil
from flask import Blueprint, render_template, request, jsonify, g, current_app
from werkzeug.utils import secure_filename
from app.database.db_manager import get_db, close_connection
from app.database.models import BatchModel, FileModel
from app.utils.helpers import allowed_file

# Corrigindo a declaração do blueprint
main_bp = Blueprint('main', __name__)  # Removi os asteriscos de __name__

# Configuração do teardown para fechar conexões de BD
@main_bp.teardown_app_request
def close_db_connection(exception):
    close_connection(exception)

@main_bp.route('/')
def index():
    """Rota principal que exibe a interface do usuário"""
    return render_template(current_app.config['nome_arquivo_html_formulario'])

@main_bp.route('/upload', methods=['POST'])
def upload_files():
    """Rota para upload de arquivos"""
    from app.config import get_modelo_gemini
    if not get_modelo_gemini():
        return jsonify({"error": "Modelo Gemini não inicializado."}), 503
        
    batch_id = str(uuid.uuid4())
    batch_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], batch_id)
    os.makedirs(batch_folder, exist_ok=True)
    logging.info(f"Pasta criada: {batch_folder}")
    
    files_processed_info = []
    saved_file_records = []
    db = get_db()
    
    try:
        gerar_relatorio_flag = request.form.get('gerar_relatorio') == 'true'
        pesquisar_web_flag = request.form.get('pesquisar_web') == 'true'
        initial_instruction = request.form.get('initial_instruction')
        flags = {'gerar_relatorio': gerar_relatorio_flag, 'pesquisar_web': pesquisar_web_flag}
        flags_json = json.dumps(flags)
        
        logging.info(f"Upload Batch {batch_id}: Opções -> Rel: {gerar_relatorio_flag}, Pesq: {pesquisar_web_flag}, Instr: {'Sim' if initial_instruction else 'Não'}")
        uploaded_files = request.files.getlist('arquivo_cv')
        
        if not uploaded_files or all(f.filename == '' for f in uploaded_files):
            raise ValueError("Nenhum arquivo válido recebido.")
            
        logging.info(f"Upload Batch {batch_id}: Recebidos {len(uploaded_files)} arquivo(s).")
        
        for file in uploaded_files:
            if file and allowed_file(file.filename):
                original_filename = file.filename
                secure_name = secure_filename(original_filename)
                save_path = os.path.join(batch_folder, secure_name)
                counter = 1
                
                while os.path.exists(save_path):
                    name, ext = os.path.splitext(secure_name)
                    save_path = os.path.join(batch_folder, f"{name}_{counter}{ext}")
                    counter += 1
                    
                logging.info(f"Salvando '{original_filename}' como '{os.path.basename(save_path)}'")
                file.save(save_path)
                files_processed_info.append({'original_name': original_filename, 'saved_as': os.path.basename(save_path)})
                saved_file_records.append({'original_name': original_filename, 'saved_path': save_path, 'is_extracted': 0})
            else:
                logging.warning(f"Arquivo '{file.filename}' ignorado.")
                files_processed_info.append({'original_name': file.filename, 'saved_as': None, 'error': 'Tipo inválido'})
                
        if not saved_file_records:
            shutil.rmtree(batch_folder)
            raise ValueError("Nenhum arquivo válido foi salvo.")
            
        # Criar o batch no banco de dados
        if not BatchModel.create(batch_id, 'pendente', flags_json, initial_instruction):
            raise ValueError("Erro ao criar registro do lote no banco de dados.")
        
        # Registrar arquivos no banco
        for record in saved_file_records:
            FileModel.create(
                batch_id, 
                record['original_name'], 
                record['saved_path'], 
                record['is_extracted']
            )
                          
        logging.info(f"Upload Batch {batch_id}: Lote e arquivos salvos no DB.")
        return jsonify({'batch_id': batch_id, 'files_received': files_processed_info})
    except Exception as e:
        logging.error(f"Erro upload (Batch {batch_id}): {e}", exc_info=True)
        
        # Em caso de erro, limpar pasta criada
        if os.path.exists(batch_folder):
            try:
                shutil.rmtree(batch_folder)
                logging.info(f"Pasta erro {batch_id} limpa.")
            except Exception as e_clean:
                logging.error(f"Erro limpar pasta erro {batch_id}: {e_clean}", exc_info=True)
            
        return jsonify({'error': str(e)}), 400