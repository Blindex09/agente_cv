# -*- coding: utf-8 -*-
import os
import logging
import zipfile
import shutil
import uuid
from werkzeug.utils import secure_filename
from PyPDF2 import PdfReader
from docx import Document
from flask import current_app

def allowed_file(filename):
    """Verifica se o arquivo tem uma extensão permitida"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in current_app.config['ALLOWED_EXTENSIONS']

def allowed_cv_file(filename):
    """Verifica se o arquivo tem uma extensão válida para CV"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in current_app.config['CV_EXTENSIONS']

def ler_texto_pdf(caminho_arquivo):
    """Extrai texto de um arquivo PDF"""
    texto_completo = ""
    logging.info(f"Iniciando leitura PDF: '{caminho_arquivo}'")
    try:
        with open(caminho_arquivo, 'rb') as arquivo:
            leitor_pdf = PdfReader(arquivo)
            num_paginas_inicial = len(leitor_pdf.pages)
            logging.info(f"PDF aberto. Páginas: {num_paginas_inicial}")
            
            if leitor_pdf.is_encrypted:
                logging.warning("PDF está criptografado!")
                try:
                    decrypt_result = leitor_pdf.decrypt('')
                    logging.info(f"Tentativa de decrypt retornou: {decrypt_result}")
                    if decrypt_result == 0:
                        logging.error("Falha ao descriptografar PDF com senha vazia.")
                        return None
                except Exception as e_decrypt:
                    logging.error(f"Erro ao tentar descriptografar PDF: {e_decrypt}", exc_info=True)
                    return None
                    
            num_paginas = len(leitor_pdf.pages)
            if num_paginas == 0 and num_paginas_inicial > 0:
                logging.warning("PDF ficou com 0 páginas após tentativa de descriptografar.")
                return None
            elif num_paginas == 0:
                logging.warning("PDF com 0 páginas.")
                
            for i, pagina in enumerate(leitor_pdf.pages):
                try:
                    texto_pagina = pagina.extract_text()
                    if texto_pagina:
                        texto_completo += texto_pagina + "\n"
                    else:
                        logging.warning(f"Página {i+1} do PDF sem texto extraível.")
                except Exception as e_pagina:
                    logging.warning(f"Erro ao extrair texto da página {i+1} do PDF: {e_pagina}")
                    
            logging.info(f"Leitura PDF concluída. Caracteres extraídos: {len(texto_completo)}")
            if not texto_completo.strip() and num_paginas > 0:
                logging.warning("Nenhum texto foi extraído (PDF pode ser apenas imagem).")
            return texto_completo
    except Exception as e:
        logging.error(f"Erro fatal ao ler PDF '{caminho_arquivo}': {e}", exc_info=True)
        return None

def ler_texto_docx(caminho_arquivo):
    """Extrai texto de um arquivo DOCX"""
    texto_completo = ""
    logging.info(f"Iniciando leitura DOCX: '{caminho_arquivo}'")
    try:
        documento = Document(caminho_arquivo)
        paragrafos = documento.paragraphs
        logging.info(f"DOCX aberto. Parágrafos: {len(paragrafos)}")
        
        if not paragrafos:
            logging.warning("DOCX não contém parágrafos.")
            
        for i, paragrafo in enumerate(paragrafos):
            paragrafo_texto = paragrafo.text
            if paragrafo_texto:
                texto_completo += paragrafo_texto + "\n"
                
        logging.info(f"Leitura DOCX concluída. Caracteres extraídos: {len(texto_completo)}")
        return texto_completo
    except Exception as e:
        logging.error(f"Erro ao ler DOCX '{caminho_arquivo}': {e}", exc_info=True)
        return None

def extrair_arquivos_zip(zip_path, extract_folder, batch_id, file_records_callback):
    """Extrai arquivos de um ZIP e chama um callback para cada arquivo válido extraído"""
    logging.info(f"Extraindo ZIP: {zip_path} para {extract_folder}")
    extracted_count = 0
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for member_info in zip_ref.infolist():
                if member_info.is_dir() or '..' in member_info.filename or member_info.filename.startswith('/'):
                    continue
                    
                member_filename = os.path.basename(member_info.filename)
                if member_filename and allowed_cv_file(member_filename):
                    try:
                        target_path = os.path.join(extract_folder, member_info.filename)
                        os.makedirs(os.path.dirname(target_path), exist_ok=True)
                        zip_ref.extract(member_info.filename, path=extract_folder)
                        extracted_file_path = os.path.join(extract_folder, member_info.filename)
                        
                        if os.path.exists(extracted_file_path):
                            # Chama o callback para registrar o arquivo extraído
                            file_id = file_records_callback(batch_id, member_filename, extracted_file_path, is_extracted=1)
                            if file_id:
                                extracted_count += 1
                    except Exception as e_extract_item:
                        logging.error(f"Erro extrair item {member_info.filename}: {e_extract_item}", exc_info=True)
                        yield {'type':'error', 'filename': os.path.basename(zip_path), 'message': f'Erro extrair item {member_info.filename}'}
                else:
                    yield {'type': 'warning', 'filename': os.path.basename(zip_path), 'message': f'Ignorando item ZIP: {member_info.filename}'}
                    
        yield {'type':'status', 'filename': os.path.basename(zip_path), 'message': f'ZIP extraído. {extracted_count} CVs válidos encontrados.'}
    except zipfile.BadZipFile:
        logging.error(f"Erro: ZIP corrompido - {os.path.basename(zip_path)}", exc_info=True)
        yield {'type':'error', 'filename': os.path.basename(zip_path), 'message': 'Arquivo ZIP corrompido.'}
    except Exception as e_zip:
        logging.error(f"Erro geral extrair ZIP {os.path.basename(zip_path)}: {e_zip}", exc_info=True)
        yield {'type':'error', 'filename': os.path.basename(zip_path), 'message': f'Erro geral ao extrair ZIP.'}