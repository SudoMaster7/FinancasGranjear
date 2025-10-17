document.addEventListener('DOMContentLoaded', function () {
        
    // --- VARIÁVEIS GLOBAIS ---
    const spinner = document.getElementById('loadingSpinner');
    let chartDespesas, chartReceitaDespesa, chartUnidades;
    const API_BASE_URL = window.location.origin; // Usar window.location.origin para funcionar em qualquer ambiente
    
    // --- FUNÇÕES DE UTILIDADE ---
    const showSpinner = () => spinner?.classList.remove('d-none');
    const hideSpinner = () => spinner?.classList.add('d-none');
    
    const formatCurrency = (value) => {
        const number = parseFloat(value);
        if (isNaN(number)) return 'R$ 0,00';
        return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    
    // Define o período do mês atual como padrão nos filtros
    const setDateFilters = () => {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
        document.getElementById('dataInicio').value = firstDayOfMonth;
        document.getElementById('dataFim').value = lastDayOfMonth;
    };
    
    // --- LÓGICA DO DASHBOARD ---

    async function fetchDashboardData() {
        showSpinner();
        
        const unidade = document.getElementById('filtroUnidadeGlobal').value;
        const dataInicio = document.getElementById('dataInicio').value;
        const dataFim = document.getElementById('dataFim').value;
        
        const url = `${API_BASE_URL}/api/dashboard?unidade=${encodeURIComponent(unidade)}&data_inicio=${encodeURIComponent(dataInicio)}&data_fim=${encodeURIComponent(dataFim)}`;

        console.log('📊 Carregando dashboard:', { unidade, dataInicio, dataFim });
        console.log('🔗 URL:', url);

        try {
            const response = await fetch(url);
            const data = await response.json();
            
            console.log('📥 Dados recebidos:', data);
            
            if (data.error) throw new Error(data.error);
            updateDashboard(data);
        } catch (error) {
            console.error('❌ Erro:', error);
            alert(`❌ Erro ao carregar dados do dashboard: ${error.message}`);
        } finally {
            hideSpinner();
        }
    }

    function updateDashboard(data) {
        // Atualiza KPIs
        const kpis = data.kpis || {};
        document.getElementById('kpi-receita').textContent = formatCurrency(kpis.receita || 0);
        document.getElementById('kpi-despesa').textContent = formatCurrency(kpis.despesa || 0);
        document.getElementById('kpi-saldo').textContent = formatCurrency(kpis.saldo || 0);

        // Renderiza gráficos
        renderChartDespesas(data.despesas_por_categoria || {});
        renderChartReceitaDespesa(data.receita_vs_despesa || {
            labels: ['Receita', 'Despesa'],
            receitas: [kpis.receita || 0],
            despesas: [kpis.despesa || 0]
        });
        renderChartUnidades(data.performance_unidades || {});

        // Atualiza tabela de profissionais
        console.log('👥 Profissionais:', data.top_profissionais);
        renderTabelaProfissionais(data.top_profissionais || []);
    }
    
    const chartColors = [
        '#4792e0', '#f97316', '#10b981', '#ef4444', '#8b5cf6', 
        '#eab308', '#3b82f6', '#d946ef', '#64748b', '#22c55e'
    ];

    function renderChartDespesas(dados) {
        const ctx = document.getElementById('graficoDespesas')?.getContext('2d');
        if (!ctx) return;

        if (chartDespesas) chartDespesas.destroy();
        
        const labels = Object.keys(dados);
        const values = Object.values(dados);

        chartDespesas = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: chartColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed;
                                return ` ${context.label}: ${formatCurrency(value)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderChartReceitaDespesa(data) {
        const ctx = document.getElementById('graficoReceitaDespesa')?.getContext('2d');
        if (!ctx) return;
        
        if (chartReceitaDespesa) chartReceitaDespesa.destroy();
        
        chartReceitaDespesa = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Receita',
                        data: data.receitas,
                        backgroundColor: 'rgba(16,185,129,0.7)',
                        borderColor: 'rgba(16,185,129,1)',
                        borderWidth: 2
                    },
                    {
                        label: 'Despesa',
                        data: data.despesas,
                        backgroundColor: 'rgba(239,68,68,0.7)',
                        borderColor: 'rgba(239,68,68,1)',
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'rectRounded'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { display: false },
                        grid: { display: false, drawBorder: false }
                    },
                    y: { beginAtZero: true, ticks: { callback: value => formatCurrency(value) } }
                }
            }
        });
    }

    function renderChartUnidades(dados) {
        const ctx = document.getElementById('graficoUnidades')?.getContext('2d');
        if (!ctx) return;

        if (chartUnidades) chartUnidades.destroy();

        const labels = Object.keys(dados);
        const values = Object.values(dados);

        chartUnidades = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo por Unidade',
                    data: values,
                    backgroundColor: chartColors[0],
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => formatCurrency(context.parsed.x)
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: (value) => formatCurrency(value)
                        }
                    }
                }
            }
        });
    }
    
    function renderTabelaProfissionais(data) {
        const tbody = document.getElementById('tabelaTopProfissionais');
        
        if (!tbody) {
            console.error('❌ tabelaTopProfissionais não encontrado!');
            return;
        }
        
        // Limpa tbody E thead se existir
        const thead = tbody.parentElement.querySelector('thead');
        tbody.innerHTML = '';
        
        console.log('👥 Renderizando tabela com', data.length, 'profissionais');
        
        // Adiciona cabeçalho se não existir
        if (!thead) {
            const table = tbody.parentElement;
            const newThead = document.createElement('thead');
            newThead.innerHTML = `
                <tr class="table-light">
                    <th class="fw-bold">Profissional</th>
                    <th class="text-center fw-bold">Atendimentos</th>
                    <th class="text-center fw-bold">Valor/Atend.</th>
                    <th class="text-end fw-bold">Valor Total</th>
                </tr>
            `;
            table.insertBefore(newThead, tbody);
        }
        
        if (!data || data.length === 0) {
            const row = `
                <tr>
                    <td colspan="4" class="text-center text-muted py-4">
                        <i class="bi bi-inbox"></i><br>
                        Nenhum profissional para exibir.
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
            return;
        }
        
        data.forEach((p, idx) => {
            const nome = p.nome || 'N/A';
            const atendimentos = p.atendimentos || 0;
            const valor_por_atendimento = p.valor_por_atendimento || 0;
            const valor_total = p.valor_total || 0;
            
            console.log(`  ${idx + 1}. ${nome}: ${atendimentos} atend. × R$ ${valor_por_atendimento} = R$ ${valor_total}`);
            
            const row = `
                <tr>
                    <td>
                        <span class="badge bg-primary me-2">#${idx + 1}</span>
                        <strong>${nome}</strong>
                    </td>
                    <td class="text-center">
                        <span class="badge bg-info">${atendimentos}</span>
                    </td>
                    <td class="text-center text-muted">
                        ${formatCurrency(valor_por_atendimento)}
                    </td>
                    <td class="text-end fw-bold text-success">
                        ${formatCurrency(valor_total)}
                    </td>
                </tr>
            `;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    }

    // --- SINCRONIZAÇÃO COM TEMA DE ACESSIBILIDADE ---
    function updateChartThemes() {
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        const isHighContrast = document.body.classList.contains('high-contrast-mode');
        
        let textColor = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)';
        let gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

        if (isHighContrast) {
            textColor = '#FFF';
            gridColor = '#FFF';
        }

        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = gridColor;

        [chartDespesas, chartReceitaDespesa, chartUnidades].forEach(chart => {
            if (chart) chart.update();
        });
    }

    // Observa mudanças no tema para atualizar os gráficos
    new MutationObserver(updateChartThemes).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
    new MutationObserver(updateChartThemes).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // --- INICIALIZAÇÃO E EVENTOS ---
    const btnAplicarFiltros = document.getElementById('btnAplicarFiltros');
    if (btnAplicarFiltros) {
        btnAplicarFiltros.addEventListener('click', fetchDashboardData);
    }
    
    setDateFilters();
    fetchDashboardData();
});
