# -*- coding: utf-8 -*-
from app import create_app

app = create_app()

if __name__ == '__main__':
    from app.config import inicializar_modelo_gemini
    
    if not inicializar_modelo_gemini():
        print("\n!!! ERRO FATAL: Falha inicializar cliente GenAI para Gemma 3. Saindo. !!!")
        exit(1)
    else:
        print("\n--- Configuração (Contexto 2025) ---")
        print(f"Uploads: {app.config['UPLOAD_FOLDER']}")
        print(f"DB: {app.config['DATABASE']}")
        print(f"Extensões: {app.config['ALLOWED_EXTENSIONS']}")
        print(f"Modelo IA: {app.config['NOME_MODELO_GEMMA']}")
        print(f"Pausas: IA={app.config['PAUSA_ENTRE_CHAMADAS_IA']}s, Arquivos={app.config['PAUSA_ENTRE_ARQUIVOS']}s")
        print("-------------------------------------\n")
        app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=True)