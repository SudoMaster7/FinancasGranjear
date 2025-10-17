# -*- coding: utf-8 -*-
import os
import json
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

try:
    import gspread
    from oauth2client.service_account import ServiceAccountCredentials
    import pandas as pd
    GSPREAD_AVAILABLE = True
except Exception as e:
    print(f"⚠️ Aviso: Dependências do Google Sheets não disponíveis: {e}")
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
        raise ImportError("gspread/oauth2client não instalados.")
    
    SCOPE = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    
    if os.getenv("GOOGLE_CREDENTIALS_JSON"):
        creds_dict = json.loads(os.getenv("GOOGLE_CREDENTIALS_JSON"))
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, SCOPE)
    else:
        if not os.path.exists("credentials.json"):
            raise FileNotFoundError("❌ credentials.json não encontrado na raiz do projeto")
        creds = ServiceAccountCredentials.from_json_keyfile_name("credentials.json", SCOPE)
    
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
        elif ',' in s and '.' not in s:
            s = s.replace(',', '.')
        
        s = ''.join(ch for ch in s if (ch.isdigit() or ch in '-+.'))
        return float(s) if s not in ['', '-', '+'] else default
    except Exception:
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
        print(f"❌ Erro ao acessar planilha Profissionais: {e}")
        return jsonify({"error": f"Erro ao acessar planilha: {str(e)}"}), 500

    if request.method == 'GET':
        try:
            records = sheet.get_all_records()
            print(f"✓ {len(records)} profissionais carregados")
            return jsonify(records), 200
        except Exception as e:
            print(f"❌ Erro ao ler profissionais: {e}")
            return jsonify({"error": f"Erro ao ler: {str(e)}"}), 500

    # POST - Novo profissional
    payload = request.get_json() or {}
    print(f"📤 POST Profissional: {payload}")
    
    unidade = (payload.get('unidade') or '').strip()
    nome = (payload.get('nome') or '').strip()
    
    if not nome:
        return jsonify({"error": "❌ Nome é obrigatório"}), 400
    if not unidade:
        return jsonify({"error": "❌ Unidade é obrigatória"}), 400
    
    try:
        # Pega headers da planilha
        headers = sheet.row_values(1)
        print(f"Headers da planilha: {headers}")
        
        # Constrói linha com valores
        row = []
        for h in headers:
            h_lower = h.lower().strip()
            # Mapeamento de possíveis nomes de coluna
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
        
        print(f"Inserindo linha: {row}")
        sheet.append_row(row)
        print(f"✓ Profissional '{nome}' salvo com sucesso")
        
        return jsonify({
            "message": "Profissional salvo com sucesso",
            "unidade": unidade,
            "nome": nome,
            "especialidade": payload.get('especialidade', ''),
            "valor_atendimento": payload.get('valor_atendimento', '0.00')
        }), 201
    except Exception as e:
        print(f"❌ Erro ao salvar profissional: {e}")
        return jsonify({"error": f"Erro ao salvar: {str(e)}"}), 500

