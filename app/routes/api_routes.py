# -*- coding: utf-8 -*-
import os
import json
import time
import logging
import shutil
import uuid
from flask import Blueprint, request, jsonify, Response, stream_with_context, g, current_app, send_file
from werkzeug.utils import secure_filename
from app.database.db_manager import get_db, close_connection
from app.database.models import BatchModel, FileModel, ResultModel, ChatModel
from app.services.document_service import ler_texto_pdf, ler_texto_docx, allowed_cv_file, extrair_arquivos_zip
from app.services.ai_service import extrair_dados_com_ia, gerar_e_salvar_relatorio, processar_instrucao_inicial, processar_mensagem_chat
from app.services.web_service import pesquisar_e_sumarizar_web
from app.utils.helpers import allowed_file

# Criação do blueprint
api_bp = Blueprint('api', __name__)

# Configuração do teardown para fechar conexões de BD
@api_bp.teardown_app_request
def close_db_connection(exception):
    close_connection(exception)

# Nova rota para obter o conteúdo completo de um arquivo
@api_bp.route('/get-full-content/<file_id>', methods=['GET'])
def get_full_content(file_id):
    """Retorna o conteúdo completo de um arquivo específico."""
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Obter informações do arquivo
        cursor.execute("SELECT saved_path, original_name FROM files WHERE file_id = ?", (file_id,))
        file_info = cursor.fetchone()
        
        if not file_info:
            return jsonify({"error": "Arquivo não encontrado"}), 404
            
        file_path = file_info['saved_path']
        original_name = file_info['original_name']
        
        # Verificar se o arquivo existe
        if not os.path.exists(file_path):
            return jsonify({"error": "Arquivo físico não encontrado"}), 404
            
        # Verificar se é PDF ou DOCX e extrair o texto
        if original_name.lower().endswith('.pdf'):
            texto_completo = ler_texto_pdf(file_path)
        elif original_name.lower().endswith('.docx'):
            texto_completo = ler_texto_docx(file_path)
        else:
            return jsonify({"error": "Tipo de arquivo não suportado"}), 400
            
        if texto_completo is None:
            return jsonify({"error": "Não foi possível ler o conteúdo do arquivo"}), 500
            
        # Retornar o conteúdo completo
        return jsonify({
            "file_id": file_id,
            "original_name": original_name,
            "content": texto_completo
        })
        
    except Exception as e:
        logging.error(f"Erro ao recuperar conteúdo completo do arquivo {file_id}: {e}", exc_info=True)
        return jsonify({"error": f"Erro ao processar solicitação: {str(e)}"}), 500

# Rota para download de arquivo original
@api_bp.route('/download-file/<file_id>', methods=['GET'])
def download_file(file_id):
    """Permite o download do arquivo original."""
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Obter informações do arquivo
        cursor.execute("SELECT saved_path, original_name FROM files WHERE file_id = ?", (file_id,))
        file_info = cursor.fetchone()
        
        if not file_info:
            return jsonify({"error": "Arquivo não encontrado"}), 404
            
        file_path = file_info['saved_path']
        original_name = file_info['original_name']
        
        # Verificar se o arquivo existe
        if not os.path.exists(file_path):
            return jsonify({"error": "Arquivo físico não encontrado"}), 404
            
        # Retornar o arquivo para download
        return send_file(file_path, 
                        as_attachment=True, 
                        download_name=original_name)
        
    except Exception as e:
        logging.error(f"Erro ao fazer download do arquivo {file_id}: {e}", exc_info=True)
        return jsonify({"error": f"Erro ao processar download: {str(e)}"}), 500

