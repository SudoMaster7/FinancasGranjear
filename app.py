# -*- coding: utf-8 -*-
import os
import sys
import json
from datetime import datetime
from pathlib import Path

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

try:
    import gspread
    from oauth2client.service_account import ServiceAccountCredentials
    GSPREAD_AVAILABLE = True
    print("✓ gspread e oauth2client carregados")
except Exception as e:
    print(f"❌ Erro ao importar dependências: {e}")
    GSPREAD_AVAILABLE = False

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# --- CONFIGURAÇÃO ---
NOME_DA_PLANILHA = "Finanças Espaço Granjear"
ABA_TRANSACOES = "Transacoes"
ABA_PROFISSIONAIS = "Profissionais"

def get_google_sheets_client():
    """Retorna cliente gspread autorizado"""
    if not GSPREAD_AVAILABLE:
        raise ImportError("gspread não disponível")
    
    SCOPE = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/drive"
    ]
    
    # Tenta variável de ambiente (Vercel)
    creds_json = os.getenv("GOOGLE_CREDENTIALS_JSON")
    
    if creds_json:
        print("✓ Usando credenciais da variável de ambiente")
        try:
            # Remove possíveis aspas extras
            creds_json = creds_json.strip()
            if creds_json.startswith("'") or creds_json.startswith('"'):
                creds_json = creds_json[1:-1]
            
            creds_dict = json.loads(creds_json)
            creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, SCOPE)
        except json.JSONDecodeError as e:
            print(f"❌ Erro ao parsear JSON: {e}")
            raise
    else:
        # Tenta arquivo local
        print("✓ Usando credentials.json local")
        creds_path = "credentials.json"
        if not os.path.exists(creds_path):
            raise FileNotFoundError("❌ credentials.json não encontrado")
        creds = ServiceAccountCredentials.from_json_keyfile_name(creds_path, SCOPE)
    
    return gspread.authorize(creds)

def safe_float(value, default=0.0):
    """Converte valor monetário BR para float"""
    try:
        if value is None or value == '':
            return default
        if isinstance(value, (int, float)):
            return float(value)
        
        s = str(value).strip()
        s = s.replace('R$', '').replace('r$', '').strip()
        
        if ',' in s and '.' in s:
            s = s.replace('.', '').replace(',', '.')
        elif ',' in s:
            s = s.replace(',', '.')
        
        s = ''.join(ch for ch in s if (ch.isdigit() or ch in '-+.'))
        return float(s) if s not in ['', '-', '+'] else default
    except:
        return default

