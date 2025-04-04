# -*- coding: utf-8 -*-
import json
import logging
from app.database.db_manager import get_db

class BatchModel:
    """Modelo para operações com lotes de processamento (batches)"""
    
    @staticmethod
    def create(batch_id, status='pendente', flags_json=None, initial_instruction=None):
        """Cria um novo batch no banco de dados"""
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                'INSERT INTO batches (batch_id, status, flags_json, initial_instruction) VALUES (?, ?, ?, ?)', 
                (batch_id, status, flags_json, initial_instruction)
            )
            db.commit()
            logging.info(f"Batch ID {batch_id} inserido no banco de dados.")
            return True
        except Exception as e:
            db.rollback()
            logging.error(f"Erro ao criar batch {batch_id}: {e}", exc_info=True)
            return False
    
    @staticmethod
    def update_status(batch_id, status, quota_error_occurred=None):
        """Atualiza o status de um batch"""
        try:
            db = get_db()
            cursor = db.cursor()
            
            if quota_error_occurred is not None:
                cursor.execute(
                    "UPDATE batches SET status = ?, quota_error_occurred = ? WHERE batch_id = ?", 
                    (status, 1 if quota_error_occurred else 0, batch_id)
                )
            else:
                cursor.execute(
                    "UPDATE batches SET status = ? WHERE batch_id = ?", 
                    (status, batch_id)
                )
                
            db.commit()
            logging.info(f"Status do batch {batch_id} atualizado para '{status}'")
            return True
        except Exception as e:
            db.rollback()
            logging.error(f"Erro ao atualizar status do batch {batch_id}: {e}", exc_info=True)
            return False
    
    @staticmethod
    def get_batch_info(batch_id):
        """Obtém informações de um batch específico"""
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute("SELECT * FROM batches WHERE batch_id = ?", (batch_id,))
            return cursor.fetchone()
        except Exception as e:
            logging.error(f"Erro ao obter informações do batch {batch_id}: {e}", exc_info=True)
            return None

class FileModel:
    """Modelo para operações com arquivos"""
    
    @staticmethod
    def create(batch_id, original_name, saved_path, is_extracted_from_zip=0):
        """Cria um novo registro de arquivo no banco de dados"""
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                'INSERT INTO files (batch_id, original_name, saved_path, is_extracted_from_zip) VALUES (?, ?, ?, ?)', 
                (batch_id, original_name, saved_path, is_extracted_from_zip)
            )
            db.commit()
            file_id = cursor.lastrowid
            logging.info(f"Arquivo '{original_name}' inserido no banco (ID: {file_id})")
            return file_id
        except Exception as e:
            db.rollback()
            logging.error(f"Erro ao criar registro de arquivo '{original_name}': {e}", exc_info=True)
            return None
    
    @staticmethod
    def get_batch_files(batch_id, only_initial=True):
        """Obtém os arquivos de um batch"""
        try:
            db = get_db()
            cursor = db.cursor()
            
            if only_initial:
                cursor.execute(
                    "SELECT file_id, original_name, saved_path FROM files WHERE batch_id = ? AND is_extracted_from_zip = 0", 
                    (batch_id,)
                )
            else:
                cursor.execute(
                    "SELECT file_id, original_name, saved_path FROM files WHERE batch_id = ?", 
                    (batch_id,)
                )
                
            return cursor.fetchall()
        except Exception as e:
            logging.error(f"Erro ao obter arquivos do batch {batch_id}: {e}", exc_info=True)
            return []

class ResultModel:
    """Modelo para operações com resultados de processamento"""
    
    @staticmethod
    def create(file_id, batch_id, status_final, error_message=None, steps_json=None, 
               data_json=None, web_summary=None, texto_completo=None):
        """Cria um novo resultado no banco de dados"""
        try:
            db = get_db()
            cursor = db.cursor()
            
            steps_json_str = json.dumps(steps_json) if steps_json else None
            data_json_str = json.dumps(data_json) if data_json else None
            
            cursor.execute(
                'INSERT INTO results (file_id, batch_id, status_final, error_message, steps_json, data_json, web_summary, texto_completo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
                (file_id, batch_id, status_final, error_message, steps_json_str, data_json_str, web_summary, texto_completo)
            )
            db.commit()
            result_id = cursor.lastrowid
            logging.info(f"Resultado salvo para o arquivo ID {file_id} (Result ID: {result_id})")
            return result_id
        except Exception as e:
            db.rollback()
            logging.error(f"Erro ao criar resultado para arquivo ID {file_id}: {e}", exc_info=True)
            return None
    
    @staticmethod
    def get_batch_results_with_text(batch_id):
        """Obtém os resultados de um batch com texto completo para uso no chat"""
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                "SELECT r.texto_completo, f.original_name FROM results r JOIN files f ON r.file_id = f.file_id WHERE r.batch_id = ? AND r.status_final LIKE 'Sucesso%' AND r.texto_completo IS NOT NULL", 
                (batch_id,)
            )
            return cursor.fetchall()
        except Exception as e:
            logging.error(f"Erro ao obter resultados do batch {batch_id}: {e}", exc_info=True)
            return []

class ChatModel:
    """Modelo para operações com histórico de chat"""
    
    @staticmethod
    def create(batch_id, user_message, model_reply):
        """Salva uma conversa no histórico de chat"""
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                'INSERT INTO chat_history (batch_id, user_message, model_reply) VALUES (?, ?, ?)', 
                (batch_id, user_message, model_reply)
            )
            db.commit()
            chat_id = cursor.lastrowid
            logging.info(f"Mensagem de chat salva para o batch {batch_id} (Chat ID: {chat_id})")
            return chat_id
        except Exception as e:
            db.rollback()
            logging.error(f"Erro ao salvar mensagem de chat para batch {batch_id}: {e}", exc_info=True)
            return None
    
    @staticmethod
    def get_history(batch_id, limit=10):
        """Obtém o histórico de chat de um batch"""
        try:
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                "SELECT user_message, model_reply FROM chat_history WHERE batch_id = ? ORDER BY timestamp DESC LIMIT ?", 
                (batch_id, limit * 2)  # Multiplica por 2 pois cada conversa tem pergunta e resposta
            )
            return cursor.fetchall()
        except Exception as e:
            logging.error(f"Erro ao obter histórico de chat do batch {batch_id}: {e}", exc_info=True)
            return []