@api_bp.route('/stream-processing/<batch_id>')
def stream_processing(batch_id):
    """Processa um lote de arquivos (lido do DB) e envia atualizações via SSE."""

    @stream_with_context
    def generate_updates(batch_id):
        logging.info(f"--- Iniciando Stream para Batch ID: {batch_id} ---")
        db = get_db()
        cursor = db.cursor()
        batch_quota_error_occurred = False
        final_status = 'pendente'  # Valor padrão para variável de controle
        
        try:
            # Obter informações do batch
            batch_info_db = BatchModel.get_batch_info(batch_id)
            
            if not batch_info_db:
                yield f"data: {json.dumps({'type': 'error', 'message': 'ID de lote inválido.'})}\n\n"
                return
                
            batch_status = batch_info_db['status']
            
            if batch_status not in ['pendente']:
                yield f"data: {json.dumps({'type': 'error', 'message': f'Lote já processado ou em processamento (status: {batch_status}).'})}\n\n"
                return

            # Atualizar status do batch para "processando"
            logging.info(f"Atualizando status Batch {batch_id} para 'processando'")
            BatchModel.update_status(batch_id, 'processando')
            
            flags = json.loads(batch_info_db['flags_json']) if batch_info_db['flags_json'] else {}
            initial_instruction = batch_info_db['initial_instruction']
            
            # Obter arquivos iniciais do lote
            initial_files_db = FileModel.get_batch_files(batch_id, only_initial=True)
            
            files_to_process_db = []
            temp_folders_to_clean = []
            batch_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], batch_id)

            # Passo 1 Condicional (Verificação/Extração ZIP)
            contains_zip = any(f['original_name'].lower().endswith('.zip') for f in initial_files_db)
            if contains_zip:
                # <<< PASSO 1 >>>
                yield f"data: {json.dumps({'type': 'status', 'message': 'Passo 1: Verificando e extraindo arquivos ZIP...'})}\n\n"
                time.sleep(0.5)
            else:
                # <<< PASSO 1 >>>
                yield f"data: {json.dumps({'type': 'status', 'message': 'Passo 1: Verificando arquivos...'})}\n\n"
                time.sleep(0.5)

            # Função callback para registrar arquivos extraídos no banco
            def register_extracted_file(batch_id, filename, filepath, is_extracted=1):
                file_id = FileModel.create(batch_id, filename, filepath, is_extracted)
                if file_id:
                    files_to_process_db.append({
                        'file_id': file_id, 
                        'original_name': filename, 
                        'saved_path': filepath, 
                        'batch_folder': batch_folder
                    })
                return file_id

            # Loop de extração de ZIPs
            for file_row in initial_files_db:
                file_id = file_row['file_id']
                original_name = file_row['original_name']
                saved_path = file_row['saved_path']
                
                if original_name.lower().endswith('.zip'):
                    yield f"data: {json.dumps({'type': 'status', 'message': f'Extraindo ZIP: {original_name}...'})}\n\n"
                    extract_folder_name = f"zip_extract_{secure_filename(original_name)}_{uuid.uuid4().hex[:8]}"
                    extract_path = os.path.join(batch_folder, extract_folder_name)
                    os.makedirs(extract_path, exist_ok=True)
                    temp_folders_to_clean.append(extract_path)
                    
                    # Extrair arquivos ZIP
                    for update_message in extrair_arquivos_zip(saved_path, extract_path, batch_id, register_extracted_file):
                        yield f"data: {json.dumps(update_message)}\n\n"
                        
                elif allowed_cv_file(original_name):
                    files_to_process_db.append({
                        'file_id': file_id, 
                        'original_name': original_name, 
                        'saved_path': saved_path, 
                        'batch_folder': batch_folder
                    })

            # Passo 2: Processar Arquivos de CV
            total_cvs = len(files_to_process_db)
            if total_cvs == 0:
                yield f"data: {json.dumps({'type': 'warning', 'message': 'Nenhum arquivo CV válido (PDF/DOCX) encontrado para analisar.'})}\n\n"
                BatchModel.update_status(batch_id, 'concluido', batch_quota_error_occurred)
                yield f"data: {json.dumps({'type': 'batch_done', 'message': 'Nenhum arquivo válido para analisar.', 'quota_error': batch_quota_error_occurred})}\n\n"
                return
            else:
                # <<< PASSO 2 >>>
                yield f"data: {json.dumps({'type': 'status', 'message': f'Passo 2: Iniciando análise de {total_cvs} CV(s)...'})}\n\n"
                time.sleep(0.5)

            resultados_finais_dict = {}
            for i, file_info in enumerate(files_to_process_db):
                file_id = file_info['file_id']
                caminho_cv = file_info['saved_path']
                nome_original_cv = file_info['original_name']
                current_batch_folder = file_info['batch_folder']
                file_quota_error = False
                start_file_time = time.time()
                
                yield f"data: {json.dumps({'type': 'file_start', 'filename': nome_original_cv, 'index': i+1, 'total': total_cvs, 'file_id': file_id})}\n\n"
                
                if i > 0:
                    logging.info(f"Pausa de {current_app.config['PAUSA_ENTRE_ARQUIVOS']}s...")
                    yield f"data: {json.dumps({'type': 'pause', 'duration': current_app.config['PAUSA_ENTRE_ARQUIVOS']})}\n\n"
                    time.sleep(current_app.config['PAUSA_ENTRE_ARQUIVOS'])

                resultados_cv = {
                    "filename": nome_original_cv,
                    "file_id": file_id,
                    "steps": {},
                    "data": None,
                    "web_summary": None,
                    "status_final": "Pendente",
                    "error_message": None,
                    "texto_completo": None
                }
                texto_extraido = None
                dados_json = None

                try:
                    # 1. Leitura
                    yield f"data: {json.dumps({'type': 'step_start', 'filename': nome_original_cv, 'step': 'Leitura'})}\n\n"  # Mantém 'Leitura'
                    
                    if nome_original_cv.lower().endswith('.pdf'):
                        texto_extraido = ler_texto_pdf(caminho_cv)
                    elif nome_original_cv.lower().endswith('.docx'):
                        texto_extraido = ler_texto_docx(caminho_cv)
                        
                    if texto_extraido is not None:
                        resultados_cv['texto_completo'] = texto_extraido
                        
                    if texto_extraido is None:
                        status_leitura = "Erro interno na leitura do arquivo."
                        raise ValueError(status_leitura)
                    elif not texto_extraido.strip():
                        status_leitura = "Arquivo vazio ou sem texto legível."
                        resultados_cv['steps']['Leitura'] = status_leitura
                    else:
                        status_leitura = f"OK ({len(texto_extraido)} caracteres)."
                        
                    resultados_cv['steps']['Leitura'] = status_leitura
                    yield f"data: {json.dumps({'type': 'step_done', 'filename': nome_original_cv, 'step': 'Leitura', 'status': status_leitura})}\n\n"

                    if texto_extraido and texto_extraido.strip():
                        logging.info(f"Pausa de {current_app.config['PAUSA_ENTRE_CHAMADAS_IA']}s...")
                        yield f"data: {json.dumps({'type': 'pause', 'duration': current_app.config['PAUSA_ENTRE_CHAMADAS_IA']})}\n\n"
                        time.sleep(current_app.config['PAUSA_ENTRE_CHAMADAS_IA'])

                        # 2. Extração IA -> "Analisando dados do arquivo"
                        # <<< MUDANÇA DE NOME >>>
                        step_name_ext = "Analisando dados do arquivo"
                        yield f"data: {json.dumps({'type': 'step_start', 'filename': nome_original_cv, 'step': step_name_ext})}\n\n"
                        dados_json, status_ext, q_error_ext = extrair_dados_com_ia(texto_extraido)
                        resultados_cv['steps'][step_name_ext] = status_ext  # Usa nome amigável como chave
                        
                        if q_error_ext:
                            file_quota_error = True
                            batch_quota_error_occurred = True
                            
                        if not dados_json:
                            yield f"data: {json.dumps({'type': 'warning','filename': nome_original_cv,'message': f'Não foi possível extrair dados básicos. ({status_ext})'})}\n\n"
                        else:
                            resultados_cv['data'] = dados_json
                            
                        yield f"data: {json.dumps({'type': 'step_done', 'filename': nome_original_cv, 'step': step_name_ext, 'status': status_ext, 'data': dados_json})}\n\n"

                        # 3. Relatório Condicional -> "Gerando relatório"
                        if flags.get('gerar_relatorio'):
                            # <<< MUDANÇA DE NOME >>>
                            step_name_rel = "Gerando relatório"
                            yield f"data: {json.dumps({'type':'step_start','filename':nome_original_cv,'step': step_name_rel})}\n\n"
                            logging.info(f"Pausa de {current_app.config['PAUSA_ENTRE_CHAMADAS_IA']}s...")
                            yield f"data: {json.dumps({'type': 'pause', 'duration': current_app.config['PAUSA_ENTRE_CHAMADAS_IA']})}\n\n"
                            time.sleep(current_app.config['PAUSA_ENTRE_CHAMADAS_IA'])
                            
                            sucesso_rel, status_rel, q_error_rel = gerar_e_salvar_relatorio(dados_json or {}, texto_extraido, nome_original_cv, current_batch_folder)
                            resultados_cv['steps'][step_name_rel] = status_rel
                            
                            if q_error_rel:
                                file_quota_error = True
                                batch_quota_error_occurred = True
                                
                            yield f"data: {json.dumps({'type':'step_done','filename':nome_original_cv,'step': step_name_rel,'status':status_rel})}\n\n"
                        else:
                            resultados_cv['steps']['Gerando relatório'] = "Não solicitado"  # Nome consistente

                        # 4. Pesquisa Web Condicional -> "Pesquisando tópico chave online"
                        if flags.get('pesquisar_web'):
                            # <<< MUDANÇA DE NOME >>>
                            step_name_web = "Pesquisando tópico chave online"
                            yield f"data: {json.dumps({'type':'step_start','filename':nome_original_cv,'step': step_name_web})}\n\n"
                            logging.info(f"Pausa de {current_app.config['PAUSA_ENTRE_CHAMADAS_IA']}s...")
                            yield f"data: {json.dumps({'type': 'pause', 'duration': current_app.config['PAUSA_ENTRE_CHAMADAS_IA']})}\n\n"
                            time.sleep(current_app.config['PAUSA_ENTRE_CHAMADAS_IA'])
                            
                            status_pesq, resultado_pesq, q_error_pesq = pesquisar_e_sumarizar_web(texto_extraido)
                            resultados_cv['steps'][step_name_web] = status_pesq
                            resultados_cv['web_summary'] = resultado_pesq
                            
                            if q_error_pesq:
                                file_quota_error = True
                                batch_quota_error_occurred = True
                                
                            yield f"data: {json.dumps({'type':'step_done','filename':nome_original_cv,'step': step_name_web,'status':status_pesq, 'summary': resultado_pesq})}\n\n"
                        else:
                            resultados_cv['steps']['Pesquisando tópico chave online'] = "Não solicitado"  # Nome consistente

                        resultados_cv['status_final'] = 'Sucesso'
                    else:  # Caso não haja texto extraído
                        resultados_cv['steps']['Analisando dados do arquivo'] = "Pulado (sem texto)"
                        resultados_cv['steps']['Gerando relatório'] = "Pulado (sem texto)"
                        resultados_cv['steps']['Pesquisando tópico chave online'] = "Pulado (sem texto)"
                        resultados_cv['status_final'] = 'Sucesso (sem texto para IA)'
                except Exception as e_proc:
                    error_msg = f"Erro no processamento do arquivo {nome_original_cv}: {e_proc}"
                    logging.error(error_msg, exc_info=True)
                    resultados_cv['status_final'] = 'Erro'
                    resultados_cv['error_message'] = str(e_proc)
                    yield f"data: {json.dumps({'type': 'file_error', 'filename': nome_original_cv, 'message': error_msg})}\n\n"
                finally:
                    end_file_time = time.time()
                    proc_time = end_file_time-start_file_time
                    logging.info(f"=== Fim CV {nome_original_cv} (FileID: {file_id}): {proc_time:.2f}s | Status: {resultados_cv['status_final']} | Quota Error: {file_quota_error} ===")
                    resultados_finais_dict[file_id] = resultados_cv
                    yield f"data: {json.dumps({'type': 'file_done', 'result': resultados_cv})}\n\n"

            # Salvar resultados no DB
            logging.info(f"Salvando {len(resultados_finais_dict)} resultados no DB Batch {batch_id}")
            for f_id, res_data in resultados_finais_dict.items():
                ResultModel.create(
                    f_id, 
                    batch_id, 
                    res_data['status_final'], 
                    res_data['error_message'], 
                    res_data['steps'], 
                    res_data['data'], 
                    res_data['web_summary'], 
                    res_data['texto_completo']
                )
                
            logging.info("Resultados salvos no DB.")

            # Processar Instrução Inicial
            if initial_instruction and total_cvs > 0:
                yield f"data: {json.dumps({'type': 'status', 'message': 'Processando instrução inicial...'})}\n\n"
                logging.info(f"Processando instrução inicial Batch {batch_id}...")
                time.sleep(1)
                
                ai_reply, quota_error = processar_instrucao_inicial(batch_id, initial_instruction, resultados_finais_dict)
                
                if quota_error:
                    batch_quota_error_occurred = True
                    yield f"data: {json.dumps({'type': 'error', 'message': ai_reply})}\n\n"
                elif ai_reply.startswith("Instrução inicial não processada"):
                    yield f"data: {json.dumps({'type': 'warning', 'message': ai_reply})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'initial_instruction_result', 'reply': ai_reply})}\n\n"
                    ChatModel.create(batch_id, initial_instruction, ai_reply)
                    logging.info("Instrução inicial salva no histórico DB.")

            # Finalizar o lote
            final_status = 'concluido'
            logging.info(f"Atualizando status final Batch {batch_id} para '{final_status}', quota_error={batch_quota_error_occurred}")
            BatchModel.update_status(batch_id, final_status, batch_quota_error_occurred)
            yield f"data: {json.dumps({'type': 'batch_done', 'message': 'Análise do lote concluída.', 'quota_error': batch_quota_error_occurred})}\n\n"

        except Exception as e_geral:
            # Tratamento de erro geral e limpeza
            final_status = 'erro_processamento'
            logging.error(f"Erro crítico Batch {batch_id}: {e_geral}", exc_info=True)
            
            try:
                BatchModel.update_status(batch_id, final_status, batch_quota_error_occurred)
            except Exception as e_update_fail:
                logging.error(f"Falha update status erro Batch {batch_id}: {e_update_fail}", exc_info=True)
                
            yield f"data: {json.dumps({'type': 'error', 'message': f'Erro crítico durante a análise do lote.'})}\n\n"
            yield f"data: {json.dumps({'type': 'batch_failed', 'message': 'Análise do lote falhou.', 'quota_error': batch_quota_error_occurred})}\n\n"
        finally:
            # Limpeza de pastas ZIP
            for folder in temp_folders_to_clean:
                try:
                    shutil.rmtree(folder)
                    logging.info(f"Pasta ZIP removida: {folder}")
                except Exception as e_clean:
                    logging.error(f"Erro remover pasta {folder}: {e_clean}", exc_info=True)
                    
            logging.info(f"--- Finalizando Stream Batch {batch_id} | Status DB Final: {final_status} ---")

    return Response(stream_with_context(generate_updates(batch_id)), mimetype='text/event-stream')


