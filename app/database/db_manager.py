# -*- coding: utf-8 -*-
import os
import sqlite3
import logging
from flask import g, current_app

def get_db():
    """Obtém a conexão com o banco de dados para a requisição atual."""
    db = getattr(g, '_database', None)
    if db is None:
        db_path = current_app.config['DATABASE']
        logging.info(f"Conectando ao banco de dados: {db_path}")
        db = g._database = sqlite3.connect(db_path)
        db.row_factory = sqlite3.Row
    return db

def close_connection(exception):
    """Fecha a conexão com o banco de dados ao final da requisição."""
    db = getattr(g, '_database', None)
    if db is not None:
        logging.info("Fechando conexão com o banco de dados.")
        db.close()

def init_db():
    """Inicializa o banco de dados criando as tabelas se não existirem."""
    try:
        logging.info("Inicializando o banco de dados (se necessário)...")
        db = sqlite3.connect(current_app.config['DATABASE'])
        cursor = db.cursor()
        
        # Criação da tabela batches
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS batches (
                batch_id TEXT PRIMARY KEY, 
                status TEXT NOT NULL, 
                flags_json TEXT,
                initial_instruction TEXT, 
                quota_error_occurred INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ) ''')
        
        # Criação da tabela files
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS files (
                file_id INTEGER PRIMARY KEY AUTOINCREMENT, 
                batch_id TEXT NOT NULL,
                original_name TEXT NOT NULL, 
                saved_path TEXT NOT NULL,
                is_extracted_from_zip INTEGER DEFAULT 0,
                FOREIGN KEY (batch_id) REFERENCES batches (batch_id) ) ''')
        
        # Criação da tabela results
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS results (
                result_id INTEGER PRIMARY KEY AUTOINCREMENT, 
                file_id INTEGER NOT NULL,
                batch_id TEXT NOT NULL, 
                status_final TEXT, 
                error_message TEXT,
                steps_json TEXT, 
                data_json TEXT, 
                web_summary TEXT, 
                texto_completo TEXT,
                FOREIGN KEY (file_id) REFERENCES files (file_id),
                FOREIGN KEY (batch_id) REFERENCES batches (batch_id) ) ''')
        
        # Criação da tabela chat_history
        cursor.execute('''
             CREATE TABLE IF NOT EXISTS chat_history (
                 chat_id INTEGER PRIMARY KEY AUTOINCREMENT, 
                 batch_id TEXT NOT NULL,
                 user_message TEXT, 
                 model_reply TEXT,
                 timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 FOREIGN KEY (batch_id) REFERENCES batches (batch_id) ) ''')
        
        db.commit()
        db.close()
        logging.info("Banco de dados inicializado com sucesso.")
    except Exception as e:
        logging.error(f"Erro ao inicializar o banco de dados: {e}", exc_info=True)
        raise