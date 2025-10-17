document.addEventListener('DOMContentLoaded', function () {

    // --- VARIÁVEIS GLOBAIS ---
    let transacoes = [];
    let filteredTransacoes = [];
    let profissionais = [];
    
    const API_BASE = window.location.origin;
    
    function apiUrl(path) {
        if (!path.startsWith('/')) path = '/' + path;
        return API_BASE + path;
    }

    // --- ELEMENTOS DO DOM ---
    const formTransacao = document.getElementById('form-transacao');
    const dataEl = document.getElementById('data');
    const tipoSelect = document.getElementById('tipo');
    const categoriaSelect = document.getElementById('categoria');
    const campoDescricao = document.getElementById('campo-descricao');
    const campoProfissional = document.getElementById('campo-profissional');
    const campoValorProf = document.getElementById('campo-valor-profissional');
    const campoQtdAtend = document.getElementById('campo-qtd-atendimentos');
    const profissionalSelect = document.getElementById('profissional');
    const tabelaBody = document.getElementById('tabela-transacoes');
    const semTransacoes = document.getElementById('sem-transacoes');
    const spinner = document.getElementById('loadingSpinner');
    const formProfissional = document.getElementById('form-profissional');
    const btnSubmitTransacao = formTransacao?.querySelector('button[type="submit"]');

    // Elementos de filtro
    const filtroUnidade = document.getElementById('filtro-unidade');
    const filtroMes = document.getElementById('filtro-mes');
    const filtroBusca = document.getElementById('filtro-busca');

    // --- FUNÇÕES DE UTILIDADE ---
    const showSpinner = () => spinner?.classList.remove('d-none');
    const hideSpinner = () => spinner?.classList.add('d-none');

    function formatCurrency(value) {
        const n = Number(String(value).replace(/\./g, '').replace(',', '.')) || 0;
        return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function applyCurrencyMask(input) {
        if (!input) return;
        input.addEventListener('input', function(e) {
            let v = e.target.value.replace(/\D/g, '');
            v = v.substring(0, 15);
            while (v.length < 3) v = '0' + v;
            const cents = v.slice(-2);
            let integerPart = v.slice(0, -2);
            integerPart = integerPart.replace(/^0+/, '') || '0';
            integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            e.target.value = integerPart + ',' + cents;
        });
        input.addEventListener('blur', function(e) {
            if (!e.target.value || e.target.value.trim() === '') e.target.value = '0,00';
        });
    }

    function normalizeCurrencyToNumberString(str) {
        if (str === null || str === undefined) return "0.00";
        let s = String(str).replace(/\s/g, '').replace(/R\$/gi, '');
        s = s.replace(/[^0-9\.,-]/g, '');
        if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else if (s.indexOf(',') > -1 && s.indexOf('.') === -1) {
            s = s.replace(',', '.');
        }
        const n = parseFloat(s);
        if (isNaN(n)) return "0.00";
        return n.toFixed(2);
    }

    // Aplica máscara monetária
    applyCurrencyMask(document.getElementById('valor'));
    applyCurrencyMask(document.getElementById('valor-profissional'));
    applyCurrencyMask(document.getElementById('prof-valor'));

    // --- NORMALIZAÇÃO DE REGISTROS ---
    function normalizeRecord(rec) {
        if (!rec || typeof rec !== 'object') return {};
        
        const lower = {};
        Object.keys(rec).forEach(k => lower[k.toLowerCase().trim()] = rec[k]);

        let rawDate = rec.data || rec.Data || lower['data'] || '';
        let data_iso = '';
        let data_month = '';
        
        try {
            if (rawDate) {
                let d = new Date(rawDate);
                if (isNaN(d)) {
                    const parts = String(rawDate).split(/[\/\-\.]/);
                    if (parts.length === 3) {
                        d = new Date(parts[2], Number(parts[1]) - 1, parts[0]);
                    }
                }
                if (!isNaN(d)) {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    data_iso = `${yyyy}-${mm}-${dd}`;
                    data_month = `${yyyy}-${mm}`;
                }
            }
        } catch (err) {
            console.error('Erro ao processar data:', err);
        }

        return {
            unidade: rec.unidade || rec.Unidade || lower['unidade'] || '',
            data: rawDate || '',
            data_iso: data_iso,
            data_month: data_month,
            tipo: rec.tipo || rec.Tipo || lower['tipo'] || '',
            categoria: rec.categoria || rec.Categoria || lower['categoria'] || '',
            descricao: rec.descricao || rec.Descrição || rec.Descricao || lower['descricao'] || '',
            valor: rec.valor || rec.Valor || lower['valor'] || 0,
            forma_pagamento: rec.forma_pagamento || rec['Forma de Pagamento'] || lower['forma_pagamento'] || '',
            qtd_atendimentos: rec.qtd_atendimentos || rec.Qtd || lower['qtd_atendimentos'] || 0,
            __raw: rec
        };
    }

    // --- CARREGAMENTO DE DADOS ---
    async function carregarProfissionais() {
        try {
            const res = await fetch(apiUrl('/api/profissionais'));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            profissionais = Array.isArray(data) ? data : [];
            console.log('✓ Profissionais carregados:', profissionais.length);
        } catch (e) {
            console.error('✗ Erro ao carregar profissionais:', e);
            profissionais = [];
        }
    }

    async function carregarTransacoes() {
        const url = apiUrl('/api/transacoes');
        showSpinner();
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            let records = Array.isArray(data) ? data : [];
            
            transacoes = records.map(r => normalizeRecord(r));
            console.log('✓ Transações carregadas:', transacoes.length);
            console.log('📊 Dados das transações:', transacoes);
            applyFilters();
        } catch (e) {
            console.error('✗ Erro ao carregar transações:', e);
            transacoes = [];
            filteredTransacoes = [];
            renderTabela();
        } finally {
            hideSpinner();
        }
    }

    // --- FILTROS ---
    function applyFilters() {
        console.log('🔍 Aplicando filtros...');
        
        // Coleta valores dos filtros
        const uniFilter = (filtroUnidade?.value || '').trim();
        const mesFilter = (filtroMes?.value || '').trim();
        const buscaFilter = (filtroBusca?.value || '').trim().toLowerCase();

        console.log('Valores dos filtros:', {
            unidade: uniFilter,
            mes: mesFilter,
            busca: buscaFilter
        });

        // Aplica filtros
        filteredTransacoes = transacoes.filter(t => {
            console.log(`Verificando transação: ${t.descricao} (${t.unidade})`);
            
            // Filtro por unidade
            if (uniFilter && uniFilter !== '') {
                const uniMatch = (t.unidade || '').toString().trim() === uniFilter;
                console.log(`  Unidade: ${t.unidade} === ${uniFilter} ? ${uniMatch}`);
                if (!uniMatch) return false;
            }

            // Filtro por mês
            if (mesFilter) {
                const mesMatch = (t.data_month || '') === mesFilter;
                console.log(`  Mês: ${t.data_month} === ${mesFilter} ? ${mesMatch}`);
                if (!mesMatch) return false;
            }

            // Filtro por busca
            if (buscaFilter) {
                const hay = (
                    (t.descricao || '') + ' ' +
                    (t.categoria || '') + ' ' +
                    (t.unidade || '')
                ).toLowerCase();
                const buscaMatch = hay.includes(buscaFilter);
                console.log(`  Busca: "${buscaFilter}" em "${hay.substring(0, 50)}..." ? ${buscaMatch}`);
                if (!buscaMatch) return false;
            }

            return true;
        });

        console.log(`✓ ${filteredTransacoes.length} transações após filtro`);
        renderTabela();
    }

    function debounce(fn, wait = 300) {
        let t;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    // Listeners de filtro com debug
    if (filtroUnidade) {
        filtroUnidade.addEventListener('change', () => {
            console.log('🔄 Filtro unidade mudou:', filtroUnidade.value);
            applyFilters();
        });
    }

    if (filtroMes) {
        filtroMes.addEventListener('change', () => {
            console.log('🔄 Filtro mês mudou:', filtroMes.value);
            applyFilters();
        });
    }

    if (filtroBusca) {
        filtroBusca.addEventListener('input', debounce(() => {
            console.log('🔄 Filtro busca mudou:', filtroBusca.value);
            applyFilters();
        }, 300));
    }

    // --- RENDERIZAÇÃO ---
    function renderTabela() {
        if (!tabelaBody) {
            console.error('❌ tabelaBody não encontrado!');
            return;
        }
        
        console.log('📋 Renderizando tabela...');
        tabelaBody.innerHTML = '';
        
        // Usa filtered se houver filtros ativos, senão usa todas
        const temFiltroAtivo = 
            (filtroUnidade?.value || '') !== '' || 
            (filtroMes?.value || '') !== '' || 
            (filtroBusca?.value || '').trim() !== '';
        
        const lista = temFiltroAtivo ? filteredTransacoes : transacoes;
        
        console.log(`Total para renderizar: ${lista.length} (filtro ativo: ${temFiltroAtivo})`);
        
        if (!lista || lista.length === 0) {
            console.log('⚠️ Nenhuma transação para exibir');
            if (semTransacoes) semTransacoes.classList.remove('d-none');
            return;
        }
        
        if (semTransacoes) semTransacoes.classList.add('d-none');

        lista.forEach((t, idx) => {
            const valor = formatCurrency(t.valor || 0);
            const data = t.data_iso ? new Date(t.data_iso + 'T00:00:00').toLocaleDateString('pt-BR') : (t.data || '');
            const tipoClass = (t.tipo || '').toLowerCase() === 'receita' ? 'table-success' : 'table-danger';
            const badgeClass = tipoClass === 'table-success' ? 'bg-success' : 'bg-danger';
            
            const row = `
                <tr class="${tipoClass}">
                    <td>${data}</td>
                    <td>${t.unidade || ''}</td>
                    <td><span class="badge ${badgeClass}">${t.tipo || ''}</span></td>
                    <td>${t.categoria || ''}</td>
                    <td>${t.descricao || ''}</td>
                    <td class="text-end fw-bold">${valor}</td>
                </tr>
            `;
            tabelaBody.insertAdjacentHTML('beforeend', row);
        });

        console.log(`✓ ${lista.length} linhas renderizadas`);
    }

    // --- CATEGORIAS POR UNIDADE E TIPO ---
    const categoriasPorUnidadeETipo = {
        'Xerém': {
            'Receita': [
                'Consultas',
                'Terapias',
                'Palestras',
                'Aluguel de espaço',
                'Produtos vendidos',
                'Doações',
                'Outra Receita'
            ],
            'Despesa': [
                'Profissionais da clínica',
                'Cartão',
                'Passagem Vicente',
                'Secretária Duayne',
                'Recarga Celular',
                'Câmera de Segurança e Alarme',
                'Cesta Básica',
                'Assistente Administrativo',
                'Contador',
                'Sítio',
                'Luz',
                'Nota de controle',
                'FGTS',
                'Documento de Arrecadação - Receita Federal',
                'Documento de Arrecadação - Simples Nacional',
                'Internet',
                'Faxina',
                'Mídia',
                'Outra Despesa'
            ]
        },
        'Duque de Caxias': {
            'Receita': [
                'Consultas',
                'Terapias',
                'Palestras',
                'Aluguel de espaço',
                'Produtos vendidos',
                'Doações',
                'Outra Receita'
            ],
            'Despesa': [
                'Profissionais da clínica',
                'Outra Despesa'
            ]
        },
        'São Cristóvão': {
            'Receita': [
                'Consultas',
                'Terapias',
                'Palestras',
                'Aluguel de espaço',
                'Produtos vendidos',
                'Doações',
                'Outra Receita'
            ],
            'Despesa': [
                'Profissionais da clínica',
                'Outra Despesa'
            ]
        },
        'Botafogo': {
            'Receita': [
                'Consultas',
                'Terapias',
                'Palestras',
                'Aluguel de espaço',
                'Produtos vendidos',
                'Doações',
                'Outra Receita'
            ],
            'Despesa': [
                'Profissionais da clínica',
                'Outra Despesa'
            ]
        }
    };

    // --- ATUALIZAR CATEGORIAS (AGORA COM TIPO) ---
    function atualizarCategorias() {
        const unidadeEl = document.getElementById('unidade');
        const tipoEl = document.getElementById('tipo');
        
        const unidade = (unidadeEl?.value || '').trim();
        const tipo = (tipoEl?.value || '').trim();
        
        console.log('🔄 Atualizando categorias:', { unidade, tipo });

        // Busca categorias baseado em unidade E tipo
        let categorias = ['Outra Despesa'];
        
        // Se tem unidade E tipo selecionados
        if (unidade && tipo) {
            if (categoriasPorUnidadeETipo[unidade]) {
                if (categoriasPorUnidadeETipo[unidade][tipo]) {
                    categorias = categoriasPorUnidadeETipo[unidade][tipo];
                    console.log(`✓ Categorias para ${unidade} - ${tipo}:`, categorias);
                } else {
                    console.log(`⚠️ Tipo "${tipo}" não encontrado para ${unidade}`);
                    categorias = ['Outra Despesa'];
                }
            } else {
                console.log(`⚠️ Unidade "${unidade}" não encontrada`);
                categorias = ['Outra Despesa'];
            }
        } else {
            console.log('⚠️ Faltam unidade ou tipo selecionados');
            console.log(`  Unidade: "${unidade}" | Tipo: "${tipo}"`);
        }

        if (categoriaSelect) {
            const currentValue = categoriaSelect.value;
            categoriaSelect.innerHTML = '';
            
            categorias.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                categoriaSelect.appendChild(opt);
            });
            
            // Tenta manter valor anterior se existir na nova lista
            if (categorias.includes(currentValue)) {
                categoriaSelect.value = currentValue;
                console.log(`✓ Manteve categoria anterior: ${currentValue}`);
            } else {
                categoriaSelect.value = categorias[0];
                console.log(`✓ Selecionou primeira categoria: ${categorias[0]}`);
            }
        }
        
        atualizarCamposProfissional();
    }

    // Listeners para mudar categorias quando UNIDADE ou TIPO mudam
    const unidadeEl = document.getElementById('unidade');
    const tipoEl = document.getElementById('tipo');

    if (unidadeEl) {
        unidadeEl.addEventListener('change', () => {
            console.log('🔔 UNIDADE MUDOU:', unidadeEl.value);
            atualizarCategorias();
        });
    }

    if (tipoEl) {
        tipoEl.addEventListener('change', () => {
            console.log('🔔 TIPO MUDOU:', tipoEl.value);
            atualizarCategorias();
        });
    }

    // --- CONTROLE DE CAMPOS (mantém o código anterior) ---
    function atualizarCamposProfissional() {
        const categoria = categoriaSelect?.value || '';
        const isPagamentoProfissional = categoria === 'Profissionais da clínica';
        const unidade = document.getElementById('unidade')?.value || '';

        if (isPagamentoProfissional) {
            if (campoProfissional) campoProfissional.classList.remove('d-none');
            if (campoQtdAtend) campoQtdAtend.classList.remove('d-none');
            if (campoDescricao) campoDescricao.classList.add('d-none');

            if (profissionalSelect) {
                profissionalSelect.innerHTML = '<option value="">Selecione...</option>';
                profissionais
                    .filter(p => !p.unidade || p.unidade === unidade)
                    .forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.nome || '';
                        const esp = p.especialidade ? ` - ${p.especialidade}` : '';
                        opt.textContent = `${p.nome || ''}${esp}`;
                        profissionalSelect.appendChild(opt);
                    });
            }
        } else {
            if (campoProfissional) campoProfissional.classList.add('d-none');
            if (campoQtdAtend) campoQtdAtend.classList.add('d-none');
            if (campoDescricao) campoDescricao.classList.remove('d-none');
        }
    }

    categoriaSelect?.addEventListener('change', atualizarCamposProfissional);

    // --- SUBMIT FORMULÁRIO TRANSAÇÃO ---
    if (formTransacao) {
        formTransacao.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            console.log('=== 🔄 INICIANDO SUBMIT DO FORMULÁRIO ===');
            
            if (btnSubmitTransacao) {
                btnSubmitTransacao.disabled = true;
                btnSubmitTransacao.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Enviando...';
            }

            try {
                const unidade = (document.getElementById('unidade')?.value || '').trim();
                const data = (dataEl?.value || '').trim();
                const tipo = (tipoSelect?.value || '').trim();
                const categoria = (categoriaSelect?.value || '').trim();
                const descricao_input = (document.getElementById('descricao')?.value || '').trim();
                const profissional = (profissionalSelect?.value || '').trim();
                const valor_input = (document.getElementById('valor')?.value || '').trim();
                const forma_pagamento = (document.getElementById('forma_pagamento')?.value || 'Dinheiro').trim();

                console.log('📋 Valores coletados:', {
                    unidade, data, tipo, categoria, 
                    descricao_input, profissional, valor_input, forma_pagamento
                });

                if (!unidade) throw new Error('❌ Selecione uma unidade');
                if (!data) throw new Error('❌ Selecione uma data');
                if (!tipo) throw new Error('❌ Selecione um tipo (Receita/Despesa)');
                if (!categoria) throw new Error('❌ Selecione uma categoria');

                const isPagamentoProfissional = categoria === 'Profissionais da clínica';
                let descricao = '';
                
                if (isPagamentoProfissional) {
                    descricao = profissional;
                    if (!descricao) throw new Error('❌ Selecione um profissional');
                } else {
                    descricao = descricao_input;
                    if (!descricao) throw new Error('❌ Preencha a descrição');
                }

                const valor = normalizeCurrencyToNumberString(valor_input);
                console.log('💰 Valor normalizado:', valor);

                if (parseFloat(valor) <= 0) {
                    throw new Error('❌ O valor deve ser maior que 0');
                }

                const payload = {
                    unidade: unidade,
                    data: data,
                    tipo: tipo,
                    categoria: categoria,
                    descricao: descricao,
                    valor: valor,
                    forma_pagamento: forma_pagamento
                };

                if (isPagamentoProfissional) {
                    const qtdEl = document.getElementById('qtd-atendimentos');
                    if (qtdEl?.value && qtdEl.value > 0) {
                        payload.qtd_atendimentos = Number(qtdEl.value);
                    }
                }

                console.log('📤 Payload final:', payload);

                const res = await fetch(apiUrl('/api/transacoes'), {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const responseData = await res.json();

                if (!res.ok) {
                    throw new Error(responseData.error || `❌ Erro HTTP ${res.status}`);
                }

                alert('✅ Lançamento salvo com sucesso!');
                console.log('✓ Transação salva com sucesso');
                
                await carregarTransacoes();
                formTransacao.reset();
                
                if (dataEl) {
                    dataEl.value = new Date().toISOString().split('T')[0];
                }
                
                atualizarCategorias();
                atualizarCamposProfissional();

            } catch (err) {
                console.error('❌ ERRO:', err);
                alert('❌ ERRO:\n\n' + (err.message || String(err)));
            } finally {
                if (btnSubmitTransacao) {
                    btnSubmitTransacao.disabled = false;
                    btnSubmitTransacao.innerHTML = '<i class="bi bi-check-circle"></i> Salvar Lançamento';
                }
            }
        });
    }

    // --- SUBMIT FORMULÁRIO PROFISSIONAL ---
    if (formProfissional) {
        const btnSubmitProf = formProfissional.querySelector('button[type="submit"]');
        
        formProfissional.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            console.log('=== 🔄 INICIANDO SUBMIT DO PROFISSIONAL ===');
            
            if (btnSubmitProf) {
                btnSubmitProf.disabled = true;
                btnSubmitProf.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Enviando...';
            }

            try {
                const unidade = (document.getElementById('prof-unidade')?.value || '').trim();
                const nome = (document.getElementById('prof-nome')?.value || '').trim();
                const especialidade = (document.getElementById('prof-especialidade')?.value || '').trim();
                const valor_atendimento = normalizeCurrencyToNumberString(document.getElementById('prof-valor')?.value || '0,00');

                if (!unidade) throw new Error('Selecione a unidade');
                if (!nome) throw new Error('Preencha o nome do profissional');

                const payload = {
                    unidade: unidade,
                    nome: nome,
                    especialidade: especialidade,
                    valor_atendimento: valor_atendimento
                };

                const res = await fetch(apiUrl('/api/profissionais'), {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                const responseData = await res.json();

                if (!res.ok) {
                    throw new Error(responseData.error || `Erro HTTP ${res.status}`);
                }

                alert('✅ Profissional salvo com sucesso!');
                
                await carregarProfissionais();
                atualizarCamposProfissional();
                
                const modalEl = document.getElementById('modalProfissional');
                const bsModal = bootstrap.Modal.getInstance(modalEl);
                if (bsModal) bsModal.hide();
                
                formProfissional.reset();

            } catch (err) {
                console.error('❌ Erro:', err);
                alert('❌ Erro:\n\n' + (err.message || String(err)));
            } finally {
                if (btnSubmitProf) {
                    btnSubmitProf.disabled = false;
                    btnSubmitProf.innerHTML = '<i class="bi bi-check-circle"></i> Salvar';
                }
            }
        });
    }

    // --- INICIALIZAÇÃO ---
    if (dataEl) {
        dataEl.value = new Date().toISOString().split('T')[0];
    }
    
    console.log('🚀 Iniciando aplicação...');
    (async () => {
        try {
            await carregarProfissionais();
            // NÃO chama atualizarCategorias() aqui - espera o usuário selecionar
            console.log('✓ Profissionais carregados');
            await carregarTransacoes();
            console.log('✓ Aplicação inicializada com sucesso!');
        } catch (err) {
            console.error('✗ Erro durante inicialização:', err);
        }
    })();
});