# --- ROTAS DE PÁGINA ---
@app.route('/')
def index():
    return render_template('lancamentos.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

# --- API: /api/profissionais ---
@app.route('/api/profissionais', methods=['GET', 'POST'])
def api_profissionais():
    if not GSPREAD_AVAILABLE:
        return jsonify({"error": "❌ Dependências não disponíveis"}), 500
    
    try:
        client = get_google_sheets_client()
        sheet = client.open(NOME_DA_PLANILHA).worksheet(ABA_PROFISSIONAIS)
    except Exception as e:
        print(f"❌ Erro ao acessar planilha: {e}")
        return jsonify({"error": f"Erro ao acessar planilha: {str(e)}"}), 500

    if request.method == 'GET':
        try:
            records = sheet.get_all_records()
            print(f"✓ {len(records)} profissionais carregados")
            return jsonify(records), 200
        except Exception as e:
            print(f"❌ Erro ao ler: {e}")
            return jsonify({"error": str(e)}), 500

    # POST
    payload = request.get_json() or {}
    unidade = (payload.get('unidade') or '').strip()
    nome = (payload.get('nome') or '').strip()
    
    if not nome or not unidade:
        return jsonify({"error": "Nome e unidade obrigatórios"}), 400
    
    try:
        headers = sheet.row_values(1)
        row = []
        for h in headers:
            h_lower = h.lower().strip()
            if h_lower == 'unidade':
                row.append(unidade)
            elif h_lower == 'nome':
                row.append(nome)
            elif h_lower == 'especialidade':
                row.append(payload.get('especialidade', ''))
            elif h_lower == 'valor_atendimento':
                row.append(payload.get('valor_atendimento', '0.00'))
            else:
                row.append('')
        
        sheet.append_row(row)
        return jsonify({"message": "Salvo com sucesso"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- API: /api/transacoes ---
@app.route('/api/transacoes', methods=['GET', 'POST'])
def api_transacoes():
    if not GSPREAD_AVAILABLE:
        return jsonify({"error": "❌ Dependências não disponíveis"}), 500
    
    try:
        client = get_google_sheets_client()
        sheet = client.open(NOME_DA_PLANILHA).worksheet(ABA_TRANSACOES)
    except Exception as e:
        print(f"❌ Erro ao acessar planilha: {e}")
        return jsonify({"error": str(e)}), 500

    if request.method == 'GET':
        try:
            records = sheet.get_all_records()
            print(f"✓ {len(records)} transações carregadas")
            return jsonify(records), 200
        except Exception as e:
            print(f"❌ Erro: {e}")
            return jsonify({"error": str(e)}), 500

    # POST
    payload = request.get_json() or {}
    required = ['unidade', 'data', 'tipo', 'categoria', 'descricao', 'valor']
    
    for field in required:
        if not payload.get(field):
            return jsonify({"error": f"Campo obrigatório: {field}"}), 400
    
    try:
        headers = sheet.row_values(1)
        row = []
        for h in headers:
            h_lower = h.lower().strip()
            if h_lower == 'unidade':
                row.append(payload['unidade'])
            elif h_lower == 'data':
                row.append(payload['data'])
            elif h_lower == 'tipo':
                row.append(payload['tipo'])
            elif h_lower == 'categoria':
                row.append(payload['categoria'])
            elif h_lower == 'descricao':
                row.append(payload['descricao'])
            elif h_lower == 'valor':
                row.append(payload['valor'])
            elif h_lower in ['forma_pagamento', 'forma de pagamento']:
                row.append(payload.get('forma_pagamento', 'Dinheiro'))
            elif h_lower in ['qtd_atendimentos', 'qtd atendimentos']:
                row.append(payload.get('qtd_atendimentos', ''))
            else:
                row.append('')
        
        sheet.append_row(row)
        return jsonify({"message": "Salvo com sucesso"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- API: /api/dashboard ---
@app.route('/api/dashboard', methods=['GET'])
def api_dashboard():
    if not GSPREAD_AVAILABLE:
        return jsonify({"error": "❌ Dependências não disponíveis"}), 500
    
    try:
        client = get_google_sheets_client()
        sheet = client.open(NOME_DA_PLANILHA).worksheet(ABA_TRANSACOES)
        records = sheet.get_all_records()
        
        if not records:
            return jsonify({
                "kpis": {"receita": 0, "despesa": 0, "saldo": 0},
                "despesas_por_categoria": {},
                "receita_vs_despesa": {"labels": ["Receita", "Despesa"], "receitas": [0], "despesas": [0]},
                "performance_unidades": {},
                "top_profissionais": []
            }), 200

        # Filtros
        data_inicio = request.args.get('data_inicio', '')
        data_fim = request.args.get('data_fim', '')
        unidade_filter = (request.args.get('unidade') or '').lower()

        receita_total = 0
        despesa_total = 0
        despesas_por_categoria = {}
        performance_unidades = {}
        profissionais_dict = {}

        for record in records:
            rec = {k.lower().strip(): v for k, v in record.items()}
            
            data = rec.get('data', '')
            tipo = (rec.get('tipo', '') or '').lower()
            categoria = rec.get('categoria', '')
            descricao = rec.get('descricao', '')
            unidade = rec.get('unidade', '')
            valor = safe_float(rec.get('valor', 0))
            qtd_atend = safe_float(rec.get('qtd_atendimentos', 0))

            # Filtros
            if data_inicio and data < data_inicio:
                continue
            if data_fim and data > data_fim:
                continue
            if unidade_filter and unidade_filter != 'todas' and unidade.lower() != unidade_filter:
                continue

            # KPIs
            if tipo == 'receita':
                receita_total += valor
            elif tipo == 'despesa':
                despesa_total += valor

            # Despesas por categoria
            if tipo == 'despesa':
                despesas_por_categoria[categoria] = despesas_por_categoria.get(categoria, 0) + valor

            # Performance unidades
            if unidade not in performance_unidades:
                performance_unidades[unidade] = 0
            performance_unidades[unidade] += valor if tipo == 'receita' else -valor

            # Top profissionais
            if categoria.lower() == 'profissionais da clínica' and tipo == 'despesa':
                if descricao not in profissionais_dict:
                    profissionais_dict[descricao] = {
                        'atendimentos': 0,
                        'valor_unitario': valor / max(qtd_atend, 1)
                    }
                profissionais_dict[descricao]['atendimentos'] += int(qtd_atend) if qtd_atend > 0 else 1

        top_prof = sorted(
            [
                {
                    'nome': nome,
                    'atendimentos': dados['atendimentos'],
                    'valor_por_atendimento': dados['valor_unitario'],
                    'valor_total': dados['atendimentos'] * dados['valor_unitario']
                }
                for nome, dados in profissionais_dict.items()
            ],
            key=lambda x: x['valor_total'],
            reverse=True
        )[:5]

        return jsonify({
            "kpis": {
                "receita": round(receita_total, 2),
                "despesa": round(despesa_total, 2),
                "saldo": round(receita_total - despesa_total, 2)
            },
            "despesas_por_categoria": {k: round(v, 2) for k, v in despesas_por_categoria.items()},
            "receita_vs_despesa": {
                "labels": ["Receita", "Despesa"],
                "receitas": [round(receita_total, 2)],
                "despesas": [round(despesa_total, 2)]
            },
            "performance_unidades": {k: round(v, 2) for k, v in performance_unidades.items()},
            "top_profissionais": top_prof
        }), 200

    except Exception as e:
        print(f"❌ Erro dashboard: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# Para Vercel
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
