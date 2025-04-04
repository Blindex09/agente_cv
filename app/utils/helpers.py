# -*- coding: utf-8 -*-
import os
import math  # Adicionado import math para format_bytes
from flask import current_app

def allowed_file(filename):
    """Verifica se um arquivo tem uma extensão permitida."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in current_app.config['ALLOWED_EXTENSIONS']

def allowed_cv_file(filename):
    """Verifica se um arquivo tem uma extensão válida para CV."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in current_app.config['CV_EXTENSIONS']

def format_bytes(bytes, decimals=2):
    """Formata bytes para representação legível (KB, MB, etc.)."""
    if bytes == 0:
        return '0 Bytes'
    k = 1024
    dm = decimals
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    i = int(math.floor(math.log(bytes) / math.log(k)))
    return f"{round(bytes / (k ** i), dm)} {sizes[i]}"