@api_bp.route('/chat', methods=['POST'])
def handle_chat():
    """Rota para lidar com mensagens de chat"""
    from app.config import get_modelo_gemini
    if not get_modelo_gemini():
        return jsonify({"error": "Modelo Gemini não inicializado."}), 503
        
    batch_quota_error_occurred = False
    batch_id = None  # Inicializar a variável para evitar erros no log
    
    try:
        data = request.get_json()
        batch_id = data.get('batch_id')
        user_message = data.get('message')
        
        if not batch_id or not user_message:
            raise ValueError("ID do lote ou mensagem ausente.")
            
        # Verificar status do lote
        batch_info = BatchModel.get_batch_info(batch_id)
        
        if not batch_info:
            raise ValueError("Lote não encontrado.")
            
        if batch_info['status'] != 'concluido':
            raise ValueError("O processamento do lote não foi concluído com sucesso.")
            
        if batch_info['quota_error_occurred'] == 1:
            batch_quota_error_occurred = True
            logging.warning(f"Chat Batch {batch_id} com erro de cota prévio.")  # Apenas loga, não impede ainda
            
        # Obter resultados dos CVs para contexto
        results_db = ResultModel.get_batch_results_with_text(batch_id)
        
        if not results_db:
            raise ValueError("Nenhum texto de currículo válido encontrado neste lote para fornecer contexto.")
            
        # Obter histórico de chat
        history_db = ChatModel.get_history(batch_id, limit=10)
        
        # Processar mensagem de chat
        ai_reply, error_msg, quota_error = processar_mensagem_chat(
            batch_id,
            user_message,
            results_db,
            history_db
        )
        
        if error_msg:
            if quota_error and not batch_quota_error_occurred:
                BatchModel.update_status(batch_id, batch_info['status'], True)
            raise ValueError(error_msg)
            
        # Salvar conversa no histórico
        ChatModel.create(batch_id, user_message, ai_reply)
        logging.info("Resposta Chat IA recebida e salva DB.")
        
        return jsonify({'reply': ai_reply})
    except ValueError as e:
        logging.warning(f"Erro Valor Chat Batch {batch_id if batch_id else 'N/A'}: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logging.error(f"Erro Inesperado Chat Batch {batch_id if batch_id else 'N/A'}: {e}", exc_info=True)
        return jsonify({'error': 'Erro inesperado no servidor de chat.'}), 500