# --- API: /api/transacoes ---
@app.route('/api/transacoes', methods=['GET', 'POST'])
def api_transacoes():
    if not GSPREAD_AVAILABLE:
        return jsonify({"error": "❌ Dependências não disponíveis"}), 500
    
    try:
        client = get_google_sheets_client()
        sheet = client.open(NOME_DA_PLANILHA).worksheet(ABA_TRANSACOES)
    except Exception as e:
        print(f"❌ Erro ao acessar planilha Transacoes: {e}")
        return jsonify({"error": f"Erro ao acessar planilha: {str(e)}"}), 500

    if request.method == 'GET':
        try:
            records = sheet.get_all_records()
            print(f"✓ {len(records)} transações carregadas")
            return jsonify(records), 200
        except Exception as e:
            print(f"❌ Erro ao ler transações: {e}")
            return jsonify({"error": f"Erro ao ler: {str(e)}"}), 500

    # POST - Nova transação
    payload = request.get_json() or {}
    print(f"📤 POST Transação: {payload}")
    
    # Validações básicas
    required_fields = ['unidade', 'data', 'tipo', 'categoria', 'descricao', 'valor']
    for field in required_fields:
        if not (payload.get(field) or ''):
            msg = f"❌ Campo obrigatório faltando: {field}"
            print(msg)
            return jsonify({"error": msg}), 400
    
    try:
        # Pega headers da planilha
        headers = sheet.row_values(1)
        print(f"Headers da planilha: {headers}")
        
        # Constrói linha com valores
        row = []
        for h in headers:
            h_lower = h.lower().strip()
            # Mapeamento de possíveis nomes de coluna
            if h_lower == 'unidade':
                row.append(payload.get('unidade', ''))
            elif h_lower == 'data':
                row.append(payload.get('data', ''))
            elif h_lower == 'tipo':
                row.append(payload.get('tipo', ''))
            elif h_lower == 'categoria':
                row.append(payload.get('categoria', ''))
            elif h_lower == 'descricao':
                row.append(payload.get('descricao', ''))
            elif h_lower == 'valor':
                row.append(payload.get('valor', '0.00'))
            elif h_lower == 'forma_pagamento' or h_lower == 'forma de pagamento':
                row.append(payload.get('forma_pagamento', 'Dinheiro'))
            elif h_lower == 'qtd_atendimentos' or h_lower == 'qtd atendimentos':
                row.append(payload.get('qtd_atendimentos', ''))
            else:
                row.append('')
        
        print(f"Inserindo linha: {row}")
        sheet.append_row(row)
        print(f"✓ Transação salva com sucesso")
        
        return jsonify({
            "message": "Transação salva com sucesso",
            "data": payload
        }), 201
    except Exception as e:
        print(f"❌ Erro ao salvar transação: {e}")
        return jsonify({"error": f"Erro ao salvar: {str(e)}"}), 500

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

        df = pd.DataFrame(records)
        df.columns = [c.lower().strip() for c in df.columns]
        df['valor_num'] = df['valor'].apply(safe_float)
        
        # Filtro por datas
        data_inicio = request.args.get('data_inicio')
        data_fim = request.args.get('data_fim')
        
        if data_inicio:
            print(f"📅 Filtrando a partir de: {data_inicio}")
            df = df[df['data'] >= data_inicio]
        if data_fim:
            print(f"📅 Filtrando até: {data_fim}")
            df = df[df['data'] <= data_fim]
        
        # Filtro por unidade
        unidade = request.args.get('unidade')
        if unidade and unidade.lower() != 'todas':
            print(f"🏢 Filtrando unidade: {unidade}")
            df = df[df['unidade'].str.lower() == unidade.lower()]

        # Calcula KPIs
        receitas = df[df['tipo'].str.lower() == 'receita']['valor_num'].sum()
        despesas = df[df['tipo'].str.lower() == 'despesa']['valor_num'].sum()
        saldo = receitas - despesas

        print(f"💰 KPIs - Receita: {receitas}, Despesa: {despesas}, Saldo: {saldo}")

        # Despesas por categoria
        despesas_df = df[df['tipo'].str.lower() == 'despesa']
        despesas_por_categoria = despesas_df.groupby('categoria')['valor_num'].sum().to_dict()
        print(f"📊 Despesas por categoria: {len(despesas_por_categoria)} categorias")

        # Performance por unidade
        performance_unidades = df.groupby('unidade').apply(
            lambda x: x[x['tipo'].str.lower() == 'receita']['valor_num'].sum() - 
                     x[x['tipo'].str.lower() == 'despesa']['valor_num'].sum()
        ).to_dict()
        print(f"📈 Performance unidades: {performance_unidades}")

        # TOP 5 PROFISSIONAIS - Filtra apenas "Profissionais da clínica"
        prof_df = df[
            (df['categoria'].str.lower() == 'profissionais da clínica') &
            (df['tipo'].str.lower() == 'despesa')
        ].copy()
        
        print(f"👥 Total de transações de profissionais: {len(prof_df)}")

        top_profissionais = []
        if len(prof_df) > 0:
            # Agrupa por descrição (nome do profissional)
            prof_agrupado = prof_df.groupby('descricao').agg({
                'qtd_atendimentos': lambda x: pd.to_numeric(x, errors='coerce').sum(),
                'valor_num': 'first'  # Pega o primeiro valor por atendimento
            }).reset_index()
            
            # Calcula valor total: qtd_atendimentos × valor_por_atendimento
            prof_agrupado['valor_total'] = prof_agrupado['qtd_atendimentos'] * prof_agrupado['valor_num']
            
            # Ordena por valor total descendente
            prof_agrupado = prof_agrupado.sort_values('valor_total', ascending=False).head(5)
            
            print(f"🏆 Top 5 profissionais encontrados:")
            for _, row in prof_agrupado.iterrows():
                nome = str(row['descricao']).strip() if row['descricao'] else 'N/A'
                atendimentos = int(row['qtd_atendimentos']) if pd.notna(row['qtd_atendimentos']) else 0
                valor_por_atend = float(row['valor_num']) if pd.notna(row['valor_num']) else 0.0
                valor_total = float(row['valor_total'])
                
                prof_dict = {
                    "nome": nome,
                    "atendimentos": atendimentos,
                    "valor_por_atendimento": valor_por_atend,
                    "valor_total": valor_total
                }
                top_profissionais.append(prof_dict)
                print(f"  - {nome}: {atendimentos} atend. × R$ {valor_por_atend:.2f} = R$ {valor_total:.2f}")

        return jsonify({
            "kpis": {
                "receita": float(receitas),
                "despesa": float(despesas),
                "saldo": float(saldo)
            },
            "despesas_por_categoria": {str(k): float(v) for k, v in despesas_por_categoria.items()},
            "receita_vs_despesa": {
                "labels": ["Receita", "Despesa"],
                "receitas": [float(receitas)],
                "despesas": [float(despesas)]
            },
            "performance_unidades": {str(k): float(v) for k, v in performance_unidades.items()},
            "top_profissionais": top_profissionais
        }), 200
    except Exception as e:
        print(f"❌ Erro no dashboard: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("🚀 Iniciando Finanças Espaço Granjear...")
    print(f"📊 Planilha: {NOME_DA_PLANILHA}")
    app.run(debug=True, port=5001)
