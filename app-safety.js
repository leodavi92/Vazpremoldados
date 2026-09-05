(function (root) {
    'use strict';
    function localDate(value = new Date()) {
        const d = value instanceof Date ? value : new Date(value);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function canonical(value) {
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
        return JSON.stringify(value);
    }
    function validateBackup(value, defaults) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || !value.config || typeof value.config !== 'object' || Array.isArray(value.config)) throw new Error('Arquivo não é um backup do app.');
        for (const key of ['inventory', 'transactions', 'sales', 'clients', 'employees']) {
            if (!Array.isArray(value[key])) throw new Error(`Lista inválida: ${key}.`);
        }
        function inspect(v) {
            if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Número inválido no backup.');
            if (!v || typeof v !== 'object') return;
            for (const k of Object.keys(v)) {
                if (['__proto__', 'constructor', 'prototype'].includes(k)) throw new Error('Conteúdo inválido no backup.');
                inspect(v[k]);
            }
        }
        inspect(value);
        const result = { ...defaults, ...value, config: { ...defaults.config, ...value.config } };
        for (const key of Object.keys(defaults)) {
            if (!Array.isArray(defaults[key])) continue;
            if (!Array.isArray(result[key])) throw new Error(`Lista inválida: ${key}.`);
            if (key === 'accounts') {
                if (result[key].some(x => typeof x !== 'string')) throw new Error('Contas inválidas.');
                continue;
            }
            const ids = new Set();
            for (const row of result[key]) {
                if (!row || typeof row !== 'object' || Array.isArray(row) || row.id == null || ids.has(String(row.id))) throw new Error(`Registro inválido ou repetido: ${key}.`);
                ids.add(String(row.id));
            }
        }
        for (const p of result.inventory) {
            if (typeof p.name !== 'string' || !Number.isFinite(p.stock)) throw new Error('Produto inválido.');
            if (p.recipe != null && (!Array.isArray(p.recipe) || p.recipe.some(r => !r || !Number.isFinite(r.qty) || r.qty <= 0 || !result.inventory.some(m => m.id === r.productId)))) throw new Error('Receita com matéria-prima inválida.');
        }
        for (const t of result.transactions) {
            if (!Number.isFinite(t.amount) || t.amount < 0 || !['entrada', 'saida'].includes(t.type)) throw new Error('Movimentação financeira inválida.');
        }
        for (const sale of result.sales) {
            if (!Number.isFinite(sale.total) || !Array.isArray(sale.items) || sale.items.some(i => !i || !Number.isFinite(i.qty) || i.qty <= 0)) throw new Error('Venda inválida.');
        }
        return result;
    }
    const api = { localDate, escapeHtml, canonical, validateBackup };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.AppSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
